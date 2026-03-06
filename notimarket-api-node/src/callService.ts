// src/callService.ts
// ElevenLabs outbound call service for TuNoti phone survey campaigns (Premium).
// Uses ElevenLabs Conversational AI + Twilio telephony.
// Webhook endpoint: POST /api/calls/webhook (in index.ts)

import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js'
import { createClient } from '@supabase/supabase-js'
import axios from 'axios'

// ── Supabase (service role for admin writes) ──────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// ── ElevenLabs client ─────────────────────────────────────────────────────────
const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
})

// ── Types ─────────────────────────────────────────────────────────────────────
export interface SurveyForCall {
  id: string
  title: string
  topic: string
  questions: Array<{
    id: string
    question: string
    options: Array<{ id: string; text: string }>
  }>
}

export interface CallContact {
  phone: string
  name?: string
}

export interface TranscriptMessage {
  role: 'agent' | 'user'
  message: string
}

export interface ParsedAnswer {
  question_id: string
  option_id: string
  option_index: number
}

// ── Build question text for agent prompt ──────────────────────────────────────
export function buildQuestionsText(survey: SurveyForCall): string {
  return survey.questions
    .map((q, qi) => {
      const opts = q.options
        .map((o, oi) => `   ${oi + 1}. ${o.text}`)
        .join('\n')
      return `Pregunta ${qi + 1}: ${q.question}\nOpciones:\n${opts}`
    })
    .join('\n\n')
}

// ── Initiate a single outbound call ──────────────────────────────────────────
export async function initiateCall(
  survey: SurveyForCall,
  contact: CallContact,
  campaignId: string,
): Promise<{ callId: string; conversationId: string | null }> {
  const agentId = process.env.ELEVENLABS_AGENT_ID!
  const phoneNumberId = process.env.ELEVENLABS_PHONE_NUMBER_ID!

  // Insert phone_call row as 'calling'
  const { data: callRow, error: insertErr } = await supabase
    .from('phone_calls')
    .insert({
      campaign_id: campaignId,
      survey_id: survey.id,
      phone_number: contact.phone,
      contact_name: contact.name ?? null,
      status: 'calling',
    })
    .select('id')
    .single()

  if (insertErr || !callRow) {
    throw new Error(`Failed to insert phone_call: ${insertErr?.message}`)
  }

  const questionsText = buildQuestionsText(survey)

  try {
    // ElevenLabs outbound call via Twilio native integration
    const res = await elevenlabs.conversationalAi.twilio.outboundCall({
      agentId,
      agentPhoneNumberId: phoneNumberId,
      toNumber: contact.phone,
      conversationInitiationClientData: {
        dynamicVariables: {
          contact_name: contact.name ?? 'ciudadano',
          survey_topic: survey.topic,
          num_questions: String(survey.questions.length),
          questions_text: questionsText,
          call_id: callRow.id,
        },
      },
    })

    const conversationId = (res as unknown as { conversation_id?: string }).conversation_id ?? null

    // Store el_conversation_id for webhook reconciliation
    await supabase
      .from('phone_calls')
      .update({ el_conversation_id: conversationId })
      .eq('id', callRow.id)

    // Increment campaign.calls_made
    await supabase.rpc('increment_campaign_calls_made', { campaign_id: campaignId })

    return { callId: callRow.id, conversationId }
  } catch (err) {
    await supabase
      .from('phone_calls')
      .update({ status: 'failed', completed_at: new Date().toISOString() })
      .eq('id', callRow.id)
    throw err
  }
}

