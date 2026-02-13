import { useState, useEffect } from 'react'
import { Line, Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Filler
} from 'chart.js'
import './App.css'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Filler)

const API = '/api'
const REFRESH_MS = 3000

function useTelegramWebApp() {
  useEffect(() => {
    const tg = window.Telegram?.WebApp
    if (tg) {
      tg.ready()
      tg.expand()
      tg.setHeaderColor('#1a1a1a')
      tg.setBackgroundColor('#1a1a1a')
    }
  }, [])
}

function formatUptime(sec) {
  if (!sec) return '0 с'
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const parts = []
  if (d) parts.push(`${d}д`)
  if (h) parts.push(`${h}ч`)
  parts.push(`${m}м`)
  return parts.join(' ')
}

function formatBytes(bytes) {
  if (bytes == null || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1)
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function formatSpeed(bytesPerSec) {
  if (!bytesPerSec) return '0 B/s'
  return formatBytes(bytesPerSec) + '/s'
}

function Card({ title, children, className }) {
  return (
    <div className={`card ${className || ''}`}>
      <h3>{title}</h3>
      {children}
    </div>
  )
}

function MetricRow({ label, value, className }) {
  return (
    <div className={`metric-row ${className || ''}`}>
      <span className="label">{label}</span>
      <span className="value">{value}</span>
    </div>
  )
}

function ProgressBar({ value, max = 100, showLabel = true }) {
  const pct = Math.min(100, Math.max(0, Math.round((value / max) * 100)))
  const color = pct > 80 ? 'danger' : pct > 60 ? 'warn' : 'ok'
  return (
    <div className="progress-wrapper">
      <div className="progress-bar">
        <div className={`progress-fill ${color}`} style={{ width: `${pct}%` }} />
      </div>
      {showLabel && <span className="progress-label">{pct}%</span>}
    </div>
  )
}

function CpuChart({ history, timestamps }) {
  if (!history || history.length < 2) return null

  const labels = timestamps.map((ts, i) => {
    if (i % 3 === 0) {
      const d = new Date(ts)
      return d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    }
    return ''
  })

  const data = {
    labels,
    datasets: [{
      label: 'CPU %',
      data: history,
      borderColor: 'rgba(34, 197, 94, 0.8)',
      backgroundColor: 'rgba(34, 197, 94, 0.1)',
      fill: true,
      tension: 0.4,
      pointRadius: 0,
      borderWidth: 2
    }]
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { 
        mode: 'index',
        intersect: false,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 8,
        cornerRadius: 6
      }
    },
    scales: {
      y: { 
        min: 0, 
        max: 100,
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: 'rgba(255, 255, 255, 0.5)', font: { size: 10 } }
      },
      x: { 
        grid: { display: false },
        ticks: { color: 'rgba(255, 255, 255, 0.5)', font: { size: 9 }, maxRotation: 0 }
      }
    },
    interaction: {
      mode: 'nearest',
      axis: 'x',
      intersect: false
    }
  }

  return <div className="chart-container"><Line data={data} options={options} /></div>
}

function ActivityBarChart({ scoreHistory, timestamps }) {
  if (!scoreHistory || scoreHistory.length < 1) return null

  const labels = timestamps.map((ts, i) => {
    if (i % 3 === 0) {
      const d = new Date(ts)
      return d.toLocaleTimeString('ru', { minute: '2-digit', second: '2-digit' })
    }
    return ''
  })

  const data = {
    labels,
    datasets: [{
      label: 'Активность',
      data: scoreHistory,
      backgroundColor: 'rgba(168, 85, 247, 0.6)',
      borderColor: 'rgba(168, 85, 247, 0.9)',
      borderWidth: 1
    }]
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: { min: 0, max: 100, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'rgba(255,255,255,0.5)', font: { size: 10 } } },
      x: { grid: { display: false }, ticks: { color: 'rgba(255,255,255,0.5)', font: { size: 9 }, maxRotation: 0 } }
    }
  }

  return <div className="chart-container chart-activity"><Bar data={data} options={options} /></div>
}

