// src/components/SurveyCard.tsx
// User-facing multi-question survey card with reCAPTCHA v3 trust filter.
// Pre-vote: selectable option buttons per question.
// Post-vote: result bars computed from real survey_responses via get_survey_results() RPC.

import { useState } from 'react'
import toast from 'react-hot-toast'
import { getRecaptchaToken } from '../lib/recaptcha'
import type { Survey, SurveyAnswer, SurveyResultItem } from '../types'

const API_URL = import.meta.env.VITE_NEWS_API_URL as string ?? 'http://localhost:8001'

interface Selection {
  optionId: string
  optionIndex: number
}

interface Props {
  survey: Survey
  hasResponded: boolean
  /** Aggregated results from get_survey_results() RPC, passed from store */
  results: SurveyResultItem[]
  onSubmit: (
    surveyId: string,
    answers: SurveyAnswer[],
    captchaScore?: number,
  ) => Promise<{ error: string | null }>
}

export default function SurveyCard({ survey, hasResponded, results, onSubmit }: Props) {
  const [selections, setSelections] = useState<Record<string, Selection>>({})
  const [submitting, setSubmitting] = useState(false)
  const [responded, setResponded] = useState(hasResponded)

  const allAnswered = survey.questions.every(q => !!selections[q.id])

  // ── Result helpers (computed from real RPC data) ─────────────────────────
  const getVoteCount = (questionId: string, optionId: string): number =>
    results.find(r => r.question_id === questionId && r.option_id === optionId)?.vote_count ?? 0

  const getQuestionTotal = (questionId: string): number =>
    results
      .filter(r => r.question_id === questionId)
      .reduce((sum, r) => sum + r.vote_count, 0)

  // Topic badge color
  const topicColor = (() => {
    const map: Record<string, string> = {
      política: '#3b82f6', economía: '#10b981', educación: '#f59e0b',
      salud: '#ef4444', seguridad: '#8b5cf6', 'medio ambiente': '#22c55e',
      turismo: '#06b6d4', transporte: '#f97316', elecciones: '#ec4899',
    }
    return map[survey.topic.toLowerCase()] ?? '#6366f1'
  })()

  const handleSelect = (questionId: string, optionId: string, optionIndex: number) => {
    if (responded) return
    setSelections(s => ({ ...s, [questionId]: { optionId, optionIndex } }))
  }

  const handleSubmit = async () => {
    if (!allAnswered || submitting) return
    setSubmitting(true)
    try {
      // 1. Get reCAPTCHA v3 token (null if site key not configured)
      const token = await getRecaptchaToken('vote_survey')

      let captchaScore: number | undefined

      if (token) {
        // 2. Verify with Node API
        try {
          const captchaRes = await fetch(`${API_URL}/api/verify-captcha`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, action: 'vote_survey' }),
          })
          const captchaData = await captchaRes.json() as { ok: boolean; score: number }
          if (!captchaData.ok) {
            toast.error('Actividad sospechosa detectada. Por favor intenta de nuevo.')
            setSubmitting(false)
            return
          }
          captchaScore = captchaData.score
        } catch {
          // Captcha endpoint unreachable — proceed without score (non-blocking)
          console.warn('[SurveyCard] reCAPTCHA verify endpoint unreachable – proceeding without score')
        }
      }

      // 3. Build answers array
      const answers: SurveyAnswer[] = survey.questions.map(q => ({
        question_id: q.id,
        option_id: selections[q.id].optionId,
        option_index: selections[q.id].optionIndex,
      }))

      // 4. Submit — store fetches real results via RPC after insert
      const { error } = await onSubmit(survey.id, answers, captchaScore)
      if (error) {
        toast.error(error)
      } else {
        toast.success('¡Respuesta enviada!')
        setResponded(true)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <article className="poll-card survey-card">
      {/* ── Header ── */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 6 }}>
          <h3 style={{ flex: 1, fontSize: '0.95rem', fontWeight: 700, lineHeight: 1.4 }}>
            {survey.title}
          </h3>
          <span
            style={{
              fontSize: '0.68rem', fontWeight: 600,
              padding: '2px 8px', borderRadius: 999,
              background: `${topicColor}22`, color: topicColor,
              border: `1px solid ${topicColor}44`,
              flexShrink: 0,
            }}
          >
            {survey.topic}
          </span>
        </div>

        {survey.description && (
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {survey.description}
          </p>
        )}

        <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          <span>📋 {survey.questions.length} pregunta{survey.questions.length !== 1 ? 's' : ''}</span>
          <span>👥 {survey.total_responses} respuesta{survey.total_responses !== 1 ? 's' : ''}</span>
          {survey.province && <span>📍 {survey.province}</span>}
        </div>
      </div>

      {/* ── Questions ── */}
      {survey.questions.map((q, qi) => (
        <div key={q.id} className="survey-question-block">
          <p className="survey-question-label">
            {qi + 1}. {q.question}
          </p>

          <div className="poll-options">
            {q.options.map((opt, oi) => {
              if (responded) {
                // Result bars — counts come from get_survey_results() RPC via store
                const questionTotal = getQuestionTotal(q.id)
                const voteCount = getVoteCount(q.id, opt.id)
                const pct = questionTotal > 0
                  ? Math.round((voteCount / questionTotal) * 100)
                  : 0
                const wasSelected = selections[q.id]?.optionId === opt.id
                return (
                  <div key={opt.id} className={`poll-option-result${wasSelected ? ' selected' : ''}`}>
                    <div className="result-bar" style={{ width: `${pct}%` }} />
                    <div className="result-content">
                      <span>
                        {opt.text}
                        {wasSelected && (
                          <span style={{ marginLeft: 6, fontSize: '0.72rem', color: 'var(--accent)' }}>
                            ✓ Tu voto
                          </span>
                        )}
                      </span>
                      <span className="result-pct">{pct}%</span>
                    </div>
                  </div>
                )
              }

              // Voting state
              const isSelected = selections[q.id]?.optionId === opt.id
              return (
                <button
                  key={opt.id}
                  className={`poll-option-btn${isSelected ? ' selected' : ''}`}
                  onClick={() => handleSelect(q.id, opt.id, oi)}
                >
                  <span style={{ fontSize: '0.72rem', marginRight: 6, color: 'var(--text-muted)' }}>
                    {String.fromCharCode(65 + oi)}.
                  </span>
                  {opt.text}
                </button>
              )
            })}
          </div>
        </div>
      ))}

      {/* ── Submit button ── */}
      {!responded && (
        <button
          className="btn btn-primary"
          style={{ width: '100%', marginTop: 8 }}
          onClick={handleSubmit}
          disabled={!allAnswered || submitting}
        >
          {submitting
            ? '⏳ Enviando…'
            : !allAnswered
              ? `Responde todas las preguntas (${Object.keys(selections).length}/${survey.questions.length})`
              : 'Enviar respuesta'}
        </button>
      )}

      {/* ── Footer ── */}
      <div className="poll-footer" style={{ marginTop: responded ? 12 : 8 }}>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          {responded ? '✓ Ya respondiste esta encuesta' : ''}
        </span>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          {survey.total_responses} respuesta{survey.total_responses !== 1 ? 's' : ''}
        </span>
      </div>
    </article>
  )
}
