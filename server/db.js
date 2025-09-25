const { Pool } = require('pg');

const connectionString = process.env.NEON_DATABASE_URL;
if (!connectionString) {
  console.warn('NEON_DATABASE_URL is not set');
}

const pool = new Pool({ connectionString });

async function ensureSchema() {
  await pool.query(`
    create table if not exists users (
      tg_id bigint primary key,
      username text,
      first_name text,
      last_name text,
      photo_url text,
      rubies bigint default 0 not null,
      stars bigint default 0 not null,
      torch_on boolean default true not null,
      onboarding_seen boolean default false not null,
      created_at timestamptz default now() not null,
      updated_at timestamptz default now() not null
    );
    alter table users add column if not exists stone_pickaxes integer default 0 not null;
    alter table users add column if not exists diamond_pickaxes integer default 0 not null;
    alter table users add column if not exists stars_earned_mine bigint default 0 not null;
    alter table users add column if not exists referral_count integer default 0 not null;
    alter table users add column if not exists last_daily_login date;
    alter table users add column if not exists stone_block_type text;
    alter table users add column if not exists stone_hits_required integer;
    alter table users add column if not exists stone_hits_done integer;
    alter table users add column if not exists diamond_block_type text;
    alter table users add column if not exists diamond_hits_required integer;
    alter table users add column if not exists diamond_hits_done integer;

    -- Torch lifecycle columns
    alter table users add column if not exists torch_started_at timestamptz default now();
    alter table users add column if not exists extinguish_week_start date;
    alter table users add column if not exists extinguish_count_week integer default 0 not null;

    create index if not exists users_rubies_idx on users (rubies desc);
    create index if not exists users_mine_stars_idx on users (stars_earned_mine desc);

    create table if not exists user_nfts (
      id bigserial primary key,
      tg_id bigint not null,
      name text not null,
      obtained_at timestamptz default now() not null
    );
    create index if not exists user_nfts_tg_idx on user_nfts (tg_id);
  `);
}

async function upsertUser({ tg_id, username, first_name, last_name, photo_url }) {
  const res = await pool.query(
    `insert into users (tg_id, username, first_name, last_name, photo_url)
     values ($1,$2,$3,$4,$5)
     on conflict (tg_id) do update set
       username = excluded.username,
       first_name = excluded.first_name,
       last_name = excluded.last_name,
       photo_url = excluded.photo_url,
       updated_at = now()
     returning *`,
    [tg_id, username || null, first_name || null, last_name || null, photo_url || null]
  );
  const u = res.rows[0];
  if (!u.torch_started_at) {
    const fixed = await initTorchIfMissing(tg_id);
    return fixed || u;
  }
  return u;
}

async function getUser(tg_id) {
  const res = await pool.query('select * from users where tg_id = $1', [tg_id]);
  return res.rows[0] || null;
}

async function setOnboardingSeen(tg_id) {
  const res = await pool.query(
    'update users set onboarding_seen = true, updated_at = now() where tg_id = $1 returning *',
    [tg_id]
  );
  return res.rows[0] || null;
}

async function initTorchIfMissing(tg_id) {
  const wk = await pool.query("select (date_trunc('week', now()))::date as wk");
  const currentWeek = wk.rows[0].wk;
  const res = await pool.query(
    `update users set torch_on = true, torch_started_at = now(), extinguish_count_week = 0, extinguish_week_start = $2, updated_at = now()
     where tg_id = $1 and torch_started_at is null
     returning *`,
    [tg_id, currentWeek]
  );
  return res.rows[0] || null;
}

function secondsLeftFrom(nowMs, startAt) {
  const end = new Date(startAt.getTime() + 24 * 60 * 60 * 1000);
  const diff = Math.floor((end.getTime() - nowMs) / 1000);
  return Math.max(0, diff);
}

