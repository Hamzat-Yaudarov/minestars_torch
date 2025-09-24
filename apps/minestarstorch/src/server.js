import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { ensureSchema, pool } from './services/db.js';
import { bot, setupBot } from './services/bot.js';
import authRouter from './services/routes/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Health check
app.get('/health', (_req, res) => res.json({ ok: true }));

// API routes
app.use('/api', authRouter);

// Static MiniApp
const publicDir = path.join(__dirname, '../public');
app.use(express.static(publicDir, { extensions: ['html'] }));
app.get('/', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

const PORT = process.env.PORT || 3000;

(async () => {
  try {
    await ensureSchema();

    const useWebhook = process.env.NODE_ENV === 'production' && process.env.BASE_URL;
    await setupBot(app, useWebhook);

    app.listen(PORT, () => {
      console.log(`Server listening on :${PORT}`);
    });
  } catch (err) {
    console.error('Startup error', err);
    process.exit(1);
  }
})();

process.on('SIGINT', async () => {
  try { await bot.stop('SIGINT'); } catch {}
  try { await pool.end(); } catch {}
  process.exit(0);
});
process.on('SIGTERM', async () => {
  try { await bot.stop('SIGTERM'); } catch {}
  try { await pool.end(); } catch {}
  process.exit(0);
});
