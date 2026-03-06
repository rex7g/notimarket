import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { Toaster } from 'react-hot-toast'
import toast from 'react-hot-toast'
import {
  BarChart, Bar, PieChart, Pie, Cell,
  AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { usePollStore } from './store/pollStore'
import { runPollBot } from './bot/pollBot'
import { supabase } from './lib/supabase'
import AuthPage from './pages/AuthPage'
const DRHeatmap = lazy(() => import('./components/DRHeatmap'))
import QRModal from './components/QRModal'
import ShareModal from './components/ShareModal'
import { useBotConfig } from './hooks/useBotConfig'
import { useSurveyStore } from './store/surveyStore'
const SurveyCard = lazy(() => import('./components/SurveyCard'))
const CreateSurveyModal = lazy(() => import('./components/CreateSurveyModal'))
const CallCampaignPanel = lazy(() => import('./components/CallCampaignPanel'))
import type { Poll, BotConfig, AdminTab, Profile, ProvinceHeatmapDatum, NewsSource, SocialComment, SocialPlatform, Survey, SurveyAnswer } from './types'
import tunoticLogoUrl from './assets/tunoti-logo.svg'

// ─── Theme hook ──────────────────────────────────────────────────────
function useTheme() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('notimarket-theme')
    return saved === 'light' ? 'light' : 'dark'
  })
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('notimarket-theme', theme)
  }, [theme])
  const toggle = () => setTheme(t => t === 'dark' ? 'light' : 'dark')
  return { theme, toggle }
}

// ─── Helpers ─────────────────────────────────────────────────────────
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

// ─── DR Province geographic centers (lat/lng) ────────────────────────
const DR_PROVINCE_CENTERS = [
  { code: 'DNL', lat: 18.4861, lng: -69.9312 },
  { code: 'SDQ', lat: 18.4800, lng: -69.9500 },
  { code: 'ALG', lat: 18.6167, lng: -68.7167 },
  { code: 'AZU', lat: 18.4556, lng: -70.7358 },
  { code: 'BAH', lat: 18.2300, lng: -71.0700 },
  { code: 'BAR', lat: 18.2036, lng: -71.1003 },
  { code: 'DAJ', lat: 19.5494, lng: -71.7079 },
  { code: 'DUA', lat: 19.2000, lng: -70.3333 },
  { code: 'ELS', lat: 18.7667, lng: -69.0333 },
  { code: 'EPI', lat: 18.8833, lng: -71.7000 },
  { code: 'ESP', lat: 19.5500, lng: -70.2667 },
  { code: 'HAM', lat: 18.7667, lng: -69.2500 },
  { code: 'HMI', lat: 19.3667, lng: -70.2000 },
  { code: 'IND', lat: 18.5000, lng: -71.8500 },
  { code: 'LAV', lat: 19.2211, lng: -70.5297 },
  { code: 'LRO', lat: 18.4272, lng: -68.9720 },
  { code: 'MCI', lat: 19.8500, lng: -71.6500 },
  { code: 'MNO', lat: 18.9200, lng: -70.3900 },
  { code: 'MOP', lat: 18.8067, lng: -69.7797 },
  { code: 'MTS', lat: 19.4500, lng: -69.9833 },
  { code: 'PED', lat: 18.0378, lng: -71.7436 },
  { code: 'PER', lat: 18.2764, lng: -70.3333 },
  { code: 'PUP', lat: 19.7933, lng: -70.6889 },
  { code: 'SAM', lat: 19.2058, lng: -69.3367 },
  { code: 'SCR', lat: 18.4167, lng: -70.1000 },
  { code: 'SJU', lat: 18.8058, lng: -71.2289 },
  { code: 'SPM', lat: 18.4500, lng: -69.3000 },
  { code: 'SRA', lat: 19.4833, lng: -71.3333 },
  { code: 'SRO', lat: 19.0500, lng: -70.1500 },
  { code: 'STI', lat: 19.4500, lng: -70.6972 },
  { code: 'VAL', lat: 19.5822, lng: -70.9847 },
]

function latLngToProvinceCode(lat: number, lng: number): string {
  let nearest = DR_PROVINCE_CENTERS[0]
  let minDist = Infinity
  for (const p of DR_PROVINCE_CENTERS) {
    const d = (lat - p.lat) ** 2 + (lng - p.lng) ** 2
    if (d < minDist) { minDist = d; nearest = p }
  }
  return nearest.code
}

function hashIP(ip: string): string {
  const parts = ip.split('.')
  return parts.length === 4 ? parts.slice(0, 3).join('.') : ip.slice(0, 16)
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || name
}

// ─── Mock news sidebar ────────────────────────────────────────────────
const MOCK_NEWS = [
  { id: '1', title: 'Presidencia anuncia nuevo plan de infraestructura vial', source: 'El Caribe', published_at: new Date(Date.now() - 3600000).toISOString(), url: '#', sentiment: 'positivo', topic: 'politica' },
  { id: '2', title: 'Banco Central mantiene tasa de interés en 7%', source: 'Listín Diario', published_at: new Date(Date.now() - 7200000).toISOString(), url: '#', sentiment: 'neutral', topic: 'economia' },
  { id: '3', title: 'Reforma educativa impacta 1.2M de estudiantes', source: 'Diario Libre', published_at: new Date(Date.now() - 10800000).toISOString(), url: '#', sentiment: 'positivo', topic: 'educacion' },
  { id: '4', title: 'Debate en el Congreso sobre nueva ley migratoria', source: 'Acento', published_at: new Date(Date.now() - 14400000).toISOString(), url: '#', sentiment: 'negativo', topic: 'politica' },
  { id: '5', title: 'Turismo creció 18% durante el primer trimestre', source: 'El Día', published_at: new Date(Date.now() - 18000000).toISOString(), url: '#', sentiment: 'positivo', topic: 'economia' },
]