function App() {
  useTelegramWebApp()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchData = () =>
    fetch(`${API}/stats`)
      .then(r => r.json())
      .then(data => {
        setStats(data)
        setError(null)
      })
      .catch(err => setError(err.message))

  useEffect(() => {
    fetchData().finally(() => setLoading(false))
    const id = setInterval(fetchData, REFRESH_MS)
    return () => clearInterval(id)
  }, [])

  if (loading) return <div className="center-message">Загрузка...</div>
  if (error) return <div className="center-message error">Ошибка: {error}</div>

  const isReal = stats?._real

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-title">
          <h1>VPN Dashboard</h1>
          {isReal && <span className="live-badge">● Live</span>}
        </div>
        <div className="server-name">{stats?.server?.name}</div>
      </header>

      <div className="metrics-grid">
        <Card title="CPU" className="card-highlight">
          <div className="big-metric">{stats?.cpu?.usage ?? 0}%</div>
          <ProgressBar value={stats?.cpu?.usage ?? 0} showLabel={false} />
          <MetricRow label="Ядра" value={stats?.cpu?.cores ?? 0} />
        </Card>

        <Card title="Память" className="card-highlight">
          <div className="big-metric">{stats?.memory?.percent ?? 0}%</div>
          <ProgressBar value={stats?.memory?.percent ?? 0} showLabel={false} />
          <MetricRow 
            label="Использовано" 
            value={`${formatBytes(stats?.memory?.used)} / ${formatBytes(stats?.memory?.total)}`} 
          />
        </Card>

        <Card title="Uptime">
          <div className="big-metric">{formatUptime(stats?.server?.uptime)}</div>
          <MetricRow 
            label="Статус" 
            value={<span className="status online">{stats?.server?.status ?? '—'}</span>} 
          />
        </Card>

        <Card title="Подключения">
          <div className="big-metric">{stats?.connections ?? 0}</div>
          <div className="metric-sub">активных VPN</div>
        </Card>
      </div>

      {stats?.history?.cpu && stats.history.cpu.length > 1 && (
        <Card title="CPU — История" className="chart-card">
          <CpuChart history={stats.history.cpu} timestamps={stats.history.timestamps} />
        </Card>
      )}

      <Card title="Сеть" className="network-card">
        <div className="network-grid">
          <div className="network-item">
            <div className="network-icon">↓</div>
            <div className="network-data">
              <div className="network-speed">{formatSpeed(stats?.networkSpeed?.rx)}</div>
              <div className="network-total">RX: {formatBytes(stats?.network?.rx)}</div>
            </div>
          </div>
          <div className="network-item">
            <div className="network-icon">↑</div>
            <div className="network-data">
              <div className="network-speed">{formatSpeed(stats?.networkSpeed?.tx)}</div>
              <div className="network-total">TX: {formatBytes(stats?.network?.tx)}</div>
            </div>
          </div>
        </div>
      </Card>

      {(stats?.activity != null || stats?._real) && (() => {
        const activity = stats?.activity ?? { keysTotal: 0, clicksTotal: 0, keysPerMin: 0, clicksPerMin: 0, keysByLetter: {} }
        return (
        <div className="activity-section">
          <Card title="Моя активность" className="activity-card">
            {stats.activityHistory?.score?.length > 0 && (
              <ActivityBarChart scoreHistory={stats.activityHistory.score} timestamps={stats.activityHistory.timestamps} />
            )}
            {(!stats.activityHistory?.score?.length) && (
              <div className="activity-score-now">
                <span className="activity-score-value">
                  {Math.min(100, Math.round((activity.keysPerMin || 0) * 0.5 + (activity.clicksPerMin || 0) * 2))}
                </span>
                <span className="activity-score-label">индекс сейчас</span>
              </div>
            )}
          </Card>
          <div className="activity-grid">
            <Card title="Клавиши" className="activity-subcard">
              <div className="activity-big">{activity.keysTotal ?? 0}</div>
              <div className="activity-sub">всего нажатий</div>
              <MetricRow label="В минуту" value={`${activity.keysPerMin ?? 0}`} />
              {activity.keysByLetter && Object.keys(activity.keysByLetter).length > 0 && (() => {
                const entries = Object.entries(activity.keysByLetter)
                  .sort((a, b) => (b[1] || 0) - (a[1] || 0))
                  .slice(0, 12)
                const maxCount = Math.max(1, ...entries.map(([, c]) => c || 0))
                return (
                  <div className="keys-by-letter">
                    <div className="keys-by-letter-title">По буквам</div>
                    {entries.map(([letter, count]) => (
                      <div key={letter} className="letter-row">
                        <span className="letter-key">{letter === ' ' ? 'Space' : letter}</span>
                        <div className="letter-bar-wrap">
                          <div className="letter-bar" style={{ width: `${(count / maxCount) * 100}%` }} />
                        </div>
                        <span className="letter-count">{count}</span>
                      </div>
                    ))}
                  </div>
                )
              })()}
            </Card>
            <Card title="Клики мыши" className="activity-subcard">
              <div className="activity-big">{activity.clicksTotal ?? 0}</div>
              <div className="activity-sub">всего кликов</div>
              <MetricRow label="В минуту" value={`${activity.clicksPerMin ?? 0}`} />
            </Card>
          </div>
        </div>
        )
      })()}

      {isReal && (
        <div className="footer-note">
          Обновление каждые {REFRESH_MS / 1000} сек
        </div>
      )}
    </div>
  )
}

export default App
