#!/usr/bin/env node
require('dotenv').config();
const os = require('os');
const fs = require('fs');
const https = require('https');
const http = require('http');

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const API_KEY = process.env.API_KEY || 'dev-secret-key';
const INTERVAL_SEC = parseInt(process.env.INTERVAL_SEC) || 5;

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
  if (process.platform === 'linux' && fs.existsSync('/proc/net/dev')) {
    try {
      const data = fs.readFileSync('/proc/net/dev', 'utf8');
      const lines = data.split('\n').slice(2);
      let rx = 0, tx = 0;
      
      lines.forEach(line => {
        const parts = line.trim().split(/\s+/);
        if (parts[0] && !parts[0].includes('lo:')) {
          rx += parseInt(parts[1]) || 0;
          tx += parseInt(parts[9]) || 0;
        }
      });
      
      return { rx, tx };
    } catch {}
  }
  
  return { rx: 0, tx: 0 };
}

function getActiveConnections() {
  // TODO: для WireGuard: wg show all dump
  // TODO: для OpenVPN: parse status file
  return 0;
}

function collectStats() {
  return {
    server: { 
      name: os.hostname(), 
      status: 'online', 
      uptime: Math.floor(os.uptime()) 
    },
    cpu: getCpuUsage(),
    memory: getMemoryUsage(),
    network: getNetworkStats(),
    connections: getActiveConnections()
  };
}

function sendStats() {
  const stats = collectStats();
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
