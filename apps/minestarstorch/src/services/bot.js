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
    app.use(path, bot.webhookCallback(path));
    const url = `${process.env.BASE_URL}${path}`;
    const info = await bot.telegram.getWebhookInfo();
    if (info.url !== url) {
      await bot.telegram.setWebhook(url);
    }
    console.log('Bot using webhook at', url);
  } else {
    await bot.launch();
    console.log('Bot started with long polling');
  }
}