// ── Parse transcript → survey answers ────────────────────────────────────────
// Strategy: for each question (in order), find the first user message after
// the agent asked that question and extract the numeric choice (1-4).
// Fallback: call OpenRouter to classify free-text answers.
export async function parseTranscript(
  transcript: TranscriptMessage[],
  survey: SurveyForCall,
): Promise<ParsedAnswer[]> {
  const answers: ParsedAnswer[] = []
  const userMessages = transcript.filter(m => m.role === 'user').map(m => m.message)

  for (let qi = 0; qi < survey.questions.length; qi++) {
    const q = survey.questions[qi]
    const userMsg = userMessages[qi] ?? ''

    // Try direct number extraction first
    const numMatch = userMsg.match(/\b([1-4])\b/)
    if (numMatch) {
      const idx = parseInt(numMatch[1], 10) - 1
      const opt = q.options[idx]
      if (opt) {
        answers.push({ question_id: q.id, option_id: opt.id, option_index: idx })
        continue
      }
    }

    // Fallback: OpenRouter LLM classification
    const optionLabels = q.options.map((o, i) => `${i + 1}. ${o.text}`).join('\n')
    try {
      const llmRes = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: process.env.OPENROUTER_BOT_DETECT_MODEL ?? 'openai/gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                'Eres un clasificador de respuestas de encuesta. ' +
                'Dado el mensaje del usuario y las opciones disponibles, ' +
                'responde ÚNICAMENTE con el número de la opción elegida (1, 2, 3 o 4). ' +
                'Si no puedes determinar la respuesta, responde con 0.',
            },
            {
              role: 'user',
              content: `Pregunta: ${q.question}\nOpciones:\n${optionLabels}\nRespuesta del usuario: "${userMsg}"`,
            },
          ],
          temperature: 0,
          max_tokens: 5,
        },
        { headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` } },
      )
      const choice = parseInt(
        (llmRes.data.choices?.[0]?.message?.content ?? '0').trim(),
        10,
      )
      if (choice >= 1 && choice <= q.options.length) {
        const idx = choice - 1
        answers.push({ question_id: q.id, option_id: q.options[idx].id, option_index: idx })
        continue
      }
    } catch {
      // LLM classification failed — skip this question
    }

    // Could not classify — skip (no answer recorded for this question)
  }

  return answers
}

// ── Insert survey_responses for phone call ────────────────────────────────────
// Uses phone_call_id instead of user_id (phone responses have no auth user).
// Service role key bypasses RLS so null user_id is allowed.
export async function insertSurveyResponse(
  surveyId: string,
  phoneCallId: string,
  answers: ParsedAnswer[],
): Promise<void> {
  if (answers.length === 0) return

  const { error } = await supabase.from('survey_responses').insert({
    survey_id: surveyId,
    user_id: null,
    phone_call_id: phoneCallId,
    answers,
    province: null,
    captcha_score: null,
  })

  if (error && error.code !== '23505') {
    console.error('[callService] insertSurveyResponse error:', error.message)
  }
}

// ── Handle incoming ElevenLabs webhook ───────────────────────────────────────
export async function handleCallWebhook(payload: {
  conversation_id: string
  transcript: TranscriptMessage[]
  call_duration_secs?: number
  call_status?: string
}): Promise<void> {
  const { conversation_id, transcript, call_duration_secs, call_status } = payload

  // Find phone_call by ElevenLabs conversation_id
  const { data: callRow } = await supabase
    .from('phone_calls')
    .select('id, survey_id, campaign_id')
    .eq('el_conversation_id', conversation_id)
    .single()

  if (!callRow) {
    console.warn(`[callService] Webhook for unknown conversation_id: ${conversation_id}`)
    return
  }

  const answered = transcript.some(m => m.role === 'user')
  const status = call_status === 'completed' ? 'completed'
    : call_status === 'no_answer' ? 'no_answer'
    : 'failed'

  // Update phone_call row
  await supabase
    .from('phone_calls')
    .update({
      status,
      answered,
      transcript,
      duration_secs: call_duration_secs ?? null,
      completed_at: new Date().toISOString(),
    })
    .eq('id', callRow.id)

  // Increment campaign.calls_done (atomic via RPC)
  await supabase.rpc('increment_campaign_calls_done', {
    campaign_id: callRow.campaign_id,
  })

  // If answered, parse transcript and save response
  if (answered && status === 'completed') {
    // Fetch survey with questions
    const { data: survey } = await supabase
      .from('surveys')
      .select('id, title, topic, questions')
      .eq('id', callRow.survey_id)
      .single()

    if (survey) {
      const answers = await parseTranscript(transcript, survey as SurveyForCall)
      if (answers.length > 0) {
        await insertSurveyResponse(callRow.survey_id, callRow.id, answers)
      }
    }
  }

  // Check if campaign is now fully done
  const { data: campaign } = await supabase
    .from('phone_campaigns')
    .select('calls_done, total_numbers')
    .eq('id', callRow.campaign_id)
    .single()

  if (campaign && campaign.calls_done >= campaign.total_numbers) {
    await supabase
      .from('phone_campaigns')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', callRow.campaign_id)
  }
}
