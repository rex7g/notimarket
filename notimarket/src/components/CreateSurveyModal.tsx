// src/components/CreateSurveyModal.tsx
// Admin-only modal to create a multi-question survey.
// Follows the modal-overlay / modal-box CSS pattern from ShareModal.tsx.

import { useRef, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { usePollStore } from '../store/pollStore'
import { generateSurveyQuestions } from '../bot/surveyBot'
import type { Survey, SurveyQuestion, SurveyOption } from '../types'

interface Props {
  onClose: () => void
  onCreated: (survey: Survey) => void
}

const TOPICS = [
  'Política', 'Economía', 'Educación', 'Salud', 'Seguridad',
  'Medio ambiente', 'Turismo', 'Transporte', 'Elecciones', 'Otro',
]

const PROVINCE_OPTIONS = [
  '', 'DNL', 'SDQ', 'STI', 'LAV', 'AZU', 'BAH', 'BAR', 'DAJ',
  'DUA', 'ELS', 'EPI', 'ESP', 'HAM', 'HMI', 'IND', 'ALG', 'LRO',
  'LAV', 'MCI', 'MNO', 'MOP', 'MTS', 'PED', 'PER', 'PUP', 'SAM',
  'SCR', 'SJO', 'SJU', 'SPM', 'SRA', 'SRO', 'VAL',
]

function emptyQuestion(): SurveyQuestion {
  return {
    id: uuidv4(),
    question: '',
    options: [
      { id: uuidv4(), text: '' },
      { id: uuidv4(), text: '' },
    ],
  }
}

export default function CreateSurveyModal({ onClose, onCreated }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null)

  // Form metadata
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [topic, setTopic] = useState('Política')
  const [province, setProvince] = useState('')
  const [status, setStatus] = useState<'active' | 'draft'>('active')

  // Dynamic question builder
  const [questions, setQuestions] = useState<SurveyQuestion[]>([emptyQuestion()])

  // AI generation
  const [numAI, setNumAI] = useState(3)
  const [generating, setGenerating] = useState(false)

  // Save
  const [saving, setSaving] = useState(false)

  // ── Overlay click to close ──────────────────────────────────────────────────
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose()
  }

  // ── Question helpers ────────────────────────────────────────────────────────
  const addQuestion = () => {
    if (questions.length >= 10) return
    setQuestions(qs => [...qs, emptyQuestion()])
  }

  const removeQuestion = (qId: string) => {
    if (questions.length <= 1) return
    setQuestions(qs => qs.filter(q => q.id !== qId))
  }

  const updateQuestionText = (qId: string, text: string) =>
    setQuestions(qs => qs.map(q => q.id === qId ? { ...q, question: text } : q))

  const addOption = (qId: string) =>
    setQuestions(qs => qs.map(q => {
      if (q.id !== qId || q.options.length >= 6) return q
      const opt: SurveyOption = { id: uuidv4(), text: '' }
      return { ...q, options: [...q.options, opt] }
    }))

  const removeOption = (qId: string, oId: string) =>
    setQuestions(qs => qs.map(q => {
      if (q.id !== qId || q.options.length <= 2) return q
      return { ...q, options: q.options.filter(o => o.id !== oId) }
    }))

  const updateOptionText = (qId: string, oId: string, text: string) =>
    setQuestions(qs => qs.map(q =>
      q.id !== qId ? q : {
        ...q,
        options: q.options.map(o => o.id === oId ? { ...o, text } : o),
      }
    ))

  // ── AI generation ───────────────────────────────────────────────────────────
  const handleAIGenerate = async () => {
    if (!title.trim()) { toast.error('Ingresa un título antes de generar preguntas'); return }
    setGenerating(true)
    try {
      const botConfig = usePollStore.getState().botConfig
      const generated = await generateSurveyQuestions(topic, title, numAI, botConfig)
      setQuestions(generated)
      toast.success(`${generated.length} preguntas generadas con IA`)
    } catch (err) {
      toast.error(`Error generando preguntas: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setGenerating(false)
    }
  }

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!title.trim()) { toast.error('El título es requerido'); return }
    if (questions.some(q => !q.question.trim())) {
      toast.error('Todas las preguntas deben tener texto'); return
    }
    if (questions.some(q => q.options.some(o => !o.text.trim()))) {
      toast.error('Todas las opciones deben tener texto'); return
    }

    setSaving(true)
    const { data, error } = await supabase
      .from('surveys')
      .insert({
        title: title.trim(),
        description: description.trim() || null,
        topic,
        province: province || null,
        status,
        questions,
      })
      .select()
      .single()

    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success('Encuesta creada exitosamente')
    onCreated(data as Survey)
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div
      ref={overlayRef}
      className="modal-overlay"
      onClick={handleOverlayClick}
      style={{ zIndex: 200 }}
    >
      <div
        className="modal-box"
        style={{ maxWidth: 680, maxHeight: '90vh', overflowY: 'auto', width: '100%' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 700, flex: 1 }}>
            📋 Nueva Encuesta
          </h2>
          <button className="btn btn-ghost" onClick={onClose} style={{ fontSize: '1.1rem', padding: '4px 8px' }}>
            ✕
          </button>
        </div>

        {/* ── Section A: Metadata ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
          <div>
            <label className="form-label">Título *</label>
            <input
              className="form-input"
              placeholder="Ej: Opinión sobre la economía dominicana 2024"
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={150}
            />
          </div>

          <div>
            <label className="form-label">Descripción (opcional)</label>
            <textarea
              className="form-input"
              placeholder="Breve descripción del propósito de esta encuesta…"
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              style={{ resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label className="form-label">Tema</label>
              <select
                className="form-input"
                value={topic}
                onChange={e => setTopic(e.target.value)}
              >
                {TOPICS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div style={{ flex: 1, minWidth: 140 }}>
              <label className="form-label">Provincia (opcional)</label>
              <select
                className="form-input"
                value={province}
                onChange={e => setProvince(e.target.value)}
              >
                <option value="">Todas las provincias</option>
                {PROVINCE_OPTIONS.filter(Boolean).map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            <div style={{ flex: 1, minWidth: 120 }}>
              <label className="form-label">Estado inicial</label>
              <select
                className="form-input"
                value={status}
                onChange={e => setStatus(e.target.value as 'active' | 'draft')}
              >
                <option value="active">● Activa</option>
                <option value="draft">○ Borrador</option>
              </select>
            </div>
          </div>
        </div>

        {/* ── Section B: AI Generation ── */}
        <div
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '12px 16px',
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: '0.83rem', color: 'var(--text-muted)', flex: 1 }}>
            🤖 Generar preguntas con IA
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              N° preguntas:
            </label>
            <input
              type="number"
              min={1} max={10}
              value={numAI}
              onChange={e => setNumAI(parseInt(e.target.value, 10) || 1)}
              className="form-input"
              style={{ width: 64, padding: '4px 8px', textAlign: 'center' }}
            />
          </div>
          <button
            className="btn btn-secondary"
            onClick={handleAIGenerate}
            disabled={generating}
            style={{ fontSize: '0.82rem', padding: '6px 14px' }}
          >
            {generating ? '⏳ Generando…' : '✨ Generar con IA'}
          </button>
        </div>

        {/* ── Section C: Question Builder ── */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>
              Preguntas ({questions.length}/10)
            </span>
          </div>

          {questions.map((q, qi) => (
            <div
              key={q.id}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: 14,
                marginBottom: 12,
                background: 'var(--bg-surface)',
              }}
            >
              {/* Question header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
                <span style={{
                  fontSize: '0.72rem', fontWeight: 700,
                  background: 'var(--accent)', color: '#fff',
                  borderRadius: 4, padding: '2px 7px', flexShrink: 0, marginTop: 2,
                }}>
                  P{qi + 1}
                </span>
                <input
                  className="form-input"
                  placeholder={`Pregunta ${qi + 1}…`}
                  value={q.question}
                  onChange={e => updateQuestionText(q.id, e.target.value)}
                  style={{ flex: 1 }}
                />
                <button
                  className="btn btn-ghost"
                  onClick={() => removeQuestion(q.id)}
                  disabled={questions.length <= 1}
                  title="Eliminar pregunta"
                  style={{
                    color: 'var(--danger)', fontSize: '0.82rem',
                    padding: '4px 8px', flexShrink: 0,
                    opacity: questions.length <= 1 ? 0.3 : 1,
                  }}
                >
                  🗑️
                </button>
              </div>

              {/* Options */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 28 }}>
                {q.options.map((opt, oi) => (
                  <div key={opt.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', width: 18, flexShrink: 0 }}>
                      {String.fromCharCode(65 + oi)}.
                    </span>
                    <input
                      className="form-input"
                      placeholder={`Opción ${String.fromCharCode(65 + oi)}…`}
                      value={opt.text}
                      onChange={e => updateOptionText(q.id, opt.id, e.target.value)}
                      style={{ flex: 1, fontSize: '0.83rem', padding: '5px 10px' }}
                    />
                    <button
                      className="btn btn-ghost"
                      onClick={() => removeOption(q.id, opt.id)}
                      disabled={q.options.length <= 2}
                      title="Eliminar opción"
                      style={{
                        color: 'var(--text-muted)', fontSize: '0.75rem',
                        padding: '3px 6px', flexShrink: 0,
                        opacity: q.options.length <= 2 ? 0.3 : 1,
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}

                {q.options.length < 6 && (
                  <button
                    className="btn btn-ghost"
                    onClick={() => addOption(q.id)}
                    style={{ alignSelf: 'flex-start', fontSize: '0.78rem', padding: '3px 10px', marginTop: 2 }}
                  >
                    + Opción
                  </button>
                )}
              </div>
            </div>
          ))}

          {questions.length < 10 && (
            <button
              className="btn btn-secondary"
              onClick={addQuestion}
              style={{ width: '100%', fontSize: '0.83rem', padding: '8px' }}
            >
              + Agregar pregunta
            </button>
          )}
        </div>

        {/* ── Footer Actions ── */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving}
            style={{ minWidth: 140 }}
          >
            {saving ? '⏳ Guardando…' : '💾 Guardar Encuesta'}
          </button>
        </div>
      </div>
    </div>
  )
}
