require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const { Bot, InlineKeyboard } = require('grammy');

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL;

if (!BOT_TOKEN || !WEBAPP_URL) {
  console.error('Missing BOT_TOKEN or WEBAPP_URL in .env');
  process.exit(1);
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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

const bot = new Bot(BOT_TOKEN);

bot.command('start', async (ctx) => {
  const keyboard = new InlineKeyboard().webApp('Открыть приложение', WEBAPP_URL);
  await ctx.reply('Добро пожаловать! Нажмите кнопку, чтобы открыть Mini App:', {
    reply_markup: keyboard
  });
});

bot.start();

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
