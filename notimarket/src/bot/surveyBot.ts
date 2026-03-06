// src/bot/surveyBot.ts
// Generates multi-question surveys from a topic using an LLM.
// Completely separate from pollBot.ts (which generates single-question polls from news).
// Uses the same OpenRouter fetch pattern as pollBot.ts.

import { v4 as uuidv4 } from 'uuid'
import type { BotConfig, SurveyQuestion, SurveyOption } from '../types'

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildPrompt(topic: string, title: string, n: number): string {
  return `Eres un experto en diseño de encuestas políticas para República Dominicana.

Genera exactamente ${n} pregunta${n > 1 ? 's' : ''} para una encuesta titulada "${title}" sobre el tema "${topic}".
Cada pregunta debe tener exactamente 4 opciones claras, balanceadas y en español dominicano.
Evita preguntas sesgadas. Las opciones deben cubrir el espectro de opiniones.

Responde ÚNICAMENTE con este JSON válido (sin markdown, sin texto adicional):
{"questions":[{"question":"...","options":["...","...","...","..."]}]}`
}

// ── Response parser ───────────────────────────────────────────────────────────

function parseQuestions(raw: string): SurveyQuestion[] {
  const match = raw.match(/\{[\s\S]*\}/)
  const parsed = JSON.parse(match?.[0] ?? raw) as {
    questions: { question: string; options: string[] }[]
  }
  return parsed.questions.map(q => ({
    id: uuidv4(),
    question: q.question,
    options: q.options.map((text): SurveyOption => ({ id: uuidv4(), text })),
  }))
}

// ── Mock fallback (no API key required) ──────────────────────────────────────

function mockQuestions(topic: string, n: number): SurveyQuestion[] {
  const templates = [
    `¿Cómo calificarías la situación actual de "${topic}" en República Dominicana?`,
    `¿Qué medida es más urgente para mejorar "${topic}"?`,
    `¿Confías en las instituciones que gestionan "${topic}"?`,
    `¿Ha mejorado la situación de "${topic}" en el último año?`,
    `¿Quién debe liderar el cambio en materia de "${topic}"?`,
    `¿Está satisfecho con las políticas actuales sobre "${topic}"?`,
    `¿Qué tan informado se siente sobre "${topic}"?`,
    `¿Cómo afecta "${topic}" a su vida cotidiana?`,
    `¿Apoyaría nuevas inversiones para mejorar "${topic}"?`,
    `¿Qué factor influye más en el problema de "${topic}"?`,
  ]
  return templates.slice(0, n).map(question => ({
    id: uuidv4(),
    question,
    options: [
      { id: uuidv4(), text: 'Muy de acuerdo / Muy bien' },
      { id: uuidv4(), text: 'De acuerdo / Bien' },
      { id: uuidv4(), text: 'En desacuerdo / Mal' },
      { id: uuidv4(), text: 'Sin opinión formada' },
    ],
  }))
}

// ── OpenRouter call (mirrors pollBot.ts exactly) ─────────────────────────────

async function openrouterGenerate(
  topic: string,
  title: string,
  n: number,
  apiKey: string,
  model: string,
): Promise<SurveyQuestion[]> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': window.location.origin,
      'X-Title': 'TuNoti SurveyBot',
    },
    body: JSON.stringify({
      model: model || 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: buildPrompt(topic, title, n) }],
      temperature: 0.7,
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message ?? `OpenRouter error ${res.status}`)
  return parseQuestions(data.choices[0].message.content as string)
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generates survey questions for a given topic using the configured LLM.
 * Falls back to mock questions if no API key is set.
 * @param topic     Survey topic (e.g. 'economía', 'elecciones 2024')
 * @param title     Survey title (used for context in the prompt)
 * @param n         Number of questions (1–10)
 * @param config    Subset of BotConfig from the Zustand poll store
 */
export async function generateSurveyQuestions(
  topic: string,
  title: string,
  n: number,
  config: Pick<BotConfig, 'llmProvider' | 'llmApiKey' | 'openrouterModel'>,
): Promise<SurveyQuestion[]> {
  const count = Math.max(1, Math.min(10, n))

  if (config.llmProvider !== 'mock' && config.llmApiKey) {
    return openrouterGenerate(topic, title, count, config.llmApiKey, config.openrouterModel)
  }

  return mockQuestions(topic, count)
}
