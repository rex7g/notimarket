import { useState, useEffect, useCallback } from 'react'
import { usePollStore } from './store/pollStore'
import { runPollBot } from './bot/pollBot'
import type { Poll, BotConfig, AdminTab } from './types'

// ─── Helpers ────────────────────────────────────────────────────────
const fmt = (n: number) => n.toLocaleString('es-DO')

const timeAgo = (iso: string) => {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'ahora'
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

const TOPICS = ['politica', 'economia', 'salud', 'tecnologia', 'educacion', 'cultura']
const TOPIC_ICONS: Record<string, string> = {
  politica: '🏛️', economia: '📈', salud: '🏥',
  tecnologia: '💻', educacion: '📚', cultura: '🎭',
}

// ─── Mock news sidebar ───────────────────────────────────────────────
const MOCK_NEWS = [
  { id: '1', title: 'Presidencia anuncia nuevo plan de infraestructura vial', source: 'El Caribe', published_at: new Date(Date.now() - 3600000).toISOString(), url: '#', sentiment: 'positivo', topic: 'politica' },
  { id: '2', title: 'Banco Central mantiene tasa de interés en 7%', source: 'Listín Diario', published_at: new Date(Date.now() - 7200000).toISOString(), url: '#', sentiment: 'neutral', topic: 'economia' },
  { id: '3', title: 'Reforma educativa impacta 1.2M de estudiantes', source: 'Diario Libre', published_at: new Date(Date.now() - 10800000).toISOString(), url: '#', sentiment: 'positivo', topic: 'educacion' },
  { id: '4', title: 'Debate en el Congreso sobre nueva ley migratoria', source: 'Acento', published_at: new Date(Date.now() - 14400000).toISOString(), url: '#', sentiment: 'negativo', topic: 'politica' },
  { id: '5', title: 'Turismo creció 18% durante el primer trimestre', source: 'El Día', published_at: new Date(Date.now() - 18000000).toISOString(), url: '#', sentiment: 'positivo', topic: 'economia' },
]

// ─── Demo polls ──────────────────────────────────────────────────────
const DEMO_POLLS: Poll[] = [
  {
    id: 'demo-1', newsId: 'n1',
    newsTitle: 'Presidencia anuncia nuevo plan de infraestructura vial',
    newsUrl: '#', newsSource: 'El Caribe',
    question: '¿Crees que el nuevo plan de infraestructura vial beneficiará a las provincias del interior?',
    options: [
      { id: 'o1', text: 'Sí, mejorará la conectividad nacional', votes: 312 },
      { id: 'o2', text: 'Solo beneficiará zonas urbanas', votes: 187 },
      { id: 'o3', text: 'No creo que se ejecute correctamente', votes: 95 },
      { id: 'o4', text: 'Necesito más información', votes: 44 },
    ],
    topic: 'politica', sentiment: 'positivo',
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    totalVotes: 638, voted: false,
  },
  {
    id: 'demo-2', newsId: 'n2',
    newsTitle: 'Banco Central mantiene tasa de interés en 7%',
    newsUrl: '#', newsSource: 'Listín Diario',
    question: '¿La tasa de interés actual del Banco Central es adecuada para la economía dominicana?',
    options: [
      { id: 'o5', text: 'Sí, es la correcta para controlar la inflación', votes: 201 },
      { id: 'o6', text: 'Debería bajar para estimular el crédito', votes: 298 },
      { id: 'o7', text: 'Debería subir para frenar la inflación', votes: 112 },
      { id: 'o8', text: 'No tiene efecto real en mi vida', votes: 67 },
    ],
    topic: 'economia', sentiment: 'neutral',
    createdAt: new Date(Date.now() - 7200000).toISOString(),
    totalVotes: 678, voted: false,
  },
  {
    id: 'demo-3', newsId: 'n3',
    newsTitle: 'Debate en el Congreso sobre nueva ley migratoria',
    newsUrl: '#', newsSource: 'Acento',
    question: '¿Apruebas la nueva propuesta de ley migratoria que se debate en el Congreso?',
    options: [
      { id: 'o9', text: 'Sí, el país necesita regularizar la migración', votes: 445 },
      { id: 'o10', text: 'No, es demasiado restrictiva', votes: 189 },
      { id: 'o11', text: 'Parcialmente, necesita ajustes', votes: 267 },
      { id: 'o12', text: 'No he seguido el debate', votes: 88 },
    ],
    topic: 'politica', sentiment: 'negativo',
    createdAt: new Date(Date.now() - 10800000).toISOString(),
    totalVotes: 989, voted: false,
  },
]

// ─────────────────────────────────────────────────────────────────────
// SentimentBadge
// ─────────────────────────────────────────────────────────────────────
function SentimentBadge({ sentiment }: { sentiment: string }) {
  const labels: Record<string, string> = {
    positivo: '▲ Positivo',
    negativo: '▼ Negativo',
    neutral: '● Neutral',
  }
  return <span className={`sentiment-badge ${sentiment}`}>{labels[sentiment] ?? sentiment}</span>
}

// ─────────────────────────────────────────────────────────────────────
// Topbar
// ─────────────────────────────────────────────────────────────────────
function Topbar({ onAdminClick, isAdmin }: { onAdminClick: () => void; isAdmin: boolean }) {
  return (
    <header className="topbar">
      <div className="topbar-brand">
        <span className="brand-dot" />
        NotiMarket
        <span style={{ fontSize: '0.7rem', fontWeight: 500, color: 'var(--text-muted)', marginLeft: 4 }}>RD</span>
      </div>
      <div className="topbar-actions">
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>República Dominicana</span>
        <button className={`btn ${isAdmin ? 'btn-ghost' : 'btn-primary'}`} onClick={onAdminClick}>
          {isAdmin ? '← Feed' : '⚙️ Admin'}
        </button>
      </div>
    </header>
  )
}

// ─────────────────────────────────────────────────────────────────────
// PollCard
// ─────────────────────────────────────────────────────────────────────
function PollCard({ poll, onVote }: { poll: Poll; onVote: (pollId: string, optionId: string) => void }) {
  return (
    <article className="poll-card">
      <div className="poll-card-header">
        <div className="poll-meta">
          <SentimentBadge sentiment={poll.sentiment} />
          <span className="topic-badge">{TOPIC_ICONS[poll.topic] ?? '📰'} {poll.topic}</span>
          <span className="text-muted text-sm">{timeAgo(poll.createdAt)}</span>
        </div>
        {poll.newsSource && (
          <a className="poll-source-link" href={poll.newsUrl} target="_blank" rel="noopener noreferrer">
            🔗 {poll.newsSource}
          </a>
        )}
      </div>

      <p className="poll-question">{poll.question}</p>

      <div className="poll-options">
        {poll.options.map((opt, i) => {
          if (poll.voted) {
            const pct = poll.totalVotes > 0 ? Math.round((opt.votes / poll.totalVotes) * 100) : 0
            const selected = poll.userChoice === i
            return (
              <div key={opt.id} className={`poll-option-result${selected ? ' selected' : ''}`}>
                <div className="result-bar" style={{ width: `${pct}%` }} />
                <div className="result-content">
                  <span>{opt.text}{selected ? ' ✓' : ''}</span>
                  <span className="result-pct">{pct}%</span>
                </div>
              </div>
            )
          }
          return (
            <button key={opt.id} className="poll-option-btn" onClick={() => onVote(poll.id, opt.id)}>
              {opt.text}
            </button>
          )
        })}
      </div>

      <div className="poll-footer">
        <span>{poll.voted ? `${fmt(poll.totalVotes)} votos` : 'Selecciona una opción'}</span>
        {poll.newsSource && <span>📰 {poll.newsSource}</span>}
      </div>
    </article>
  )
}

// ─────────────────────────────────────────────────────────────────────
// NewsSidebarCard
// ─────────────────────────────────────────────────────────────────────
function NewsSidebarCard({ item }: { item: typeof MOCK_NEWS[0] }) {
  return (
    <a href={item.url} target="_blank" rel="noopener noreferrer" className="news-card" style={{ display: 'block' }}>
      <div className="news-card-source">{item.source}</div>
      <div className="news-card-title">{item.title}</div>
      <div className="news-card-footer">
        <SentimentBadge sentiment={item.sentiment} />
        <span>{timeAgo(item.published_at)}</span>
      </div>
    </a>
  )
}

// ─────────────────────────────────────────────────────────────────────
// BotLogPanel
// ─────────────────────────────────────────────────────────────────────
interface LogEntry { time: string; msg: string }

function BotLogPanel({ logs }: { logs: LogEntry[] }) {
  return (
    <div className="bot-log">
      {logs.length === 0
        ? <span className="text-muted">Sin actividad todavía…</span>
        : logs.map((l, i) => (
          <div key={i} className="bot-log-entry">
            <span className="bot-log-time">{l.time}</span>
            <span>{l.msg}</span>
          </div>
        ))
      }
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// AdminPanel
// ─────────────────────────────────────────────────────────────────────
function AdminPanel({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<AdminTab>('dashboard')

  const polls = usePollStore(s => s.polls)
  const botConfig = usePollStore(s => s.botConfig)
  const setBotConfig = usePollStore(s => s.setBotConfig)
  const botRunning = usePollStore(s => s.botRunning)
  const setBotRunning = usePollStore(s => s.setBotRunning)
  const setLastBotRun = usePollStore(s => s.setLastBotRun)
  const lastBotRun = usePollStore(s => s.lastBotRun)
  const addPoll = usePollStore(s => s.addPoll)
  const clearPolls = usePollStore(s => s.clearPolls)

  const allPolls = polls.length > 0 ? polls : DEMO_POLLS
  const totalVotes = allPolls.reduce((a, p) => a + p.totalVotes, 0)

  const [logs, setLogs] = useState<LogEntry[]>([])
  const [localConfig, setLocalConfig] = useState<BotConfig>(botConfig)

  const addLog = useCallback((msg: string) => {
    setLogs(prev => [...prev, { time: new Date().toLocaleTimeString('es-DO'), msg }])
  }, [])

  const handleRunBot = async () => {
    if (botRunning) return
    setBotRunning(true)
    const existing = new Set(polls.map(p => p.id))
    await runPollBot(localConfig, existing, addPoll, addLog)
    setBotRunning(false)
    setLastBotRun(new Date().toISOString())
  }

  const handleSaveConfig = () => {
    setBotConfig(localConfig)
    addLog('⚙️ Configuración guardada')
  }

  const tabs: { id: AdminTab; label: string; icon: string }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'bot', label: 'Bot Config', icon: '🤖' },
    { id: 'stats', label: 'Estadísticas', icon: '📈' },
  ]

  return (
    <div className="admin-layout">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="btn btn-ghost" onClick={onBack}>← Volver</button>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>⚙️ Panel Admin</h2>
      </div>

      <div className="admin-tabs">
        {tabs.map(t => (
          <button key={t.id} className={`admin-tab${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── Dashboard ── */}
      {tab === 'dashboard' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="kpi-grid">
            {[
              { label: 'Total Encuestas', value: fmt(allPolls.length), sub: 'generadas', color: 'var(--accent-light)' },
              { label: 'Total Votos', value: fmt(totalVotes), sub: 'participación', color: 'var(--success)' },
              { label: 'Activas', value: String(allPolls.filter(p => !p.voted).length), sub: 'sin votar', color: 'var(--warning)' },
              { label: 'Prom. Votos', value: allPolls.length ? fmt(Math.round(totalVotes / allPolls.length)) : '0', sub: 'por encuesta', color: 'var(--text-primary)' },
            ].map(k => (
              <div key={k.label} className="kpi-card">
                <div className="kpi-label">{k.label}</div>
                <div className="kpi-value" style={{ color: k.color }}>{k.value}</div>
                <div className="kpi-sub">{k.sub}</div>
              </div>
            ))}
          </div>

          <div className="panel">
            <div className="panel-title">Estado del Bot</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className={`status-pill ${botRunning ? 'active' : 'inactive'}`}>
                <span className="dot" />
                {botRunning ? 'Ejecutando…' : 'Inactivo'}
              </span>
              {lastBotRun && (
                <span className="text-muted text-sm">Última ejecución: {timeAgo(lastBotRun)}</span>
              )}
              <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={handleRunBot} disabled={botRunning}>
                {botRunning ? '⏳ Ejecutando…' : '▶ Ejecutar Bot'}
              </button>
            </div>
            <div style={{ marginTop: 16 }}>
              <BotLogPanel logs={logs} />
            </div>
          </div>

          <div className="panel">
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
              <span className="panel-title" style={{ marginBottom: 0 }}>Encuestas Recientes</span>
              <button className="btn btn-danger" style={{ marginLeft: 'auto' }} onClick={clearPolls}>🗑 Limpiar</button>
            </div>
            {allPolls.slice(0, 5).map(p => (
              <div key={p.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                  <SentimentBadge sentiment={p.sentiment} />
                  <span className="topic-badge" style={{ fontSize: '0.7rem' }}>{p.topic}</span>
                </div>
                <div>{p.question}</div>
                <div className="text-muted" style={{ marginTop: 4, fontSize: '0.75rem' }}>{fmt(p.totalVotes)} votos · {timeAgo(p.createdAt)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Bot Config ── */}
      {tab === 'bot' && (
        <div className="panel">
          <div className="panel-title">Configuración del Bot</div>

          <label className="toggle" style={{ marginBottom: 18 }}>
            <input
              type="checkbox"
              checked={localConfig.enabled}
              onChange={e => setLocalConfig(c => ({ ...c, enabled: e.target.checked }))}
            />
            <div className="toggle-track">
              <div className="toggle-thumb" style={{ transform: localConfig.enabled ? 'translateX(18px)' : 'none' }} />
            </div>
            <span style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
              Bot {localConfig.enabled ? 'activado (automático)' : 'desactivado'}
            </span>
          </label>

          <div className="form-group">
            <label className="form-label">Proveedor LLM</label>
            <select
              className="form-select"
              value={localConfig.llmProvider}
              onChange={e => setLocalConfig(c => ({ ...c, llmProvider: e.target.value as BotConfig['llmProvider'] }))}
            >
              <option value="mock">Mock (sin API key)</option>
              <option value="openai">OpenAI GPT</option>
              <option value="gemini">Google Gemini</option>
            </select>
          </div>

          {localConfig.llmProvider !== 'mock' && (
            <div className="form-group">
              <label className="form-label">API Key</label>
              <input
                className="form-input"
                type="password"
                placeholder="sk-..."
                value={localConfig.llmApiKey}
                onChange={e => setLocalConfig(c => ({ ...c, llmApiKey: e.target.value }))}
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Tema por defecto</label>
            <select
              className="form-select"
              value={localConfig.topic}
              onChange={e => setLocalConfig(c => ({ ...c, topic: e.target.value }))}
            >
              {TOPICS.map(t => <option key={t} value={t}>{TOPIC_ICONS[t]} {t}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Intervalo automático (minutos)</label>
            <input
              className="form-input"
              type="number"
              min={5}
              max={1440}
              value={localConfig.intervalMinutes}
              onChange={e => setLocalConfig(c => ({ ...c, intervalMinutes: Number(e.target.value) }))}
            />
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSaveConfig}>💾 Guardar</button>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={handleRunBot} disabled={botRunning}>
              {botRunning ? '⏳ Ejecutando…' : '▶ Ejecutar ahora'}
            </button>
          </div>

          <div style={{ marginTop: 16 }}>
            <div className="text-muted text-sm" style={{ marginBottom: 8 }}>Log</div>
            <BotLogPanel logs={logs} />
          </div>
        </div>
      )}

      {/* ── Stats ── */}
      {tab === 'stats' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="panel">
            <div className="panel-title">Desglose por Sentimiento</div>
            {(['positivo', 'negativo', 'neutral'] as const).map(s => {
              const count = allPolls.filter(p => p.sentiment === s).length
              const pct = allPolls.length ? Math.round((count / allPolls.length) * 100) : 0
              return (
                <div key={s} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <SentimentBadge sentiment={s} />
                    <span className="text-sm text-muted" style={{ marginLeft: 'auto' }}>{count} encuestas · {pct}%</span>
                  </div>
                  <div style={{ height: 8, background: 'var(--bg-surface)', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${pct}%`, borderRadius: 999,
                      background: s === 'positivo' ? 'var(--success)' : s === 'negativo' ? 'var(--danger)' : 'var(--text-muted)',
                      transition: 'width 0.6s',
                    }} />
                  </div>
                </div>
              )
            })}
          </div>

          <div className="panel">
            <div className="panel-title">Encuestas por Tema</div>
            {TOPICS.map(topic => {
              const count = allPolls.filter(p => p.topic === topic).length
              const votes = allPolls.filter(p => p.topic === topic).reduce((a, p) => a + p.totalVotes, 0)
              return (
                <div key={topic} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: '0.85rem' }}>
                  <span style={{ fontSize: '1.1rem' }}>{TOPIC_ICONS[topic]}</span>
                  <span style={{ flex: 1, textTransform: 'capitalize' }}>{topic}</span>
                  <span className="text-muted">{count} encuestas</span>
                  <span style={{ fontWeight: 700, color: 'var(--accent-light)' }}>{fmt(votes)} votos</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Main App
// ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState<'feed' | 'admin'>('feed')
  const [activeTopic, setActiveTopic] = useState<string>('all')

  const polls = usePollStore(s => s.polls)
  const vote = usePollStore(s => s.vote)
  const addPoll = usePollStore(s => s.addPoll)

  // Seed demo polls once if store is empty
  useEffect(() => {
    if (polls.length === 0) {
      DEMO_POLLS.forEach(p => addPoll(p))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const allPolls = polls.length > 0 ? polls : DEMO_POLLS

  const displayedPolls = activeTopic === 'all'
    ? allPolls
    : allPolls.filter(p => p.topic === activeTopic)

  const sidebarItems = [
    { id: 'all', label: 'Todas', icon: '🗳️' },
    ...TOPICS.map(t => ({ id: t, label: t.charAt(0).toUpperCase() + t.slice(1), icon: TOPIC_ICONS[t] })),
  ]

  if (view === 'admin') {
    return (
      <div className="app-wrapper">
        <Topbar onAdminClick={() => setView('feed')} isAdmin />
        <AdminPanel onBack={() => setView('feed')} />
      </div>
    )
  }

  return (
    <div className="app-wrapper">
      <Topbar onAdminClick={() => setView('admin')} isAdmin={false} />

      <div className="main-layout">
        {/* Left sidebar */}
        <nav className="left-sidebar">
          <div className="sidebar-section-label">Explorar</div>
          {sidebarItems.map(item => (
            <div
              key={item.id}
              className={`sidebar-item${activeTopic === item.id ? ' active' : ''}`}
              onClick={() => setActiveTopic(item.id)}
            >
              <span className="icon">{item.icon}</span>
              {item.label}
            </div>
          ))}
          <div className="divider" style={{ margin: '12px 0' }} />
          <div className="sidebar-section-label">Sistema</div>
          <div className="sidebar-item" onClick={() => setView('admin')}>
            <span className="icon">⚙️</span> Panel Admin
          </div>
        </nav>

        {/* Center feed */}
        <main className="feed">
          <div className="feed-header">
            <h1 className="feed-title">
              {activeTopic === 'all'
                ? '🗳️ Todas las encuestas'
                : `${TOPIC_ICONS[activeTopic]} ${activeTopic.charAt(0).toUpperCase() + activeTopic.slice(1)}`}
            </h1>
            <span className="text-muted text-sm">{displayedPolls.length} encuestas</span>
          </div>

          {displayedPolls.length === 0 ? (
            <div className="empty-state">
              <span className="icon">📭</span>
              <h3>Sin encuestas por aquí</h3>
              <p>Ve al Panel Admin y ejecuta el bot para generar encuestas desde las noticias más recientes.</p>
              <button className="btn btn-primary" onClick={() => setView('admin')}>⚙️ Ir al Admin</button>
            </div>
          ) : (
            displayedPolls.map(poll => (
              <PollCard key={poll.id} poll={poll} onVote={vote} />
            ))
          )}
        </main>

        {/* Right news sidebar */}
        <aside className="news-sidebar">
          <div className="news-sidebar-title">📰 Últimas Noticias</div>
          {MOCK_NEWS.map(n => <NewsSidebarCard key={n.id} item={n} />)}
          <div className="divider" />
          <p style={{ padding: '8px 4px', fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>
            Las noticias activan nuevas encuestas vía el bot.
          </p>
        </aside>
      </div>
    </div>
  )
}
