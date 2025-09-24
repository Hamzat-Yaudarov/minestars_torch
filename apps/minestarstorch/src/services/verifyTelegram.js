import crypto from 'crypto';

export function parseInitData(initData) {
  const params = new URLSearchParams(initData);
  const data = {};
  for (const [k, v] of params.entries()) {
    data[k] = v;
  }
  return data;
}

export function checkTelegramAuth(initData) {
  if (!initData) return { ok: false, reason: 'missing initData' };
  const data = parseInitData(initData);
  const hash = data.hash;
  delete data.hash;

  const entries = Object.entries(data).sort(([a],[b]) => a.localeCompare(b));
  const dataCheckString = entries.map(([k,v]) => `${k}=${v}`).join('\n');

  const secret = crypto.createHmac('sha256', 'WebAppData').update(process.env.TG_BOT_TOKEN || '').digest();
  const computedHash = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');

  const ok = computedHash === hash;
  let user = undefined;
  try { user = JSON.parse(data.user || '{}'); } catch {}
  return { ok, user, raw: data, reason: ok ? undefined : 'bad hash' };
}
