import { useState, useEffect } from 'react'
import './App.css'

const API = '/api'
const REFRESH_MS = 5000

function useTelegramWebApp() {
  useEffect(() => {
    const tg = window.Telegram?.WebApp
    if (tg) {
      tg.ready()
      tg.expand()
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

function Card({ title, className, children }) {
  return (
    <div className={`card ${className || ''}`}>
      <h3>{title}</h3>
      {children}
    </div>
  )
}

function ProgressBar({ value, max = 100 }) {
  const pct = Math.min(100, Math.round((value / max) * 100))
  const color = pct > 80 ? 'danger' : pct > 60 ? 'warn' : 'ok'
  return (
    <div className="progress-bar">
      <div className={`progress-fill ${color}`} style={{ width: `${pct}%` }} />
      <span className="progress-text">{pct}%</span>
    </div>
  )
}

function App() {
  useTelegramWebApp()
  const [stats, setStats] = useState(null)
  const [servers, setServers] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchData = () =>
    Promise.all([
      fetch(`${API}/stats`).then(r => r.json()),
      fetch(`${API}/servers`).then(r => r.json())
    ])
      .then(([s, sv]) => {
        setStats(s)
        setServers(sv)
      })
      .catch(err => setError(err.message))

  useEffect(() => {
    fetchData().finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const id = setInterval(fetchData, REFRESH_MS)
    return () => clearInterval(id)
  }, [])

  if (loading) return <div className="loading">Загрузка...</div>
  if (error) return <div className="error">Ошибка: {error}</div>

  const isStub = stats?._stub || servers?._stub

  return (
    <div className="app">
      <header>
        <h1>VPN — Статистика серверов</h1>
        {isStub && <span className="stub-badge">Демо</span>}
      </header>

      <div className="grid">
        <Card title="Сервер">
          <div className="stat-row">
            <span>Имя:</span>
            <span className="mono">{stats?.server?.name ?? '—'}</span>
          </div>
          <div className="stat-row">
            <span>Статус:</span>
            <span className={`status ${stats?.server?.status}`}>
              {stats?.server?.status ?? '—'}
            </span>
          </div>
          <div className="stat-row">
            <span>Uptime:</span>
            <span>{formatUptime(stats?.server?.uptime)}</span>
          </div>
        </Card>

        <Card title="CPU">
          <ProgressBar value={stats?.cpu?.usage ?? 0} />
          <div className="stat-row">
            <span>Ядра:</span>
            <span>{stats?.cpu?.cores ?? 0}</span>
          </div>
        </Card>

        <Card title="Память">
          <ProgressBar value={stats?.memory?.percent ?? 0} />
          <div className="stat-row">
            <span>Исп./Всего:</span>
            <span>{formatBytes(stats?.memory?.used)} / {formatBytes(stats?.memory?.total)}</span>
          </div>
        </Card>

        <Card title="Сеть">
          <div className="stat-row">
            <span>↓ RX:</span>
            <span>{formatBytes(stats?.network?.rx)}</span>
          </div>
          <div className="stat-row">
            <span>↑ TX:</span>
            <span>{formatBytes(stats?.network?.tx)}</span>
          </div>
        </Card>

        <Card title="Подключения">
          <div className="stat-value">{stats?.connections ?? 0}</div>
          <p className="muted">активных VPN</p>
        </Card>

        <Card title="Серверы" className="wide">
          <div className="server-list">
            {(servers?.servers ?? []).map(s => (
              <div key={s.id} className="server-item">
                <span className="server-name">{s.name}</span>
                <span className="server-region">{s.region}</span>
                <span className={`status ${s.status}`}>{s.status}</span>
                <span className="server-users">{s.users} чел.</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {isStub && (
        <p className="stub-note">
          Демо-данные. Обновление каждые {REFRESH_MS / 1000} с. Подключи реальный API для живой статистики.
        </p>
      )}
    </div>
  )
}

export default App
