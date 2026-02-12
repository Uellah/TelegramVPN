require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const os = require('os');
const fs = require('fs');
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

// Dashboard React app (собранный Vite build)
const dashboardPath = path.join(__dirname, 'dist');
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

// --- Real System Stats (Node.js API) ---
function getCpuUsage() {
  const cpus = os.cpus();
  let totalIdle = 0, totalTick = 0;
  
  cpus.forEach(cpu => {
    for (let type in cpu.times) {
      totalTick += cpu.times[type];
    }
    totalIdle += cpu.times.idle;
  });
  
  const idle = totalIdle / cpus.length;
  const total = totalTick / cpus.length;
  const usage = 100 - ~~(100 * idle / total);
  
  return { usage, cores: cpus.length };
}

function getMemoryUsage() {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  const percent = Math.round((used / total) * 100);
  
  return { used, total, percent };
}

function getNetworkStats() {
  // Linux: читаем /proc/net/dev
  if (process.platform === 'linux' && fs.existsSync('/proc/net/dev')) {
    try {
      const data = fs.readFileSync('/proc/net/dev', 'utf8');
      const lines = data.split('\n').slice(2); // пропускаем заголовок
      let rx = 0, tx = 0;
      
      lines.forEach(line => {
        const parts = line.trim().split(/\s+/);
        if (parts[0] && !parts[0].includes('lo:')) { // игнорируем loopback
          rx += parseInt(parts[1]) || 0;
          tx += parseInt(parts[9]) || 0;
        }
      });
      
      return { rx, tx };
    } catch {}
  }
  
  // Fallback: примерные данные
  return { rx: 0, tx: 0 };
}

function getActiveConnections() {
  // Для VPN: можно читать WireGuard peers, OpenVPN status или TCP connections
  // Простой вариант: возвращаем 0 (можно доработать под конкретный VPN)
  return 0;
}

app.get('/api/stats', (req, res) => {
  const hostname = os.hostname();
  const uptime = os.uptime();
  const cpu = getCpuUsage();
  const memory = getMemoryUsage();
  const network = getNetworkStats();
  const connections = getActiveConnections();
  
  res.json({
    server: { name: hostname, status: 'online', uptime: Math.floor(uptime) },
    cpu,
    memory,
    network,
    connections,
    _real: true // отметка что это реальные данные
  });
});

app.get('/api/servers', (req, res) => {
  // Список серверов — можно хардкодить или читать из конфига
  res.json({
    servers: [
      { 
        id: '1', 
        name: os.hostname(), 
        region: 'Local', 
        status: 'online', 
        users: getActiveConnections() 
      }
    ]
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
