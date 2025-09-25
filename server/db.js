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
    create index if not exists users_rubies_idx on users (rubies desc);
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
     returning rubies, stars, torch_on`,
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

module.exports = {
  pool,
  ensureSchema,
  upsertUser,
  getUser,
  setOnboardingSeen,
  tickRuby,
  topLeaders,
};
