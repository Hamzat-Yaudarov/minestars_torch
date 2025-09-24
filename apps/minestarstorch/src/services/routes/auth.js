import { Router } from 'express';
import { checkTelegramAuth } from '../verifyTelegram.js';
import { upsertUser, getUserByTgId, setOnboardingSeen } from '../db.js';

const router = Router();

router.post('/auth', async (req, res) => {
  const initData = req.body?.initData;
  const { ok, user, reason } = checkTelegramAuth(initData);
  if (!ok || !user?.id) return res.status(401).json({ ok: false, error: reason || 'unauthorized' });

  const profile = await upsertUser({
    tg_id: user.id,
    username: user.username || null,
    first_name: user.first_name || null,
    last_name: user.last_name || null,
    photo_url: user.photo_url || null,
  });

  return res.json({ ok: true, user: profile });
});

router.get('/me', async (req, res) => {
  const initData = req.header('x-telegram-init') || req.query.initData;
  const { ok, user } = checkTelegramAuth(initData);
  if (!ok || !user?.id) return res.status(401).json({ ok: false });
  const profile = await getUserByTgId(user.id);
  return res.json({ ok: true, user: profile });
});

router.post('/onboarding/complete', async (req, res) => {
  const initData = req.body?.initData;
  const { ok, user } = checkTelegramAuth(initData);
  if (!ok || !user?.id) return res.status(401).json({ ok: false });
  const updated = await setOnboardingSeen(user.id);
  return res.json({ ok: true, user: updated });
});

export default router;
