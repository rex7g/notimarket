// src/components/CallCampaignPanel.tsx
// Admin-only panel for launching phone survey campaigns via ElevenLabs (Premium).

import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import type { Survey, PhoneCampaign } from '../types'

const API_URL = import.meta.env.VITE_NEWS_API_URL as string ?? 'http://localhost:8001'

interface Props {
  surveys: Survey[]
  sessionToken: string   // Supabase JWT for Bearer auth on Node API
}

interface CsvContact {
  phone: string
  name?: string
}

// ── CSV parser (nombre,teléfono or teléfono,nombre) ──────────────────────────
function parseCsv(text: string): CsvContact[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean)
  const contacts: CsvContact[] = []
  for (const line of lines) {
    const cols = line.split(',').map(c => c.trim())
    if (cols.length === 0 || !cols[0]) continue
    // Auto-detect column order: if first col looks like a phone number use it
    const firstIsPhone = /^\+?[\d\s\-()]{7,}$/.test(cols[0])
    contacts.push(
      firstIsPhone
        ? { phone: cols[0], name: cols[1] }
        : { name: cols[0], phone: cols[1] ?? '' },
    )
  }
  return contacts.filter(c => c.phone.trim().length >= 7)
}

export default function CallCampaignPanel({ surveys, sessionToken }: Props) {
  const [selectedSurveyId, setSelectedSurveyId] = useState('')
  const [contacts, setContacts] = useState<CsvContact[]>([])
  const [csvFileName, setCsvFileName] = useState('')
  const [launching, setLaunching] = useState(false)
  const [campaigns, setCampaigns] = useState<PhoneCampaign[]>([])
  const [loadingCampaigns, setLoadingCampaigns] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const activeSurveys = surveys.filter(s => s.status === 'active')

  // ── Fetch campaigns for selected survey ──────────────────────────────────
  const fetchCampaigns = async (surveyId: string) => {
    if (!surveyId) { setCampaigns([]); return }
    setLoadingCampaigns(true)
    try {
      const res = await fetch(
        `${API_URL}/api/calls/campaigns?survey_id=${surveyId}`,
        { headers: { Authorization: `Bearer ${sessionToken}` } },
      )
      if (res.ok) setCampaigns(await res.json() as PhoneCampaign[])
    } catch {
      // silent
    } finally {
      setLoadingCampaigns(false)
    }
  }

  useEffect(() => {
    fetchCampaigns(selectedSurveyId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSurveyId])

  // Poll running campaigns every 5 s
  useEffect(() => {
    const hasRunning = campaigns.some(c => c.status === 'running')
    if (hasRunning && selectedSurveyId) {
      pollRef.current = setInterval(() => fetchCampaigns(selectedSurveyId), 5000)
    } else {
      if (pollRef.current) clearInterval(pollRef.current)
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaigns, selectedSurveyId])

  // ── CSV upload ────────────────────────────────────────────────────────────
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvFileName(file.name)
    const reader = new FileReader()
    reader.onload = ev => {
      const parsed = parseCsv((ev.target?.result as string) ?? '')
      setContacts(parsed)
      if (parsed.length === 0) toast.error('No se encontraron contactos válidos en el CSV')
    }
    reader.readAsText(file)
  }

  // ── Launch campaign ───────────────────────────────────────────────────────
  const handleLaunch = async () => {
    if (!selectedSurveyId) { toast.error('Selecciona una encuesta'); return }
    if (contacts.length === 0) { toast.error('Carga un CSV con contactos primero'); return }
    setLaunching(true)
    try {
      const res = await fetch(`${API_URL}/api/calls/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ survey_id: selectedSurveyId, contacts }),
      })
      const data = await res.json() as { ok?: boolean; campaign_id?: string; total?: number; error?: string }
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? 'Error lanzando campaña')
        return
      }
      toast.success(`Campaña iniciada: ${data.total} llamadas en proceso`)
      setContacts([])
      setCsvFileName('')
      if (fileRef.current) fileRef.current.value = ''
      await fetchCampaigns(selectedSurveyId)
    } catch (err) {
      toast.error(String(err))
    } finally {
      setLaunching(false)
    }
  }

  // ── Status helpers ────────────────────────────────────────────────────────
  const statusColor: Record<string, string> = {
    pending: '#6b7280', running: '#f59e0b', completed: '#10b981', failed: '#ef4444',
  }
  const statusLabel: Record<string, string> = {
    pending: 'Pendiente', running: 'En progreso', completed: 'Completada', failed: 'Fallida',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* ── Premium badge ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        background: 'linear-gradient(135deg, #1b3a6b11 0%, #f9731611 100%)',
        border: '1px solid #1b3a6b33', borderRadius: 10, padding: '10px 16px',
      }}>
        <span style={{ fontSize: '1.2rem' }}>📞</span>
        <div>
          <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            Encuestas por Llamada — Plan Premium
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            El agente de voz IA llama a los ciudadanos, hace las preguntas y registra las respuestas automáticamente.
          </div>
        </div>
      </div>

      {/* ── Launch form ── */}
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 10, padding: 18,
      }}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 16 }}>
          Nueva Campaña
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Survey selector */}
          <div>
            <label className="form-label">Encuesta a realizar</label>
            <select
              className="form-input"
              value={selectedSurveyId}
              onChange={e => setSelectedSurveyId(e.target.value)}
            >
              <option value="">— Selecciona una encuesta —</option>
              {activeSurveys.map(s => (
                <option key={s.id} value={s.id}>
                  {s.title} ({s.questions.length} preguntas)
                </option>
              ))}
            </select>
          </div>

          {/* CSV upload */}
          <div>
            <label className="form-label">Lista de contactos (CSV)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                className="btn btn-secondary"
                style={{ fontSize: '0.82rem', padding: '6px 14px', flexShrink: 0 }}
                onClick={() => fileRef.current?.click()}
              >
                📎 {csvFileName ? 'Cambiar archivo' : 'Subir CSV'}
              </button>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {csvFileName
                  ? `${csvFileName} — ${contacts.length} contacto${contacts.length !== 1 ? 's' : ''} detectado${contacts.length !== 1 ? 's' : ''}`
                  : 'Formato: nombre,teléfono (una línea por contacto)'}
              </span>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.txt"
                style={{ display: 'none' }}
                onChange={handleFile}
              />
            </div>

            {/* Preview first 3 contacts */}
            {contacts.length > 0 && (
              <div style={{
                marginTop: 8, background: 'var(--bg-base)', border: '1px solid var(--border)',
                borderRadius: 6, padding: '8px 12px', fontSize: '0.75rem',
                color: 'var(--text-muted)', fontFamily: 'monospace',
              }}>
                {contacts.slice(0, 3).map((c, i) => (
                  <div key={i}>{c.name ?? '—'} · {c.phone}</div>
                ))}
                {contacts.length > 3 && <div>…y {contacts.length - 3} más</div>}
              </div>
            )}
          </div>

          {/* Launch button */}
          <button
            className="btn btn-primary"
            style={{ alignSelf: 'flex-end', minWidth: 180 }}
            onClick={handleLaunch}
            disabled={launching || !selectedSurveyId || contacts.length === 0}
          >
            {launching
              ? '⏳ Lanzando…'
              : `🚀 Lanzar campaña (${contacts.length} llamada${contacts.length !== 1 ? 's' : ''})`}
          </button>
        </div>
      </div>

      {/* ── Campaigns list ── */}
      <div>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 12 }}>
          Campañas recientes
          {selectedSurveyId && (
            <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8 }}>
              para la encuesta seleccionada
            </span>
          )}
        </h3>

        {!selectedSurveyId && (
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Selecciona una encuesta para ver sus campañas.
          </p>
        )}

        {selectedSurveyId && loadingCampaigns && (
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Cargando…</p>
        )}

        {selectedSurveyId && !loadingCampaigns && campaigns.length === 0 && (
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            No hay campañas para esta encuesta todavía.
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {campaigns.map(c => {
            const pct = c.total_numbers > 0
              ? Math.round((c.calls_done / c.total_numbers) * 100)
              : 0
            const color = statusColor[c.status] ?? '#6b7280'
            return (
              <div
                key={c.id}
                style={{
                  background: 'var(--bg-surface)', border: '1px solid var(--border)',
                  borderRadius: 8, padding: '12px 16px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span style={{
                    fontSize: '0.7rem', fontWeight: 700,
                    background: `${color}22`, color,
                    border: `1px solid ${color}44`,
                    borderRadius: 999, padding: '2px 8px',
                  }}>
                    {statusLabel[c.status] ?? c.status}
                  </span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)', flex: 1 }}>
                    {c.calls_done} / {c.total_numbers} llamadas completadas
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {new Date(c.created_at).toLocaleDateString('es-DO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                {/* Progress bar */}
                <div style={{
                  height: 6, background: 'var(--border)', borderRadius: 999, overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%', width: `${pct}%`,
                    background: c.status === 'completed' ? '#10b981'
                      : c.status === 'running' ? '#f59e0b'
                      : c.status === 'failed' ? '#ef4444'
                      : '#6b7280',
                    borderRadius: 999,
                    transition: 'width 0.5s ease',
                  }} />
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4, textAlign: 'right' }}>
                  {pct}% · {c.calls_made} iniciadas · {c.calls_done} recibidas
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
