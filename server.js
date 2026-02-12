require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const { Bot, InlineKeyboard, webhookCallback } = require('grammy');

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL;

if (!BOT_TOKEN || !WEBAPP_URL) {
  console.error('Missing BOT_TOKEN or WEBAPP_URL in .env');
  process.exit(1);
}

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

// Dashboard React app (собранный build из /dashboard)
const dashboardPath = path.join(__dirname, 'dashboard', 'dist');
app.use('/dashboard', express.static(dashboardPath));
app.get('/dashboard*', (req, res) => {
  res.sendFile(path.join(dashboardPath, 'index.html'));
});

/**
 * Validates Telegram initData using HMAC-SHA256.
 * @see https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
function validateInitData(initData, botToken) {
  const params = new URLSearchParams(initData.replace(/&&/g, '&'));
  const hash = params.get('hash');
  if (!hash) return null;

  params.delete('hash');
  const pairs = [...params.entries()]
    .filter(([k]) => k)
    .sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = pairs.map(([k, v]) => `${k}=${v}`).join('\n');

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();
  const computedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  if (computedHash !== hash) return null;
  return params;
}

app.post('/api/me', (req, res) => {
  const { initData } = req.body;
  if (!initData) {
    return res.status(400).json({ ok: false, error: 'initData required' });
  }

  const params = validateInitData(initData, BOT_TOKEN);
  if (!params) {
    return res.status(401).json({ ok: false, error: 'Invalid signature' });
  }

  const userJson = params.get('user');
  if (!userJson) {
    return res.status(400).json({ ok: false, error: 'user not found in initData' });
  }

  let user;
  try {
    user = JSON.parse(userJson);
  } catch {
    return res.status(400).json({ ok: false, error: 'Invalid user JSON' });
  }

  res.json({ ok: true, user });
});

// --- Stats API (динамическая заглушка — пример как будет выглядеть) ---
function generateStubStats() {
  const baseTime = Date.now() / 1000;
  const uptime = Math.floor((baseTime % 86400) + 3600 * 12); // ~12ч + случайное
  const used = 2.1 * 1024 * 1024 * 1024;
  const total = 4 * 1024 * 1024 * 1024;
  const cpuUsage = 12 + Math.floor((baseTime % 30));
  const connections = 47 + Math.floor((baseTime % 20));
  const rx = 15.2 * 1024 * 1024 * 1024 + (baseTime % 100) * 1024 * 1024;
  const tx = 3.8 * 1024 * 1024 * 1024 + (baseTime % 50) * 1024 * 1024;

  return {
    server: { name: 'vpn-amsterdam-01', status: 'online', uptime },
    cpu: { usage: cpuUsage, cores: 4 },
    memory: { used, total, percent: Math.round((used / total) * 100) },
    network: { rx, tx },
    connections,
    _stub: true
  };
}

app.get('/api/stats', (req, res) => {
  res.json(generateStubStats());
});

app.get('/api/servers', (req, res) => {
  res.json({
    servers: [
      { id: '1', name: 'vpn-amsterdam-01', region: 'EU', status: 'online', users: 47 },
      { id: '2', name: 'vpn-frankfurt-01', region: 'EU', status: 'online', users: 32 },
      { id: '3', name: 'vpn-nyc-01', region: 'US', status: 'maintenance', users: 0 }
    ],
    _stub: true
  });
});

const bot = new Bot(BOT_TOKEN);

const MINI_APP_URL = new URL('/dashboard', WEBAPP_URL).href;

bot.command('start', async (ctx) => {
  const keyboard = new InlineKeyboard().webApp('Открыть приложение', MINI_APP_URL);
  await ctx.reply('Добро пожаловать! Нажмите кнопку, чтобы открыть Mini App:', {
    reply_markup: keyboard
  });
});

const isProductionUrl = WEBAPP_URL && /^https:\/\//.test(WEBAPP_URL) && !WEBAPP_URL.includes('localhost');
const useWebhook = process.env.USE_WEBHOOK === 'true' || (process.env.USE_WEBHOOK !== 'false' && isProductionUrl);
if (useWebhook) {
  const webhookPath = '/webhook';
  const webhookUrl = new URL(WEBAPP_URL).origin + webhookPath;
  app.post(webhookPath, webhookCallback(bot, 'express'));
  app.listen(PORT, async () => {
    await bot.api.setWebhook(webhookUrl);
    console.log(`Server running at http://localhost:${PORT} (webhook: ${webhookUrl})`);
  });
} else {
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT} (polling)`);
  });
  bot.start();
}
