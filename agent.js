#!/usr/bin/env node
require('dotenv').config();
const os = require('os');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const API_KEY = process.env.API_KEY || 'dev-secret-key';
const INTERVAL_SEC = parseInt(process.env.INTERVAL_SEC) || 5;
const USE_NODE_EXPORTER = process.env.USE_NODE_EXPORTER === 'true';
const NODE_EXPORTER_URL = process.env.NODE_EXPORTER_URL || 'http://localhost:9100/metrics';
const ACTIVITY_FILE = process.env.ACTIVITY_FILE || path.join(__dirname, 'activity.json');

let prevCpuTimes = null;

// Парсинг Prometheus метрик
function parsePrometheusMetrics(text) {
  const lines = text.split('\n').filter(l => l && !l.startsWith('#'));
  const metrics = {};
  
  lines.forEach(line => {
    const [key, value] = line.split(' ');
    if (key && value) metrics[key] = parseFloat(value);
  });

  // CPU: 100 - idle%
  const cpuIdle = metrics['node_cpu_seconds_total{mode="idle"}'] || 0;
  const cpuTotal = Object.keys(metrics)
    .filter(k => k.startsWith('node_cpu_seconds_total'))
    .reduce((sum, k) => sum + (metrics[k] || 0), 0);
  const cpuUsage = cpuTotal > 0 ? Math.round(100 - (cpuIdle / cpuTotal) * 100) : 0;

  // Memory
  const memTotal = metrics['node_memory_MemTotal_bytes'] || 0;
  const memAvail = metrics['node_memory_MemAvailable_bytes'] || 0;
  const memUsed = memTotal - memAvail;

  // Network (суммарно по всем интерфейсам)
  const rx = Object.keys(metrics)
    .filter(k => k.startsWith('node_network_receive_bytes_total'))
    .reduce((sum, k) => sum + (metrics[k] || 0), 0);
  const tx = Object.keys(metrics)
    .filter(k => k.startsWith('node_network_transmit_bytes_total'))
    .reduce((sum, k) => sum + (metrics[k] || 0), 0);

  return {
    server: { 
      name: os.hostname(), 
      status: 'online', 
      uptime: Math.floor(metrics['node_boot_time_seconds'] ? Date.now() / 1000 - metrics['node_boot_time_seconds'] : os.uptime())
    },
    cpu: { usage: cpuUsage, cores: os.cpus().length },
    memory: { used: memUsed, total: memTotal, percent: memTotal > 0 ? Math.round((memUsed / memTotal) * 100) : 0 },
    network: { rx, tx },
    connections: 0 // TODO: WireGuard/OpenVPN peers
  };
}

// Правильный расчёт CPU (дельта между замерами)
function getCpuTimes() {
  const cpus = os.cpus();
  let idle = 0, total = 0;
  
  cpus.forEach(cpu => {
    idle += cpu.times.idle;
    for (let type in cpu.times) {
      total += cpu.times[type];
    }
  });
  
  return { idle, total };
}

function calculateCpuUsage() {
  const current = getCpuTimes();
  
  if (!prevCpuTimes) {
    prevCpuTimes = current;
    return 0;
  }
  
  const idleDelta = current.idle - prevCpuTimes.idle;
  const totalDelta = current.total - prevCpuTimes.total;
  
  prevCpuTimes = current;
  
  if (totalDelta === 0) return 0;
  return Math.round(100 - (idleDelta / totalDelta) * 100);
}

// Сбор через os (если node_exporter не используется)
function getNetworkStatsNative() {
  // Linux: читаем /proc/net/dev
  if (os.platform() === 'linux') {
    try {
      const data = fs.readFileSync('/proc/net/dev', 'utf8');
      const lines = data.split('\n');
      let rx = 0, tx = 0;
      
      for (const line of lines) {
        // Пропускаем заголовки и loopback
        if (!line.includes(':') || line.trim().startsWith('lo:')) continue;
        
        const parts = line.split(/\s+/).filter(Boolean);
        if (parts.length >= 10) {
          rx += parseInt(parts[1]) || 0;  // bytes received
          tx += parseInt(parts[9]) || 0;  // bytes transmitted
        }
      }
      
      return { rx, tx };
    } catch (err) {
      console.error('Failed to read /proc/net/dev:', err.message);
    }
  }
  
  // macOS/Windows: возвращаем 0
  return { rx: 0, tx: 0 };
}

function collectStatsNative() {
  const cpuUsage = calculateCpuUsage();
  const cpus = os.cpus();
  const total = os.totalmem();
  const free = os.freemem();
  const network = getNetworkStatsNative();

  return {
    server: { name: os.hostname(), status: 'online', uptime: Math.floor(os.uptime()) },
    cpu: { usage: cpuUsage, cores: cpus.length },
    memory: { used: total - free, total, percent: Math.round(((total - free) / total) * 100) },
    network,
    connections: 0
  };
}

async function collectStats() {
  if (!USE_NODE_EXPORTER) return collectStatsNative();

  return new Promise((resolve, reject) => {
    const url = new URL(NODE_EXPORTER_URL);
    const lib = url.protocol === 'https:' ? https : http;
    
    lib.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(parsePrometheusMetrics(data)));
    }).on('error', (err) => {
      console.error('node_exporter error:', err.message);
      resolve(collectStatsNative()); // fallback
    });
  });
}

function readActivity() {
  try {
    if (fs.existsSync(ACTIVITY_FILE)) {
      const raw = fs.readFileSync(ACTIVITY_FILE, 'utf8');
      const data = JSON.parse(raw);
      const keysByLetter = (data.keysByLetter && typeof data.keysByLetter === 'object')
        ? data.keysByLetter
        : {};
      return {
        keysTotal: parseInt(data.keysTotal) || 0,
        clicksTotal: parseInt(data.clicksTotal) || 0,
        keysPerMin: parseInt(data.keysPerMin) || 0,
        clicksPerMin: parseInt(data.clicksPerMin) || 0,
        keysByLetter
      };
    }
  } catch (e) {
    // ignore
  }
  return { keysTotal: 0, clicksTotal: 0, keysPerMin: 0, clicksPerMin: 0, keysByLetter: {} };
}

async function sendStats() {
  const stats = await collectStats();
  stats.activity = readActivity();
  const payload = JSON.stringify(stats);
  const url = new URL('/api/stats/report', SERVER_URL);
  const isHttps = url.protocol === 'https:';
  const lib = isHttps ? https : http;

  const req = lib.request(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'X-API-Key': API_KEY
    }
  }, (res) => {
    if (res.statusCode === 200) {
      console.log(`[${new Date().toLocaleTimeString()}] Stats sent (CPU: ${stats.cpu.usage}%, Mem: ${stats.memory.percent}%)`);
    } else {
      console.error(`[${new Date().toLocaleTimeString()}] Error ${res.statusCode}`);
    }
  });

  req.on('error', (err) => {
    console.error(`[${new Date().toLocaleTimeString()}] Failed:`, err.message);
  });

  req.write(payload);
  req.end();
}

console.log(`Agent started. Sending stats to ${SERVER_URL} every ${INTERVAL_SEC}s`);
console.log(`Hostname: ${os.hostname()}`);
sendStats();
setInterval(sendStats, INTERVAL_SEC * 1000);
