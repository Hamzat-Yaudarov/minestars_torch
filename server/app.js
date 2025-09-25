const express = require('express');
const path = require('path');
const cors = require('cors');
const { Telegraf } = require('telegraf');
const bodyParser = require('body-parser');
const {
  ensureSchema,
  upsertUser,
  getUser,
  setOnboardingSeen,
  tickRuby,
  topLeaders,
  grantDailyPicks,
  purchaseDiamondPick,
  mineState,
  mineHit,
  mineLeaders,
} = require('./db');

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const BOT_TOKEN = process.env.TG_BOT_TOKEN;
const BOT_USERNAME = process.env.BOT_USERNAME || '';

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static MiniApp
app.use('/miniapp', express.static(path.join(__dirname, '..', 'public', 'miniapp')));

// API routes
app.get('/api/user', async (req, res) => {
  try {
    const tg_id = Number(req.query.user_id);
    if (!tg_id) return res.status(400).json({ error: 'user_id required' });

    const userData = {
      tg_id,
      username: req.query.username,
      first_name: req.query.first_name,
      last_name: req.query.last_name,
      photo_url: req.query.photo_url,
    };
    const user = await upsertUser(userData);
    res.json(user);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal_error' });
  }
});

app.post('/api/onboarding-seen', async (req, res) => {
  try {
    const tg_id = Number(req.body.user_id);
    if (!tg_id) return res.status(400).json({ error: 'user_id required' });
    const user = await setOnboardingSeen(tg_id);
    res.json(user || { ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal_error' });
  }
});

app.post('/api/tick', async (req, res) => {
  try {
    const tg_id = Number(req.body.user_id);
    if (!tg_id) return res.status(400).json({ error: 'user_id required' });
    const row = await tickRuby(tg_id);
    res.json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal_error' });
  }
});

app.get('/api/leaderboard', async (_req, res) => {
  try {
    const rows = await topLeaders(100);
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Mining API
app.get('/api/mine/state', async (req, res) => {
  try {
    const tg_id = Number(req.query.user_id);
    if (!tg_id) return res.status(400).json({ error: 'user_id required' });
    const s = await mineState(tg_id);
    res.json(s);
  } catch (e) { console.error(e); res.status(500).json({ error: 'internal_error' }); }
});

app.post('/api/mine/daily-claim', async (req, res) => {
  try {
    const tg_id = Number(req.body.user_id);
    if (!tg_id) return res.status(400).json({ error: 'user_id required' });
    const r = await grantDailyPicks(tg_id);
    res.json(r);
  } catch (e) { console.error(e); res.status(500).json({ error: 'internal_error' }); }
});

app.post('/api/mine/purchase-dpick', async (req, res) => {
  try {
    const tg_id = Number(req.body.user_id);
    if (!tg_id) return res.status(400).json({ error: 'user_id required' });
    const r = await purchaseDiamondPick(tg_id);
    if (r && r.error) return res.status(400).json(r);
    res.json(r);
  } catch (e) { console.error(e); res.status(500).json({ error: 'internal_error' }); }
});

app.post('/api/mine/hit', async (req, res) => {
  try {
    const tg_id = Number(req.body.user_id);
    const pickaxe = req.body.pickaxe;
    if (!tg_id) return res.status(400).json({ error: 'user_id required' });
    if (pickaxe !== 'stone' && pickaxe !== 'diamond') return res.status(400).json({ error: 'invalid_pickaxe' });
    const r = await mineHit(tg_id, pickaxe);
    if (r && r.error) return res.status(400).json(r);
    res.json(r);
  } catch (e) { console.error(e); res.status(500).json({ error: 'internal_error' }); }
});

app.get('/api/mine/leaderboard', async (_req, res) => {
  try {
    const rows = await mineLeaders(100);
    res.json(rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'internal_error' }); }
});

// Telegram bot webhook
let bot = null;
if (BOT_TOKEN) {
  bot = new Telegraf(BOT_TOKEN);

  bot.start(async (ctx) => {
    try {
      const user = ctx.from || {};
      await upsertUser({
        tg_id: user.id,
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name,
        photo_url: user.photo_url,
      });
      const text = 'Добро пожаловать в MineStars Torch! Откройте игру ниже.';
      const url = `${BASE_URL}/miniapp/`;
      await ctx.reply(text, {
        reply_markup: { inline_keyboard: [[ { text: 'Открыть игру', web_app: { url } } ]] },
      });
    } catch (e) {
      console.error('start error', e);
      await ctx.reply('Произошла ошибка, попробуйте позже.');
    }
  });

  app.use(bot.webhookCallback('/bot'));

  bot.telegram.setWebhook(`${BASE_URL}/bot`).then(() => {
    console.log('Webhook set to', `${BASE_URL}/bot`);
  }).catch((e) => console.error('Webhook error', e));
} else {
  console.warn('TG_BOT_TOKEN not set; bot disabled');
}

app.get('/health', (_req, res) => res.json({ ok: true }));

ensureSchema()
  .then(() => { app.listen(PORT, () => console.log(`Server on ${PORT}`)); })
  .catch((e) => { console.error('Schema init failed', e); process.exit(1); });
