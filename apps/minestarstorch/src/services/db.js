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
      torch_lit boolean not null default true,
      last_rubies_update timestamptz not null default now(),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists task_claims (
      id bigserial primary key,
      user_id bigint not null references users(id) on delete cascade,
      task_key text not null,
      claimed_on date not null default current_date,
      created_at timestamptz not null default now(),
      unique (user_id, task_key, claimed_on)
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
    returning id, tg_id, username, first_name, last_name, photo_url, rubies, stars, onboarding_seen, torch_lit, last_rubies_update;
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

export async function accrueRubiesByTgId(tg_id) {
  const q = `
    with u as (
      select id, torch_lit, last_rubies_update from users where tg_id=$1
    )
    update users set
      rubies = users.rubies + case when u.torch_lit then cast(extract(epoch from (now() - u.last_rubies_update)) as bigint) else 0 end,
      last_rubies_update = now()
    from u
    where users.tg_id=$1
    returning users.*;
  `;
  const { rows } = await pool.query(q, [tg_id]);
  return rows[0] || null;
}

export async function claimDailyTask(tg_id, task_key, amount) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows: urows } = await client.query('select id from users where tg_id=$1', [tg_id]);
    if (!urows[0]) throw new Error('user not found');
    const userId = urows[0].id;

    const ins = await client.query(
      'insert into task_claims (user_id, task_key) values ($1,$2) on conflict do nothing returning id',
      [userId, task_key]
    );
    if (ins.rowCount === 0) {
      await client.query('commit');
      return { ok: false, reason: 'already_claimed' };
    }
    await client.query('update users set rubies = rubies + $1 where id=$2', [amount, userId]);
    const { rows } = await client.query('select * from users where id=$1', [userId]);
    await client.query('commit');
    return { ok: true, user: rows[0] };
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
}

export async function getLeaderboard(limit = 100) {
  const { rows } = await pool.query(
    'select tg_id, username, first_name, last_name, photo_url, rubies from users order by rubies desc limit $1',
    [limit]
  );
  return rows;
}
