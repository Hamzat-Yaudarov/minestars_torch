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
      stone_pickaxes integer default 0 not null,
      diamond_pickaxes integer default 0 not null,
      stars_earned_mine bigint default 0 not null,
      referral_count integer default 0 not null,
      last_daily_login date,
      created_at timestamptz default now() not null,
      updated_at timestamptz default now() not null
    );
    create index if not exists users_rubies_idx on users (rubies desc);
    create index if not exists users_mine_stars_idx on users (stars_earned_mine desc);
    alter table users add column if not exists stone_pickaxes integer default 0 not null;
    alter table users add column if not exists diamond_pickaxes integer default 0 not null;
    alter table users add column if not exists stars_earned_mine bigint default 0 not null;
    alter table users add column if not exists referral_count integer default 0 not null;
    alter table users add column if not exists last_daily_login date;
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
  return res.rows[0];
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

async function tickRuby(tg_id) {
  const res = await pool.query(
    `update users
     set rubies = rubies + (case when torch_on then 1 else 0 end), updated_at = now()
     where tg_id = $1
     returning rubies, stars, torch_on` ,
    [tg_id]
  );
  return res.rows[0] || { rubies: 0, stars: 0, torch_on: false };
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
  if (block === 'gold') {
    return randInt(270, 500);
  }
  if (block === 'diamond') {
    return randInt(475, 950);
  }
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

async function grantDailyPicks(tg_id) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query('select stone_pickaxes, last_daily_login from users where tg_id = $1 for update', [tg_id]);
    if (!rows.length) throw new Error('not_found');
    const last = rows[0].last_daily_login;
    const today = new Date();
    const todayStr = today.toISOString().slice(0,10);
    const already = last && (new Date(last).toISOString().slice(0,10) === todayStr);
    if (already) {
      await client.query('commit');
      return { granted: 0 };
    }
    const upd = await client.query(
      'update users set stone_pickaxes = stone_pickaxes + 3, last_daily_login = $2, updated_at = now() where tg_id = $1 returning stone_pickaxes',
      [tg_id, todayStr]
    );
    await client.query('commit');
    return { granted: 3, stone_pickaxes: upd.rows[0].stone_pickaxes };
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally { client.release(); }
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
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally { client.release(); }
}

async function creditReferral(tg_id, count = 1) {
  const picks = 2 * count;
  const res = await pool.query('update users set referral_count = referral_count + $2, stone_pickaxes = stone_pickaxes + $3, updated_at = now() where tg_id = $1 returning *', [tg_id, count, picks]);
  return res.rows[0];
}

async function mineAction(tg_id, pickaxe) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query('select stone_pickaxes, diamond_pickaxes, stars, stars_earned_mine from users where tg_id = $1 for update', [tg_id]);
    if (!rows.length) throw new Error('not_found');
    const user = rows[0];

    let block = null; let hitsMin = 0; let hitsMax = 0; let useField = '';
    if (pickaxe === 'stone') { block = Math.random() < 0.5 ? 'wood' : 'stone'; hitsMin = 3; hitsMax = 5; useField = 'stone_pickaxes'; }
    else if (pickaxe === 'diamond') { block = Math.random() < 0.5 ? 'gold' : 'diamond'; hitsMin = (block === 'gold') ? 2 : 4; hitsMax = (block === 'gold') ? 3 : 5; useField = 'diamond_pickaxes'; }
    else { await client.query('rollback'); return { error: 'invalid_pickaxe' }; }

    const needed = randInt(hitsMin, hitsMax);
    const available = Number(user[useField]);
    if (available < needed) { await client.query('rollback'); return { error: 'not_enough_pickaxes', needed, available, block }; }

    const starsEarned = rollStars(block);
    const nft = rollNFT(block);

    const upd = await client.query(
      `update users set ${useField} = ${useField} - $2, stars = stars + $3, stars_earned_mine = stars_earned_mine + $3, updated_at = now() where tg_id = $1 returning stone_pickaxes, diamond_pickaxes, stars, stars_earned_mine`,
      [tg_id, needed, starsEarned]
    );

    await client.query('commit');
    return { block, hits: needed, starsEarned, nft, stone_pickaxes: upd.rows[0].stone_pickaxes, diamond_pickaxes: upd.rows[0].diamond_pickaxes, stars: upd.rows[0].stars, stars_earned_mine: upd.rows[0].stars_earned_mine };
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally { client.release(); }
}

async function mineLeaders(limit = 100) {
  const res = await pool.query('select tg_id, username, first_name, last_name, photo_url, stars_earned_mine from users order by stars_earned_mine desc limit $1', [limit]);
  return res.rows;
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
  mineAction,
  mineLeaders,
};
