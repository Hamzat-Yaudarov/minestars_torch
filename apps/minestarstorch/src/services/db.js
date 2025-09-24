import pg from 'pg';

const { Pool } = pg;

const connectionString = process.env.NEON_DATABASE_URL;
if (!connectionString) {
  console.warn('NEON_DATABASE_URL is not set. DB features will fail.');
}

export const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
});

export async function ensureSchema() {
  if (!connectionString) return;
  await pool.query(`
    create table if not exists users (
      id bigserial primary key,
      tg_id bigint unique not null,
      username text,
      first_name text,
      last_name text,
      photo_url text,
      rubies bigint not null default 0,
      stars bigint not null default 0,
      onboarding_seen boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create or replace function set_updated_at()
    returns trigger as $$
    begin
      new.updated_at = now();
      return new;
    end;
    $$ language plpgsql;
    drop trigger if exists trg_set_updated_at on users;
    create trigger trg_set_updated_at before update on users
    for each row execute function set_updated_at();
  `);
}

export async function upsertUser({ tg_id, username, first_name, last_name, photo_url }) {
  const q = `
    insert into users (tg_id, username, first_name, last_name, photo_url)
    values ($1,$2,$3,$4,$5)
    on conflict (tg_id) do update set
      username = excluded.username,
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      photo_url = excluded.photo_url,
      updated_at = now()
    returning id, tg_id, username, first_name, last_name, photo_url, rubies, stars, onboarding_seen;
  `;
  const { rows } = await pool.query(q, [tg_id, username, first_name, last_name, photo_url]);
  return rows[0];
}

export async function getUserByTgId(tg_id) {
  const { rows } = await pool.query('select * from users where tg_id=$1', [tg_id]);
  return rows[0] || null;
}

export async function setOnboardingSeen(tg_id) {
  const { rows } = await pool.query(
    'update users set onboarding_seen=true where tg_id=$1 returning *',
    [tg_id]
  );
  return rows[0] || null;
}