// ─── Demo polls ───────────────────────────────────────────────────────
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
    topic: 'politica', sentiment: 'positivo', province: 'STI',
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
    topic: 'economia', sentiment: 'neutral', province: 'DNL',
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
    topic: 'politica', sentiment: 'negativo', province: 'SDQ',
    createdAt: new Date(Date.now() - 10800000).toISOString(),
    totalVotes: 989, voted: false,
  },
]

// ─── SentimentBadge ───────────────────────────────────────────────────
function SentimentBadge({ sentiment }: { sentiment: string }) {
  const labels: Record<string, string> = {
    positivo: '▲ Positivo',
    negativo: '▼ Negativo',
    neutral: '● Neutral',
  }
  return <span className={`sentiment-badge ${sentiment}`}>{labels[sentiment] ?? sentiment}</span>
}

// ─── Topbar ───────────────────────────────────────────────────────────
function Topbar({ onAdminClick, inAdminView, theme, onThemeToggle }: {
  onAdminClick: () => void
  inAdminView: boolean
  theme: 'dark' | 'light'
  onThemeToggle: () => void
}) {
  const { user, signOut, isAdmin } = useAuth()
  return (
    <header className="topbar">
      <div className="topbar-brand">
        <img
          src={tunoticLogoUrl}
          alt="TuNoti"
          style={{ height: 38, width: 'auto', display: 'block' }}
        />
      </div>
      <div className="topbar-actions">
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>República Dominicana</span>
        <button className="btn-theme" onClick={onThemeToggle} title="Cambiar tema" aria-label="Toggle theme">
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
        {user && (
          <div className="topbar-user">
            <span className="user-avatar">
              {(user.user_metadata?.full_name as string ?? user.email ?? 'U')[0].toUpperCase()}
            </span>
          </div>
        )}
        {isAdmin && (
          <button className={`btn ${inAdminView ? 'btn-ghost' : 'btn-primary'}`} onClick={onAdminClick}>
            {inAdminView ? '← Feed' : '⚙️ Admin'}
          </button>
        )}
        {user && (
          <button className="btn btn-ghost" onClick={signOut} title="Cerrar sesión">
            Salir
          </button>
        )}
      </div>
    </header>
  )
}

// ─── PollCard ─────────────────────────────────────────────────────────
function PollCard({ poll, onVote }: { poll: Poll; onVote: (pollId: string, optionId: string) => void }) {
  const [showQR, setShowQR] = useState(false)
  const [showShare, setShowShare] = useState(false)

  return (
    <>
      <article className="poll-card">
        <div className="poll-card-header">
          <div className="poll-meta">
            <SentimentBadge sentiment={poll.sentiment} />
            <span className="topic-badge">{TOPIC_ICONS[poll.topic] ?? '📰'} {poll.topic}</span>
            {poll.province && (
              <span className="province-tag">📍 {poll.province}</span>
            )}
            <span className="text-muted text-sm">{timeAgo(poll.createdAt)}</span>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
            <button
              className="poll-action-btn"
              onClick={() => setShowQR(true)}
              title="Ver código QR"
              aria-label="Código QR"
            >📱</button>
            <button
              className="poll-action-btn"
              onClick={() => setShowShare(true)}
              title="Compartir por correo"
              aria-label="Enviar por correo"
            >✉️</button>
            {poll.newsSource && (
              <a className="poll-source-link" href={poll.newsUrl} target="_blank" rel="noopener noreferrer">
                🔗 {poll.newsSource}
              </a>
            )}
          </div>
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

      {showQR && (
        <QRModal pollId={poll.id} question={poll.question} onClose={() => setShowQR(false)} />
      )}
      {showShare && (
        <ShareModal
          pollId={poll.id}
          question={poll.question}
          options={poll.options}
          onClose={() => setShowShare(false)}
        />
      )}
    </>
  )
}

// ─── NewsSidebarCard ──────────────────────────────────────────────────
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

// ─── BotLogPanel ──────────────────────────────────────────────────────
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

