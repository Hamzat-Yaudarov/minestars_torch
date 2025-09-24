import { Telegraf, Markup } from 'telegraf';

export const bot = new Telegraf(process.env.TG_BOT_TOKEN || '');

bot.start(async (ctx) => {
  const name = ctx.from?.first_name ? `, ${ctx.from.first_name}` : '';
  const baseUrl = process.env.BASE_URL || 'https://example.com';
  const text = `Привет${name}! Добро пожаловать в MineStars Torch.\nНажми кнопку ниже, чтобы открыть игру.`;
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.webApp('Открыть игру', baseUrl)]
  ]);
  try {
    await ctx.reply(text, keyboard);
  } catch (e) {
    console.error('Failed to send start message', e);
  }
});

export async function setupBot(app, useWebhook) {
  if (!process.env.TG_BOT_TOKEN) {
    console.warn('TG_BOT_TOKEN is not set. Bot will not start.');
    return;
  }
  if (useWebhook) {
    const path = '/telegram/webhook';
    // In Express, when mounting at a path, req.url is stripped to '/'.
    // Do not pass the path into webhookCallback; mount explicit methods and add logging.
    app.get(path, (_req, res) => res.status(200).send('OK'));
    app.post(path, (req, _res, next) => {
      try {
        const text = req.body?.message?.text || req.body?.callback_query?.data;
        const from = req.body?.message?.from?.id || req.body?.callback_query?.from?.id;
        console.log('Webhook POST update', { text, from, update_id: req.body?.update_id });
      } catch {}
      next();
    }, bot.webhookCallback());

    const url = `${process.env.BASE_URL}${path}`;
    try {
      await bot.telegram.setWebhook(url);
    } catch (e) {
      console.error('setWebhook failed', e);
    }
    console.log('Bot using webhook at', url);
  } else {
    await bot.launch();
    console.log('Bot started with long polling');
  }
}
