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
  getUserNfts,
  buyReferralTimeBonus,
  buyEternalTorch,
  exchange,
  recordPayment,
  addStars,
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
// Serve audio assets
app.use('/muzik', express.static(path.join(__dirname, '..', 'muzik')));

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

// Shop: exchange
app.post('/api/shop/exchange', async (req, res) => {
  try {
    const tg_id = Number(req.body.user_id);
    const { direction, amount } = req.body;
    if (!tg_id) return res.status(400).json({ error: 'user_id required' });
    const r = await exchange(tg_id, direction, amount);
    if (r && r.error) return res.status(400).json(r);
    res.json(r);
  } catch (e) { console.error(e); res.status(500).json({ error: 'internal_error' }); }
});

app.post('/api/shop/buy-referral-bonus', async (req, res) => {
  try {
    const tg_id = Number(req.body.user_id);
    if (!tg_id) return res.status(400).json({ error: 'user_id required' });
    const r = await buyReferralTimeBonus(tg_id);
    if (r && r.error) return res.status(400).json(r);
    res.json(r);
  } catch (e) { console.error(e); res.status(500).json({ error: 'internal_error' }); }
});

app.post('/api/shop/buy-eternal', async (req, res) => {
  try {
    const tg_id = Number(req.body.user_id);
    if (!tg_id) return res.status(400).json({ error: 'user_id required' });
    const r = await buyEternalTorch(tg_id);
    if (r && r.error) return res.status(400).json(r);
    res.json(r);
  } catch (e) { console.error(e); res.status(500).json({ error: 'internal_error' }); }
});

// Payments (Telegram Stars)
app.post('/api/payments/create-invoice', async (req, res) => {
  try {
    const tg_id = Number(req.body.user_id);
    const stars = Math.max(1, Math.floor(Number(req.body.stars||0)));
    if (!tg_id) return res.status(400).json({ error: 'user_id required' });
    if (!bot) return res.status(500).json({ error: 'bot_unavailable' });
    const payload = `stars_${tg_id}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const title = 'Пакет игровых звёзд';
    const description = 'Пополнение игровых ⭐ через Telegram Stars';
    const prices = [{ label: '⭐', amount: stars }];
    const invoiceLink = await bot.telegram.createInvoiceLink({ title, description, payload, provider_token: undefined, currency: 'XTR', prices });
    res.json({ link: invoiceLink, payload });
  } catch (e) { console.error(e); res.status(500).json({ error: 'internal_error' }); }
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

// Inventory API
app.get('/api/inventory', async (req, res) => {
  try {
    const tg_id = Number(req.query.user_id);
    if (!tg_id) return res.status(400).json({ error: 'user_id required' });
    const items = await getUserNfts(tg_id);
    res.json(items);
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

  bot.on('pre_checkout_query', async (ctx) => { try { await ctx.answerPreCheckoutQuery(true); } catch(e){ console.error('pre_checkout', e); } });

  bot.on('message', async (ctx) => {
    try {
      const m = ctx.message;
      if (m && m.successful_payment) {
        const sp = m.successful_payment;
        const tg_id = ctx.from.id;
        const currency = sp.currency;
        const total = Number(sp.total_amount || 0);
        let starsCredited = 0;
        if (currency === 'XTR') { starsCredited = total; }
        if (starsCredited > 0) {
          await addStars(tg_id, starsCredited);
          await recordPayment(tg_id, sp.invoice_payload || '', currency, total, starsCredited);
          await ctx.reply(`Зачислено ⭐ ${starsCredited}. Спасибо!`);
        }
      }
    } catch (e) { console.error('payment message error', e); }
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