// ─── AdminPanel ───────────────────────────────────────────────────────
function AdminPanel({ onBack, allPolls }: { onBack: () => void; allPolls: Poll[] }) {
  const [tab, setTab] = useState<AdminTab>('dashboard')
  const { session, isPremium } = useAuth()

  // ── Bot config (Supabase-backed) ──────────────────────────────
  const { config: botConfig, saving: configSaving, save: saveConfig } = useBotConfig()

  const botRunning = usePollStore(s => s.botRunning)
  const setBotRunning = usePollStore(s => s.setBotRunning)
  const setLastBotRun = usePollStore(s => s.setLastBotRun)
  const lastBotRun = usePollStore(s => s.lastBotRun)
  const addPoll = usePollStore(s => s.addPoll)
  const clearPolls = usePollStore(s => s.clearPolls)
  const polls = usePollStore(s => s.polls)

  const totalVotes = allPolls.reduce((a, p) => a + p.totalVotes, 0)
  const [logs, setLogs] = useState<LogEntry[]>([])

  // ── Survey (Encuesta) state ────────────────────────────────────
  const { surveys, loading: surveysLoading, fetchSurveys, addSurvey, updateSurvey, removeSurvey } = useSurveyStore()
  const [showCreateSurvey, setShowCreateSurvey] = useState(false)
  useEffect(() => { if (tab === 'encuestas') fetchSurveys() }, [tab, fetchSurveys])

  // localConfig mirrors the store; kept in sync when Supabase loads
  const [localConfig, setLocalConfig] = useState<BotConfig>(botConfig)
  useEffect(() => { setLocalConfig(botConfig) }, [botConfig])

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

  const handleSaveConfig = async () => {
    const ok = await saveConfig(localConfig)
    if (ok) {
      toast.success('⚙️ Configuración guardada en Supabase')
      addLog('⚙️ Configuración guardada')
    } else {
      toast.error('Error guardando configuración')
    }
  }

  const [profiles, setProfiles] = useState<Profile[]>([])
  const [profilesLoading, setProfilesLoading] = useState(false)

  const fetchProfiles = useCallback(async () => {
    setProfilesLoading(true)
    const { data, error } = await supabase.from('profiles').select('*').order('created_at')
    if (error) toast.error('Error cargando usuarios')
    else setProfiles(data ?? [])
    setProfilesLoading(false)
  }, [])

  useEffect(() => {
    if (tab === 'usuarios') fetchProfiles()
  }, [tab, fetchProfiles])

  const toggleRole = async (profileId: string, currentRole: string) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin'
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', profileId)
    if (error) toast.error('Error actualizando rol')
    else {
      toast.success(`Rol actualizado a ${newRole}`)
      setProfiles(prev => prev.map(p => p.id === profileId ? { ...p, role: newRole as 'user' | 'admin' } : p))
    }
  }

  const [voterHeatData, setVoterHeatData] = useState<ProvinceHeatmapDatum[]>([])
  const [newsHeatData, setNewsHeatData] = useState<ProvinceHeatmapDatum[]>([])
  const [heatLoading, setHeatLoading] = useState(false)
  const [heatmapSubTab, setHeatmapSubTab] = useState<'voters' | 'news'>('voters')

  const fetchHeatmapData = useCallback(async () => {
    setHeatLoading(true)
    try {
      const { data: accessData } = await supabase
        .from('poll_accesses').select('province').not('province', 'is', null)
      if (accessData) {
        const m: Record<string, number> = {}
        accessData.forEach(r => { if (r.province) m[r.province] = (m[r.province] ?? 0) + 1 })
        setVoterHeatData(Object.entries(m).map(([province, count]) => ({ province, count })))
      }
      const { data: pollData } = await supabase
        .from('polls').select('province').not('province', 'is', null)
      if (pollData) {
        const m: Record<string, number> = {}
        pollData.forEach(r => { if (r.province) m[r.province] = (m[r.province] ?? 0) + 1 })
        setNewsHeatData(Object.entries(m).map(([province, count]) => ({ province, count })))
      }
    } finally {
      setHeatLoading(false)
    }
  }, [])

  useEffect(() => {
    if (tab === 'heatmap') fetchHeatmapData()
  }, [tab, fetchHeatmapData])

  // ── News Sources state ──────────────────────────────────────
  const [sources, setSources] = useState<NewsSource[]>([])
  const [sourcesLoading, setSourcesLoading] = useState(false)
  const [newSourceUrl, setNewSourceUrl] = useState('')
  const [newSourceName, setNewSourceName] = useState('')
  const [addingSource, setAddingSource] = useState(false)

  const NEWS_API_URL = import.meta.env.VITE_NEWS_API_URL || 'http://localhost:8001'

  const fetchSources = useCallback(async () => {
    setSourcesLoading(true)
    try {
      const res = await fetch(`${NEWS_API_URL}/sources`)
      const data = await res.json()
      setSources(Array.isArray(data) ? data : [])
    } catch { toast.error('Error cargando fuentes') }
    finally { setSourcesLoading(false) }
  }, [NEWS_API_URL])

  const handleAddSource = async () => {
    if (!newSourceUrl || !newSourceName) return
    setAddingSource(true)
    try {
      const res = await fetch(`${NEWS_API_URL}/sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: newSourceUrl.trim(), name: newSourceName.trim() }),
      })
      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error ?? 'Error al agregar fuente')
      } else {
        toast.success(`Fuente "${newSourceName}" agregada`)
        setNewSourceUrl('')
        setNewSourceName('')
        fetchSources()
      }
    } catch { toast.error('Error de red') }
    finally { setAddingSource(false) }
  }

  const handleDeleteSource = async (id: string, name: string) => {
    const res = await fetch(`${NEWS_API_URL}/sources/${id}`, { method: 'DELETE' })
    if (res.ok) { toast.success(`Fuente "${name}" eliminada`); fetchSources() }
    else toast.error('Error al eliminar fuente')
  }

  useEffect(() => { if (tab === 'fuentes') fetchSources() }, [tab, fetchSources])

  // ── Social comments state ────────────────────────────────────
  const [socialPollId, setSocialPollId] = useState<string | null>(null)
  const [socialPlatform, setSocialPlatform] = useState<SocialPlatform>('twitter')
  const [socialPostUrl, setSocialPostUrl] = useState('')
  const [socialComments, setSocialComments] = useState<SocialComment[]>([])
  const [socialLoading, setSocialLoading] = useState(false)
  const [fetchingComments, setFetchingComments] = useState(false)

  const fetchSocialComments = useCallback(async (pollId: string, platform?: SocialPlatform) => {
    setSocialLoading(true)
    try {
      const url = new URL(`${NEWS_API_URL}/social/comments`)
      url.searchParams.set('pollId', pollId)
      if (platform) url.searchParams.set('platform', platform)
      const res = await fetch(url.toString())
      const data = await res.json()
      setSocialComments(Array.isArray(data) ? data : [])
    } catch { toast.error('Error cargando comentarios') }
    finally { setSocialLoading(false) }
  }, [NEWS_API_URL])

  const handleFetchSocialComments = async () => {
    if (!socialPollId || !socialPostUrl) return
    setFetchingComments(true)
    try {
      const res = await fetch(`${NEWS_API_URL}/social/fetch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pollId: socialPollId, platform: socialPlatform, postUrl: socialPostUrl }),
      })
      const data = await res.json()
      if (!res.ok) toast.error(data.error ?? 'Error obteniendo comentarios')
      else {
        toast.success(`${data.fetched} comentarios obtenidos (${data.withBotScores} con análisis bot)`)
        fetchSocialComments(socialPollId, socialPlatform)
      }
    } catch { toast.error('Error de red') }
    finally { setFetchingComments(false) }
  }

  const tabs: { id: AdminTab; label: string; icon: string }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'heatmap', label: 'Heatmap', icon: '🗺️' },
    { id: 'bot', label: 'Bot Config', icon: '🤖' },
    { id: 'fuentes', label: 'Fuentes', icon: '📡' },
    { id: 'stats', label: 'Estadísticas', icon: '📈' },
    { id: 'usuarios', label: 'Usuarios', icon: '👥' },
    { id: 'encuestas', label: 'Encuestas', icon: '📋' },
    { id: 'llamadas', label: 'Llamadas', icon: '📞' },
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
      {tab === 'dashboard' && (() => {
        const top10 = [...allPolls]
          .sort((a, b) => b.totalVotes - a.totalVotes)
          .slice(0, 10)
          .map(p => ({ name: p.question.slice(0, 26) + '…', votos: p.totalVotes }))

        const sentCounts = {
          positivo: allPolls.filter(p => p.sentiment === 'positivo').length,
          negativo: allPolls.filter(p => p.sentiment === 'negativo').length,
          neutral: allPolls.filter(p => p.sentiment === 'neutral').length,
        }
        const pieData = [
          { name: 'Positivo', value: sentCounts.positivo, color: cssVar('--success') || '#23d996' },
          { name: 'Negativo', value: sentCounts.negativo, color: cssVar('--danger') || '#ff5370' },
          { name: 'Neutral', value: sentCounts.neutral, color: '#6b7280' },
        ]

        const byDay = allPolls.reduce<Record<string, number>>((acc, p) => {
          const d = p.createdAt.slice(0, 10)
          acc[d] = (acc[d] ?? 0) + 1
          return acc
        }, {})
        const areaData = Object.entries(byDay)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, count]) => ({ date: date.slice(5), count }))

        const accentColor = cssVar('--accent-light') || '#a78bfa'

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Row 1: KPIs */}
            <div className="kpi-grid">
              {[
                { label: 'Total Encuestas', value: fmt(allPolls.length), sub: 'generadas', color: accentColor },
                { label: 'Total Votos', value: fmt(totalVotes), sub: 'participación', color: pieData[0].color },
                { label: 'Activas', value: String(allPolls.filter(p => !p.voted).length), sub: 'sin votar', color: cssVar('--warning') || '#f59e0b' },
                { label: 'Prom. Votos', value: allPolls.length ? fmt(Math.round(totalVotes / allPolls.length)) : '0', sub: 'por encuesta', color: accentColor },
              ].map(k => (
                <div key={k.label} className="kpi-card" style={{ borderTop: `3px solid ${k.color}` }}>
                  <div className="kpi-label">{k.label}</div>
                  <div className="kpi-value" style={{ color: k.color }}>{k.value}</div>
                  <div className="kpi-sub">{k.sub}</div>
                </div>
              ))}
            </div>

            {/* Row 2: BarChart + PieChart */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16 }}>
              <div className="panel">
                <div className="panel-title">Top 10 Encuestas por Votos</div>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={top10} margin={{ top: 4, right: 8, left: -15, bottom: 64 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} angle={-35} textAnchor="end" interval={0} />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                    <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="votos" fill={accentColor} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="panel">
                <div className="panel-title">Sentimiento</div>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={48} outerRadius={76} paddingAngle={3} dataKey="value">
                      {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                  {pieData.map(d => (
                    <div key={d.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                      <span style={{ color: d.color }}>{d.name}</span>
                      <span style={{ fontWeight: 700 }}>{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Row 3: AreaChart + Topics table */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="panel">
                <div className="panel-title">Encuestas Creadas por Día</div>
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={areaData} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                    <defs>
                      <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={accentColor} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={accentColor} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                    <Area type="monotone" dataKey="count" stroke={accentColor} strokeWidth={2} fill="url(#grad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="panel">
                <div className="panel-title">Encuestas por Tema</div>
                {TOPICS.map(topic => {
                  const cnt = allPolls.filter(p => p.topic === topic).length
                  const votes = allPolls.filter(p => p.topic === topic).reduce((a, p) => a + p.totalVotes, 0)
                  const pct = allPolls.length ? Math.round((cnt / allPolls.length) * 100) : 0
                  return (
                    <div key={topic} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: '0.8rem' }}>
                      <span>{TOPIC_ICONS[topic]}</span>
                      <span style={{ flex: 1, textTransform: 'capitalize', color: 'var(--text-secondary)' }}>{topic}</span>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>{cnt} · {pct}%</span>
                      <span style={{ fontWeight: 700, color: accentColor, minWidth: 44, textAlign: 'right' }}>{fmt(votes)}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Row 4: Bot status condensed */}
            <div className="panel">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span className="panel-title" style={{ marginBottom: 0 }}>Estado del Bot</span>
                <span className={`status-pill ${botRunning ? 'active' : 'inactive'}`}>
                  <span className="dot" />{botRunning ? 'Ejecutando…' : 'Inactivo'}
                </span>
                {lastBotRun && <span className="text-muted text-sm">Última: {timeAgo(lastBotRun)}</span>}
                <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={handleRunBot} disabled={botRunning}>
                  {botRunning ? '⏳ Ejecutando…' : '▶ Ejecutar Bot'}
                </button>
              </div>
              <div style={{ marginTop: 12 }}><BotLogPanel logs={logs} /></div>
            </div>
          </div>
        )
      })()}

      {/* ── Heatmap ── */}
      {tab === 'heatmap' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className={`btn ${heatmapSubTab === 'voters' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setHeatmapSubTab('voters')}>
              🔵 Escaneos QR (Votantes)
            </button>
            <button className={`btn ${heatmapSubTab === 'news' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setHeatmapSubTab('news')}>
              🔴 Actividad de Noticias
            </button>
            <button className="btn btn-ghost" style={{ marginLeft: 'auto', fontSize: '0.8rem' }} onClick={fetchHeatmapData} disabled={heatLoading}>
              {heatLoading ? '⏳' : '🔄'} Actualizar
            </button>
          </div>

          {heatLoading ? (
            <div className="panel" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
              Cargando datos del mapa…
            </div>
          ) : (
            <div className="panel" style={{ padding: 20 }}>
              <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Cargando mapa…</div>}>
                {heatmapSubTab === 'voters' ? (
                  <DRHeatmap
                    data={voterHeatData.length > 0
                      ? voterHeatData
                      : allPolls.filter(p => p.province).map(p => ({ province: p.province!, count: p.totalVotes }))}
                    colorScheme="voters"
                  />
                ) : (
                  <DRHeatmap
                    data={newsHeatData.length > 0
                      ? newsHeatData
                      : allPolls.filter(p => p.province).map(p => ({ province: p.province!, count: 1 }))}
                    colorScheme="news"
                  />
                )}
              </Suspense>
            </div>
          )}
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
              <option value="openrouter">🔀 OpenRouter (GPT-4, Claude, Llama…)</option>
              <option value="openai">OpenAI GPT</option>
              <option value="gemini">Google Gemini</option>
            </select>
          </div>

          {localConfig.llmProvider === 'openrouter' && (
            <>
              <div className="form-group">
                <label className="form-label">OpenRouter API Key</label>
                <input
                  className="form-input"
                  type="password"
                  placeholder="sk-or-v1-..."
                  value={localConfig.llmApiKey}
                  onChange={e => setLocalConfig(c => ({ ...c, llmApiKey: e.target.value }))}
                />
                <span className="text-muted" style={{ fontSize: '0.72rem' }}>
                  Obtén tu clave en <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-light)' }}>openrouter.ai/keys</a>
                </span>
              </div>
              <div className="form-group">
                <label className="form-label">Modelo</label>
                <input
                  className="form-input"
                  list="or-models"
                  placeholder="openai/gpt-4o-mini"
                  value={localConfig.openrouterModel}
                  onChange={e => setLocalConfig(c => ({ ...c, openrouterModel: e.target.value }))}
                />
                <datalist id="or-models">
                  <option value="openai/gpt-4o-mini" />
                  <option value="openai/gpt-4o" />
                  <option value="anthropic/claude-haiku-4-5" />
                  <option value="anthropic/claude-sonnet-4-5" />
                  <option value="google/gemini-flash-1.5" />
                  <option value="mistralai/mistral-7b-instruct:free" />
                  <option value="meta-llama/llama-3.1-8b-instruct:free" />
                  <option value="microsoft/phi-3-mini-128k-instruct:free" />
                </datalist>
                <span className="text-muted" style={{ fontSize: '0.72rem' }}>
                  Ver todos los modelos en <a href="https://openrouter.ai/models" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-light)' }}>openrouter.ai/models</a>
                </span>
              </div>
            </>
          )}

          {(localConfig.llmProvider === 'openai' || localConfig.llmProvider === 'gemini') && (
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
              min={5} max={1440}
              value={localConfig.intervalMinutes}
              onChange={e => setLocalConfig(c => ({ ...c, intervalMinutes: Number(e.target.value) }))}
            />
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button
              className="btn btn-primary"
              style={{ flex: 1 }}
              onClick={handleSaveConfig}
              disabled={configSaving}
            >
              {configSaving ? '⏳ Guardando…' : '💾 Guardar'}
            </button>
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

      {/* ── Fuentes de Noticias ── */}
      {tab === 'fuentes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="panel">
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
              <span className="panel-title" style={{ marginBottom: 0 }}>📡 Fuentes de Noticias</span>
              <button className="btn btn-ghost" style={{ marginLeft: 'auto', fontSize: '0.8rem' }} onClick={fetchSources} disabled={sourcesLoading}>
                {sourcesLoading ? '⏳' : '🔄'} Actualizar
              </button>
            </div>

            {/* Add source form */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              <input
                className="form-input"
                style={{ flex: 2, minWidth: 180 }}
                placeholder="https://www.listindiario.com"
                value={newSourceUrl}
                onChange={e => setNewSourceUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddSource()}
              />
              <input
                className="form-input"
                style={{ flex: 1, minWidth: 120 }}
                placeholder="Listín Diario"
                value={newSourceName}
                onChange={e => setNewSourceName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddSource()}
              />
              <button
                className="btn btn-primary"
                onClick={handleAddSource}
                disabled={addingSource || !newSourceUrl || !newSourceName}
              >
                {addingSource ? '⏳' : '+ Agregar'}
              </button>
            </div>

            <p className="text-muted" style={{ fontSize: '0.75rem', marginBottom: 12 }}>
              El bot detecta el feed RSS automáticamente. Si no hay RSS, raspa el HTML de la página principal.
            </p>

            {/* Sources list */}
            {sourcesLoading ? (
              <div className="text-muted text-sm" style={{ textAlign: 'center', padding: 24 }}>Cargando fuentes…</div>
            ) : sources.length === 0 ? (
              <div className="text-muted text-sm" style={{ textAlign: 'center', padding: 24 }}>
                No hay fuentes configuradas. Agrega sitios de noticias arriba.
              </div>
            ) : (
              sources.map(src => (
                <div key={src.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: '0.83rem',
                }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: src.enabled ? 'var(--success)' : 'var(--text-muted)', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{src.name}</div>
                    <div className="text-muted" style={{ fontSize: '0.72rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {src.url}
                    </div>
                  </div>
                  <span style={{
                    padding: '2px 8px', borderRadius: 999, fontSize: '0.7rem',
                    background: src.rss_url ? '#22c55e22' : '#f59e0b22',
                    color: src.rss_url ? '#22c55e' : '#f59e0b',
                    border: `1px solid ${src.rss_url ? '#22c55e44' : '#f59e0b44'}`,
                    flexShrink: 0,
                  }}>
                    {src.rss_url ? 'RSS ✓' : 'HTML'}
                  </span>
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: '0.75rem', padding: '4px 8px', color: 'var(--danger)' }}
                    onClick={() => handleDeleteSource(src.id, src.name)}
                  >
                    🗑️
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Social Comments Dashboard */}
          <div className="panel">
            <div className="panel-title">💬 Comentarios de Redes Sociales</div>
            <p className="text-muted" style={{ fontSize: '0.78rem', marginBottom: 12 }}>
              Selecciona una encuesta, pega el URL del post en redes sociales y obtén los comentarios con análisis de bots.
            </p>

            <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              <select
                className="form-select"
                style={{ flex: '0 0 160px' }}
                value={socialPlatform}
                onChange={e => setSocialPlatform(e.target.value as SocialPlatform)}
              >
                <option value="twitter">🐦 Twitter / X</option>
                <option value="facebook">📘 Facebook</option>
                <option value="instagram">📸 Instagram</option>
                <option value="tiktok">🎵 TikTok</option>
              </select>
              <input
                className="form-input"
                style={{ flex: 2, minWidth: 220 }}
                placeholder="URL del post en redes (ej. https://x.com/user/status/...)"
                value={socialPostUrl}
                onChange={e => setSocialPostUrl(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <select
                className="form-select"
                style={{ flex: 1 }}
                value={socialPollId ?? ''}
                onChange={e => { setSocialPollId(e.target.value || null); if (e.target.value) fetchSocialComments(e.target.value, socialPlatform) }}
              >
                <option value="">— Selecciona una encuesta —</option>
                {allPolls.map(p => (
                  <option key={p.id} value={p.id}>{p.question.slice(0, 60)}…</option>
                ))}
              </select>
              <button
                className="btn btn-primary"
                onClick={handleFetchSocialComments}
                disabled={fetchingComments || !socialPollId || !socialPostUrl}
              >
                {fetchingComments ? '⏳ Obteniendo…' : '📥 Obtener Comentarios'}
              </button>
            </div>

            {socialPollId && (
              <>
                {socialLoading ? (
                  <div className="text-muted text-sm" style={{ textAlign: 'center', padding: 16 }}>Cargando comentarios…</div>
                ) : socialComments.length === 0 ? (
                  <div className="text-muted text-sm" style={{ textAlign: 'center', padding: 16 }}>
                    Sin comentarios. Pega el URL del post y haz clic en "Obtener Comentarios".
                  </div>
                ) : (
                  <>
                    {/* Summary bar */}
                    <div style={{
                      display: 'flex', gap: 16, padding: '8px 12px', borderRadius: 8,
                      background: 'var(--bg-surface)', marginBottom: 12, fontSize: '0.78rem', flexWrap: 'wrap',
                    }}>
                      <span>💬 <strong>{socialComments.length}</strong> comentarios</span>
                      <span>❤️ <strong>{socialComments.reduce((a, c) => a + c.likes, 0)}</strong> likes totales</span>
                      <span>🤖 <strong>{Math.round((socialComments.filter(c => c.is_bot).length / socialComments.length) * 100)}%</strong> posibles bots</span>
                    </div>

                    {/* Comments list */}
                    <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                      {socialComments.map(c => {
                        const score = c.bot_score ?? 0
                        const isBot = c.is_bot ?? score > 0.7
                        return (
                          <div key={c.id} className="comment-row">
                            <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>{isBot ? '🤖' : '👤'}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                {c.author_name ?? 'Anónimo'}
                                {c.author_handle && <span className="text-muted"> {c.author_handle}</span>}
                              </div>
                              <div style={{ fontSize: '0.82rem', wordBreak: 'break-word' }}>{c.text}</div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                              <span className={`bot-badge ${isBot ? 'bot' : 'human'}`}>
                                🤖 {Math.round(score * 100)}%
                              </span>
                              {c.likes > 0 && <span className="text-muted" style={{ fontSize: '0.7rem' }}>❤️ {c.likes}</span>}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Usuarios ── */}
      {tab === 'usuarios' && (
        <div className="panel">
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
            <span className="panel-title" style={{ marginBottom: 0 }}>Gestión de Usuarios</span>
            <button className="btn btn-ghost" style={{ marginLeft: 'auto', fontSize: '0.8rem' }} onClick={fetchProfiles}>
              🔄 Actualizar
            </button>
          </div>

          {profilesLoading ? (
            <div className="text-muted text-sm" style={{ textAlign: 'center', padding: 24 }}>Cargando usuarios…</div>
          ) : profiles.length === 0 ? (
            <div className="text-muted text-sm" style={{ textAlign: 'center', padding: 24 }}>No hay usuarios registrados.</div>
          ) : (
            profiles.map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: '0.85rem' }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, color: '#fff', fontSize: '0.9rem', flexShrink: 0,
                }}>
                  {(p.full_name ?? 'U')[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.full_name ?? 'Sin nombre'}
                  </div>
                  <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                    {new Date(p.created_at).toLocaleDateString('es-DO')}
                  </div>
                </div>
                <span style={{
                  padding: '2px 10px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700,
                  background: p.role === 'admin' ? 'var(--accent)' : 'var(--bg-surface)',
                  color: p.role === 'admin' ? '#fff' : 'var(--text-muted)',
                  border: '1px solid var(--border)',
                }}>
                  {p.role === 'admin' ? '⚙️ Admin' : '👤 Usuario'}
                </span>
                <button
                  className={`btn ${p.role === 'admin' ? 'btn-danger' : 'btn-primary'}`}
                  style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                  onClick={() => toggleRole(p.id, p.role)}
                >
                  {p.role === 'admin' ? 'Quitar admin' : 'Hacer admin'}
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Encuestas ── */}
      {tab === 'encuestas' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="panel">
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
              <span className="panel-title" style={{ marginBottom: 0 }}>📋 Encuestas Manuales</span>
              <button
                className="btn btn-primary"
                style={{ marginLeft: 'auto', fontSize: '0.83rem' }}
                onClick={() => setShowCreateSurvey(true)}
              >
                + Nueva encuesta
              </button>
            </div>

            {surveysLoading ? (
              <div className="text-muted text-sm" style={{ textAlign: 'center', padding: 24 }}>Cargando encuestas…</div>
            ) : surveys.length === 0 ? (
              <div className="text-muted text-sm" style={{ textAlign: 'center', padding: 24, lineHeight: 1.7 }}>
                No hay encuestas creadas aún.<br />
                <span style={{ fontSize: '0.75rem' }}>Usa el botón de arriba para crear la primera.</span>
              </div>
            ) : (
              surveys.map(s => {
                const statusColor = s.status === 'active' ? '#22c55e' : s.status === 'draft' ? '#f59e0b' : 'var(--text-muted)'
                const statusBg = s.status === 'active' ? '#22c55e22' : s.status === 'draft' ? '#f59e0b22' : 'var(--bg-surface)'
                const statusLabel = s.status === 'active' ? '● Activa' : s.status === 'draft' ? '○ Borrador' : '■ Cerrada'
                return (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)', fontSize: '0.83rem' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: statusColor }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</div>
                      <div className="text-muted" style={{ fontSize: '0.72rem' }}>
                        {s.questions.length} pregunta{s.questions.length !== 1 ? 's' : ''} · {s.total_responses} respuesta{s.total_responses !== 1 ? 's' : ''} · {s.topic}
                        {s.province ? ` · ${s.province}` : ''}
                      </div>
                    </div>
                    <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: '0.7rem', background: statusBg, color: statusColor, border: `1px solid ${statusColor}44`, flexShrink: 0 }}>
                      {statusLabel}
                    </span>
                    {s.status === 'active' && (
                      <button
                        className="btn btn-ghost"
                        style={{ fontSize: '0.72rem', padding: '3px 8px', color: 'var(--warning, #f59e0b)' }}
                        onClick={async () => {
                          const { data, error } = await supabase.from('surveys').update({ status: 'closed' }).eq('id', s.id).select().single()
                          if (error) { toast.error('Error cerrando encuesta'); return }
                          updateSurvey(data as Survey); toast.success('Encuesta cerrada')
                        }}
                      >
                        ■ Cerrar
                      </button>
                    )}
                    <button
                      className="btn btn-ghost"
                      style={{ fontSize: '0.72rem', padding: '3px 8px', color: 'var(--danger, #ef4444)' }}
                      onClick={async () => {
                        const { error } = await supabase.from('surveys').delete().eq('id', s.id)
                        if (error) { toast.error('Error eliminando'); return }
                        removeSurvey(s.id); toast.success(`"${s.title}" eliminada`)
                      }}
                    >
                      🗑️
                    </button>
                  </div>
                )
              })
            )}
          </div>

          {showCreateSurvey && (
            <Suspense fallback={null}>
              <CreateSurveyModal
                onClose={() => setShowCreateSurvey(false)}
                onCreated={(survey) => { addSurvey(survey); setShowCreateSurvey(false) }}
              />
            </Suspense>
          )}
        </div>
      )}

      {/* ── Llamadas ── */}
      {tab === 'llamadas' && (
        isPremium ? (
          <Suspense fallback={<div className="text-muted text-sm" style={{ padding: 24, textAlign: 'center' }}>Cargando panel de llamadas…</div>}>
            <CallCampaignPanel
              surveys={surveys}
              sessionToken={session?.access_token ?? ''}
            />
          </Suspense>
        ) : (
          <div className="panel" style={{ textAlign: 'center', padding: '48px 24px' }}>
            <div style={{ fontSize: '3rem', marginBottom: 16 }}>🔒</div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 8 }}>Feature Premium</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', maxWidth: 380, margin: '0 auto 20px' }}>
              Las campañas de llamadas telefónicas con IA están disponibles en el plan Premium.
              Contacta al administrador para activar esta función en tu cuenta.
            </p>
            <div style={{
              display: 'inline-block', padding: '8px 20px', borderRadius: 8,
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              fontSize: '0.8rem', color: 'var(--text-muted)',
            }}>
              SQL: <code style={{ color: 'var(--accent-light)' }}>UPDATE profiles SET is_premium = true WHERE id = '...';</code>
            </div>
          </div>
        )
      )}
    </div>
  )
}

// ─── Main App (inner – needs auth context) ────────────────────────────
function AppInner() {
  const { user, loading, isAdmin } = useAuth()
  const { theme, toggle: toggleTheme } = useTheme()
  const [view, setView] = useState<'feed' | 'admin'>('feed')
  const [activeTopic, setActiveTopic] = useState<string>('all')

  const polls = usePollStore(s => s.polls)
  const vote = usePollStore(s => s.vote)
  const addPoll = usePollStore(s => s.addPoll)

  // ── Surveys ─────────────────────────────────────────────────────
  const { surveys, respondedIds, surveyResults, fetchSurveys, fetchUserResponses, submitResponse } = useSurveyStore()
  useEffect(() => { fetchSurveys() }, [fetchSurveys])
  useEffect(() => { if (user) fetchUserResponses(user.id) }, [user, fetchUserResponses])
  const activeSurveys = surveys.filter(s => s.status === 'active')
  const handleSurveySubmit = (surveyId: string, answers: SurveyAnswer[], captchaScore?: number) => {
    if (!user) return Promise.resolve({ error: 'Debes iniciar sesión para responder' })
    return submitResponse(surveyId, user.id, answers, undefined, captchaScore)
  }

  useEffect(() => {
    if (polls.length === 0) {
      DEMO_POLLS.forEach(p => addPoll(p))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ─── QR scan geolocation tracking ────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('ref') !== 'qr') return
    const pollId = params.get('poll_id')
    if (!pollId) return
    window.history.replaceState({}, '', window.location.pathname)
      ; (async () => {
        try {
          const geo = await fetch('https://ipapi.co/json/').then(r => r.json())
          await supabase.from('poll_accesses').insert({
            poll_id: pollId,
            lat: geo.latitude,
            lng: geo.longitude,
            province: latLngToProvinceCode(geo.latitude, geo.longitude),
            city: geo.city ?? null,
            ip_hash: hashIP(geo.ip ?? ''),
            ref: 'qr',
          })
        } catch (e) {
          console.warn('[QR tracking]', e)
        }
      })()
  }, [])

  if (loading) {
    return (
      <div className="app-loading">
        <div className="app-loading-inner">
          <img src={tunoticLogoUrl} alt="TuNoti" style={{ height: 32, width: 'auto' }} />
        </div>
      </div>
    )
  }

  if (!user) return <AuthPage />

  const allPolls = polls.length > 0 ? polls : DEMO_POLLS
  const displayedPolls = activeTopic === 'all'
    ? allPolls
    : allPolls.filter(p => p.topic === activeTopic)

  const sidebarItems = [
    { id: 'all', label: 'Todas', icon: '🗳️' },
    ...TOPICS.map(t => ({ id: t, label: t.charAt(0).toUpperCase() + t.slice(1), icon: TOPIC_ICONS[t] })),
  ]

  if (view === 'admin') {
    if (!isAdmin) {
      return (
        <div className="app-wrapper">
          <Toaster position="top-right" />
          <Topbar onAdminClick={() => setView('feed')} inAdminView theme={theme} onThemeToggle={toggleTheme} />
          <div className="empty-state" style={{ marginTop: 80 }}>
            <span className="icon">🔒</span>
            <h3>Acceso restringido</h3>
            <p>Solo los administradores pueden ver este panel.</p>
            <button className="btn btn-primary" onClick={() => setView('feed')}>← Volver al feed</button>
          </div>
        </div>
      )
    }
    return (
      <div className="app-wrapper">
        <Toaster position="top-right" />
        <Topbar onAdminClick={() => setView('feed')} inAdminView theme={theme} onThemeToggle={toggleTheme} />
        <AdminPanel onBack={() => setView('feed')} allPolls={allPolls} />
      </div>
    )
  }

  return (
    <div className="app-wrapper">
      <Toaster position="top-right" />
      <Topbar onAdminClick={() => setView('admin')} inAdminView={false} theme={theme} onThemeToggle={toggleTheme} />

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
          {isAdmin && (
            <div className="sidebar-item" onClick={() => setView('admin')}>
              <span className="icon">⚙️</span> Panel Admin
            </div>
          )}
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
              <p>Ve al Panel Admin y ejecuta el bot para generar encuestas.</p>
              {isAdmin && (
                <button className="btn btn-primary" onClick={() => setView('admin')}>⚙️ Ir al Admin</button>
              )}
            </div>
          ) : (
            displayedPolls.map(poll => (
              <PollCard key={poll.id} poll={poll} onVote={vote} />
            ))
          )}

          {/* ── Encuestas activas (multi-question surveys) ── */}
          {activeSurveys.length > 0 && (
            <div style={{ marginTop: 28 }}>
              <div className="feed-header" style={{ marginBottom: 12 }}>
                <h2 className="feed-section-title">📋 Encuestas Activas</h2>
                <span className="text-muted text-sm">
                  {activeSurveys.length} encuesta{activeSurveys.length !== 1 ? 's' : ''}
                </span>
              </div>
              <Suspense fallback={<div className="text-muted text-sm" style={{ padding: 12 }}>Cargando encuestas…</div>}>
                {activeSurveys.map(s => (
                  <SurveyCard
                    key={s.id}
                    survey={s}
                    hasResponded={respondedIds.has(s.id)}
                    results={surveyResults[s.id] ?? []}
                    onSubmit={handleSurveySubmit}
                  />
                ))}
              </Suspense>
            </div>
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

// ─── Root export ────────────────────────────────────────────────────
export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  )
}