async function ensureTorchState(tg_id, client) {
  const c = client || (await pool.connect());
  let release = false;
  try {
    if (!client) { release = true; await c.query('begin'); }
    const row = await c.query('select tg_id, rubies, torch_on, torch_started_at, extinguish_week_start, extinguish_count_week from users where tg_id = $1 for update', [tg_id]);
    if (!row.rows.length) { if (!client) { await c.query('rollback'); } return null; }
    const u = row.rows[0];
    const now = new Date();
    const startedAt = u.torch_started_at ? new Date(u.torch_started_at) : new Date();
    const secondsLeft = secondsLeftFrom(now.getTime(), startedAt);

    let torchOn = !!u.torch_on;
    let rubies = Number(u.rubies || 0);
    let weekStart = u.extinguish_week_start ? new Date(u.extinguish_week_start) : null;
    let count = Number(u.extinguish_count_week || 0);

    if (torchOn && secondsLeft === 0) {
      const wk = await c.query("select (date_trunc('week', now()))::date as wk");
      const currentWeek = wk.rows[0].wk;
      const sameWeek = weekStart && (new Date(weekStart).toISOString().slice(0,10) === new Date(currentWeek).toISOString().slice(0,10));
      let newCount = sameWeek ? count + 1 : 1;

      let newRubies = rubies;
      if (newCount === 1) newRubies = Math.floor(rubies * 0.5);
      if (newCount >= 2) newRubies = 0;

      const upd = await c.query(
        `update users set torch_on = false, rubies = $2, extinguish_count_week = $3, extinguish_week_start = $4, updated_at = now() where tg_id = $1 returning torch_on, rubies, extinguish_count_week`,
        [tg_id, newRubies, newCount, currentWeek]
      );
      torchOn = upd.rows[0].torch_on;
      rubies = Number(upd.rows[0].rubies);
      count = Number(upd.rows[0].extinguish_count_week);
    }

    if (!client) { await c.query('commit'); }
    return { torch_on: torchOn, seconds_left: secondsLeft, rubies, extinguish_count_week: count };
  } catch (e) {
    if (!client) { await c.query('rollback'); }
    throw e;
  } finally {
    if (release) c.release();
  }
}

async function tickRuby(tg_id) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const state = await ensureTorchState(tg_id, client);
    if (!state) { await client.query('rollback'); return { rubies: 0, stars: 0, torch_on: false, seconds_left: 0 }; }

    let rubies = Number(state.rubies);
    let torchOn = !!state.torch_on;
    let secondsLeft = state.seconds_left;

    if (torchOn && secondsLeft > 0) {
      const upd = await client.query('update users set rubies = rubies + 1, updated_at = now() where tg_id = $1 returning rubies, stars, torch_on', [tg_id]);
      rubies = Number(upd.rows[0].rubies);
      torchOn = !!upd.rows[0].torch_on;
    }

    await client.query('commit');
    const sleft = Math.max(0, secondsLeft - 1);
    return { rubies, stars: 0, torch_on: torchOn, seconds_left: sleft };
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
}

async function topLeaders(limit = 100) {
  const res = await pool.query(
    'select tg_id, username, first_name, last_name, photo_url, rubies from users order by rubies desc limit $1',
    [limit]
  );
  return res.rows;
}

function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function chance(pct) { return Math.random() * 100 < pct; }
function weightedPick(weights) {
  const r = Math.random() * 100;
  let acc = 0;
  for (const [value, w] of weights) { acc += w; if (r < acc) return value; }
  return weights[weights.length - 1][0];
}

function pickBlockFor(pickaxe) {
  if (pickaxe === 'stone') return Math.random() < 0.5 ? 'wood' : 'stone';
  return Math.random() < 0.5 ? 'gold' : 'diamond';
}

function hitsRange(block) {
  if (block === 'wood' || block === 'stone') return [3, 5];
  if (block === 'gold') return [2, 3];
  if (block === 'diamond') return [4, 5];
  return [3, 5];
}

function rollStars(block) {
  if (block === 'wood') {
    const bucket = weightedPick([[ '2-8', 55 ], [ '9-15', 40 ], [ '16-20', 5 ]]);
    if (bucket === '2-8') return randInt(2, 8);
    if (bucket === '9-15') return randInt(9, 15);
    return randInt(16, 20);
  }
  if (block === 'stone') {
    const bucket = weightedPick([[ '4-10', 55 ], [ '11-18', 40 ], [ '18-24', 5 ]]);
    if (bucket === '4-10') return randInt(4, 10);
    if (bucket === '11-18') return randInt(11, 18);
    return randInt(18, 24);
  }
  if (block === 'gold') return randInt(270, 500);
  if (block === 'diamond') return randInt(475, 950);
  return 0;
}

