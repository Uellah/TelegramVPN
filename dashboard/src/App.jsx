import { useState, useEffect } from 'react'
import './App.css'

const API = '/api'

function Card({ title, children }) {
  return (
    <div className="card">
      <h3>{title}</h3>
      {children}
    </div>
  )
}

function App() {
  const [stats, setStats] = useState(null)
  const [servers, setServers] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([
      fetch(`${API}/stats`).then(r => r.json()),
      fetch(`${API}/servers`).then(r => r.json())
    ])
      .then(([s, sv]) => {
        setStats(s)
        setServers(sv)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="loading">Загрузка...</div>
  if (error) return <div className="error">Ошибка: {error}</div>

  const isStub = stats?._stub || servers?._stub

  return (
    <div className="app">
      <header>
        <h1>Статистика серверов</h1>
        {isStub && <span className="stub-badge">Заглушка</span>}
      </header>

      <div className="grid">
        <Card title="Сервер">
          <div className="stat-row">
            <span>Имя:</span>
            <span>{stats?.server?.name ?? '—'}</span>
          </div>
          <div className="stat-row">
            <span>Статус:</span>
            <span className={`status ${stats?.server?.status}`}>
              {stats?.server?.status ?? '—'}
            </span>
          </div>
          <div className="stat-row">
            <span>Uptime:</span>
            <span>{stats?.server?.uptime ?? 0} с</span>
          </div>
        </Card>

        <Card title="CPU">
          <div className="stat-row">
            <span>Загрузка:</span>
            <span>{stats?.cpu?.usage ?? 0}%</span>
          </div>
          <div className="stat-row">
            <span>Ядра:</span>
            <span>{stats?.cpu?.cores ?? 0}</span>
          </div>
        </Card>

        <Card title="Память">
          <div className="stat-row">
            <span>Использовано:</span>
            <span>{stats?.memory?.percent ?? 0}%</span>
          </div>
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
          <div className="stat-row">
            <span>Активные:</span>
            <span>{stats?.connections ?? 0}</span>
          </div>
        </Card>

        <Card title="Серверы">
          <p className="muted">
            {servers?.servers?.length === 0
              ? 'Список пуст (заглушка)'
              : `${servers?.servers?.length ?? 0} серверов`}
          </p>
        </Card>
      </div>

      {isStub && (
        <p className="stub-note">
          Данные — заглушка. В будущем здесь будет реальная статистика удалённого VPN-сервера.
        </p>
      )}
    </div>
  )
}

function formatBytes(bytes) {
  if (bytes == null || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export default App
