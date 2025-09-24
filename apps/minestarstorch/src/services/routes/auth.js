import { Router } from 'express';
import { checkTelegramAuth } from '../verifyTelegram.js';
import { upsertUser, getUserByTgId, setOnboardingSeen, accrueRubiesByTgId, claimDailyTask, getLeaderboard } from '../db.js';

const router = Router();

router.post('/auth', async (req, res) => {
  const initData = req.body?.initData;
  const { ok, user, reason } = checkTelegramAuth(initData);
  if (!ok || !user?.id) return res.status(401).json({ ok: false, error: reason || 'unauthorized' });

  await upsertUser({
    tg_id: user.id,
    username: user.username || null,
    first_name: user.first_name || null,
    last_name: user.last_name || null,
    photo_url: user.photo_url || null,
  });

  const profile = await accrueRubiesByTgId(user.id);
  return res.json({ ok: true, user: profile });
});

router.get('/me', async (req, res) => {
  const initData = req.header('x-telegram-init') || req.query.initData;
  const { ok, user } = checkTelegramAuth(initData);
  if (!ok || !user?.id) return res.status(401).json({ ok: false });
  const profile = await accrueRubiesByTgId(user.id);
  return res.json({ ok: true, user: profile });
});

router.post('/tick', async (req, res) => {
  const initData = req.body?.initData;
  const { ok, user } = checkTelegramAuth(initData);
  if (!ok || !user?.id) return res.status(401).json({ ok: false });
  const profile = await accrueRubiesByTgId(user.id);
  return res.json({ ok: true, user: profile });
});

router.post('/tasks/claim', async (req, res) => {
  const initData = req.body?.initData;
  const { taskKey } = req.body || {};
  const { ok, user } = checkTelegramAuth(initData);
  if (!ok || !user?.id) return res.status(401).json({ ok: false });
  let amount = 0;
  if (taskKey === 'daily_bonus') amount = 3000;
  else if (taskKey === 'share_story') amount = 15000;
  else return res.status(400).json({ ok: false, error: 'unknown_task' });

  const result = await claimDailyTask(user.id, taskKey, amount);
  if (!result.ok) return res.status(409).json({ ok: false, error: result.reason });
  return res.json({ ok: true, user: result.user });
});

router.post('/leaderboard', async (req, res) => {
  const initData = req.body?.initData;
  const { ok } = checkTelegramAuth(initData);
  if (!ok) return res.status(401).json({ ok: false });
  const rows = await getLeaderboard(100);
  return res.json({ ok: true, leaders: rows });
});

router.post('/onboarding/complete', async (req, res) => {
  const initData = req.body?.initData;
  const { ok, user } = checkTelegramAuth(initData);
  if (!ok || !user?.id) return res.status(401).json({ ok: false });
  const updated = await setOnboardingSeen(user.id);
  return res.json({ ok: true, user: updated });
});

export default router;