function rollNFT(block) {
  let dropPct = 0; let table = [];
  if (block === 'wood') { dropPct = 3; table = [['Snoop Dogg', 50], ['Swag Bag', 28], ['Easter Egg', 16], ['Snoop Cigar', 5], ['Low Rider', 1]]; }
  if (block === 'stone') { dropPct = 5; table = [['Snoop Dogg', 45], ['Swag Bag', 28], ['Easter Egg', 18], ['Snoop Cigar', 7], ['Low Rider', 2]]; }
  if (block === 'gold') { dropPct = 25; table = [['Snoop Dogg', 41], ['Swag Bag', 27], ['Easter Egg', 20], ['Snoop Cigar', 9], ['Low Rider', 3]]; }
  if (block === 'diamond') { dropPct = 35; table = [['Snoop Dogg', 38], ['Swag Bag', 25], ['Easter Egg', 22], ['Snoop Cigar', 11], ['Low Rider', 4]]; }
  if (!chance(dropPct)) return null;
  return weightedPick(table);
}

async function ensureMineBlocks(tg_id) {
  const u = await getUser(tg_id);
  if (!u) return null;
  let stone_type = u.stone_block_type;
  let diamond_type = u.diamond_block_type;
  let stone_req = u.stone_hits_required;
  let stone_done = u.stone_hits_done;
  let diamond_req = u.diamond_hits_required;
  let diamond_done = u.diamond_hits_done;
  const updates = [];
  if (!stone_type || !stone_req) {
    stone_type = pickBlockFor('stone'); const [a,b] = hitsRange(stone_type); stone_req = randInt(a,b); stone_done = 0;
    updates.push(`stone_block_type='${stone_type}', stone_hits_required=${stone_req}, stone_hits_done=0`);
  }
  if (!diamond_type || !diamond_req) {
    diamond_type = pickBlockFor('diamond'); const [a,b] = hitsRange(diamond_type); diamond_req = randInt(a,b); diamond_done = 0;
    updates.push(`diamond_block_type='${diamond_type}', diamond_hits_required=${diamond_req}, diamond_hits_done=0`);
  }
  if (updates.length) {
    await pool.query(`update users set ${updates.join(', ')}, updated_at = now() where tg_id = $1`, [tg_id]);
  }
  return { stone_type, stone_req, stone_done, diamond_type, diamond_req, diamond_done };
}

async function grantDailyPicks(tg_id) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query('select stone_pickaxes, last_daily_login from users where tg_id = $1 for update', [tg_id]);
    if (!rows.length) throw new Error('not_found');
    const last = rows[0].last_daily_login;
    const todayStr = new Date().toISOString().slice(0,10);
    const already = last && (new Date(last).toISOString().slice(0,10) === todayStr);
    if (already) { await client.query('commit'); return { granted: 0 }; }
    const upd = await client.query('update users set stone_pickaxes = stone_pickaxes + 3, last_daily_login = $2, updated_at = now() where tg_id = $1 returning stone_pickaxes', [tg_id, todayStr]);
    await client.query('commit');
    return { granted: 3, stone_pickaxes: upd.rows[0].stone_pickaxes };
  } catch (e) { await client.query('rollback'); throw e; } finally { client.release(); }
}

async function purchaseDiamondPick(tg_id) {
  const cost = 150;
  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query('select stars, diamond_pickaxes from users where tg_id = $1 for update', [tg_id]);
    if (!rows.length) throw new Error('not_found');
    if (Number(rows[0].stars) < cost) { await client.query('rollback'); return { error: 'not_enough_stars' }; }
    const upd = await client.query('update users set stars = stars - $2, diamond_pickaxes = diamond_pickaxes + 1, updated_at = now() where tg_id = $1 returning stars, diamond_pickaxes', [tg_id, cost]);
    await client.query('commit');
    return upd.rows[0];
  } catch (e) { await client.query('rollback'); throw e; } finally { client.release(); }
}

async function creditReferral(tg_id, count = 1) {
  const picks = 2 * count;
  const res = await pool.query('update users set referral_count = referral_count + $2, stone_pickaxes = stone_pickaxes + $3, updated_at = now() where tg_id = $1 returning *', [tg_id, count, picks]);
  return res.rows[0];
}

async function mineState(tg_id) {
  await ensureMineBlocks(tg_id);
  const res = await pool.query('select stone_pickaxes, diamond_pickaxes, stars, stars_earned_mine, stone_block_type, stone_hits_required, stone_hits_done, diamond_block_type, diamond_hits_required, diamond_hits_done from users where tg_id = $1', [tg_id]);
  const u = res.rows[0];
  return {
    stone_pickaxes: u.stone_pickaxes,
    diamond_pickaxes: u.diamond_pickaxes,
    stars: u.stars,
    stars_earned_mine: u.stars_earned_mine,
    stone: { type: u.stone_block_type, required: u.stone_hits_required, done: u.stone_hits_done, left: Math.max(0, u.stone_hits_required - u.stone_hits_done) },
    diamond: { type: u.diamond_block_type, required: u.diamond_hits_required, done: u.diamond_hits_done, left: Math.max(0, u.diamond_hits_required - u.diamond_hits_done) },
  };
}

async function mineHit(tg_id, pickaxe) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const row = await client.query('select * from users where tg_id = $1 for update', [tg_id]);
    if (!row.rows.length) throw new Error('not_found');
    const u = row.rows[0];
    const isStone = pickaxe === 'stone';
    const countField = isStone ? 'stone_pickaxes' : 'diamond_pickaxes';
    const typeField = isStone ? 'stone_block_type' : 'diamond_block_type';
    const reqField = isStone ? 'stone_hits_required' : 'diamond_hits_required';
    const doneField = isStone ? 'stone_hits_done' : 'diamond_hits_done';

    const available = Number(u[countField] || 0);
    if (available <= 0) { await client.query('rollback'); return { error: 'not_enough_pickaxes' }; }

    let type = u[typeField];
    let required = u[reqField];
    let done = u[doneField] || 0;

    if (!type || !required) {
      type = pickBlockFor(pickaxe); const [a,b] = hitsRange(type); required = randInt(a,b); done = 0;
    }

    const newDone = done + 1;
    let reward = null;
    let nft = null;
    let starsAfter = Number(u.stars);
    let starsEarnedMine = Number(u.stars_earned_mine);
    let newType = type; let newReq = required; let newDonePersist = newDone;

    if (newDone >= required) {
      const starsEarned = rollStars(type);
      nft = rollNFT(type);
      starsAfter += starsEarned;
      starsEarnedMine += starsEarned;
      newType = pickBlockFor(pickaxe);
      const [aa,bb] = hitsRange(newType);
      newReq = randInt(aa,bb);
      newDonePersist = 0;
      reward = { starsEarned, nft, block: type, completed: true };
    }

    const upd = await client.query(
      `update users set ${countField} = ${countField} - 1, ${typeField} = $2, ${reqField} = $3, ${doneField} = $4, stars = $5, stars_earned_mine = $6, updated_at = now() where tg_id = $1 returning stone_pickaxes, diamond_pickaxes, stars, stars_earned_mine, ${typeField} as type, ${reqField} as required, ${doneField} as done`,
      [tg_id, newType, newReq, newDonePersist, starsAfter, starsEarnedMine]
    );

    if (nft) { await client.query('insert into user_nfts (tg_id, name) values ($1,$2)', [tg_id, nft]); }
    await client.query('commit');
    const r = upd.rows[0];
    return {
      pickaxe,
      stone_pickaxes: r.stone_pickaxes,
      diamond_pickaxes: r.diamond_pickaxes,
      stars: r.stars,
      stars_earned_mine: r.stars_earned_mine,
      block: r.type,
      required: r.required,
      done: r.done,
      left: Math.max(0, r.required - r.done),
      reward,
    };
  } catch (e) { await client.query('rollback'); throw e; } finally { client.release(); }
}

async function mineLeaders(limit = 100) {
  const res = await pool.query('select tg_id, username, first_name, last_name, photo_url, stars_earned_mine from users order by stars_earned_mine desc limit $1', [limit]);
  return res.rows;
}

async function getUserNfts(tg_id) {
  const res = await pool.query('select name, count(*)::int as count from user_nfts where tg_id = $1 group by name order by count desc', [tg_id]);
  return res.rows;
}

async function torchState(tg_id) {
  const state = await ensureTorchState(tg_id);
  if (!state) return { torch_on: false, seconds_left: 0, extinguish_count_week: 0 };
  return state;
}

module.exports = {
  pool,
  ensureSchema,
  upsertUser,
  getUser,
  setOnboardingSeen,
  tickRuby,
  topLeaders,
  grantDailyPicks,
  purchaseDiamondPick,
  creditReferral,
  mineState,
  mineHit,
  mineLeaders,
  getUserNfts,
  torchState,
};
