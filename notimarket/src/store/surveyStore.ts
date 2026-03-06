// src/store/surveyStore.ts
// Zustand store for Surveys (Encuestas) — separate from the bot-generated Poll store.
// Vote tallies are NOT cached in surveys.questions JSONB.
// Results are fetched via the get_survey_results() Supabase RPC.

import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { Survey, SurveyAnswer, SurveyResultItem } from '../types'

interface SurveyStore {
  surveys: Survey[]
  loading: boolean
  /** Survey IDs the current user has already answered */
  respondedIds: Set<string>
  /** Aggregated vote counts per survey, keyed by survey_id */
  surveyResults: Record<string, SurveyResultItem[]>

  fetchSurveys: () => Promise<void>
  fetchUserResponses: (userId: string) => Promise<void>
  /** Fetches option-level vote counts via get_survey_results() RPC */
  fetchSurveyResults: (surveyId: string) => Promise<void>
  addSurvey: (s: Survey) => void
  updateSurvey: (s: Survey) => void
  removeSurvey: (id: string) => void
  submitResponse: (
    surveyId: string,
    userId: string,
    answers: SurveyAnswer[],
    province?: string,
    captchaScore?: number
  ) => Promise<{ error: string | null }>
}

export const useSurveyStore = create<SurveyStore>()((set, get) => ({
  surveys: [],
  loading: false,
  respondedIds: new Set(),
  surveyResults: {},

  fetchSurveys: async () => {
    set({ loading: true })
    const { data, error } = await supabase
      .from('surveys')
      .select('*')
      .order('created_at', { ascending: false })
    if (!error && data) set({ surveys: data as Survey[] })
    set({ loading: false })
  },

  fetchUserResponses: async (userId: string) => {
    const { data } = await supabase
      .from('survey_responses')
      .select('survey_id')
      .eq('user_id', userId)
    if (data) {
      const ids = new Set(data.map((r: { survey_id: string }) => r.survey_id))
      set({ respondedIds: ids })
      // Pre-fetch results for surveys the user has already answered
      for (const id of ids) {
        get().fetchSurveyResults(id)
      }
    }
  },

  fetchSurveyResults: async (surveyId: string) => {
    const { data, error } = await supabase.rpc('get_survey_results', {
      p_survey_id: surveyId,
    })
    if (!error && data) {
      set(st => ({
        surveyResults: {
          ...st.surveyResults,
          [surveyId]: (data as { question_id: string; option_id: string; vote_count: number }[]).map(r => ({
            question_id: r.question_id,
            option_id: r.option_id,
            vote_count: Number(r.vote_count),
          })),
        },
      }))
    }
  },

  addSurvey: (s) => set(st => ({ surveys: [s, ...st.surveys] })),

  updateSurvey: (s) =>
    set(st => ({ surveys: st.surveys.map(x => x.id === s.id ? s : x) })),

  removeSurvey: (id) =>
    set(st => ({ surveys: st.surveys.filter(x => x.id !== id) })),

  submitResponse: async (surveyId, userId, answers, province, captchaScore) => {
    if (get().respondedIds.has(surveyId)) {
      return { error: 'Ya enviaste tu respuesta a esta encuesta.' }
    }

    const { error } = await supabase.from('survey_responses').insert({
      survey_id: surveyId,
      user_id: userId,
      answers,
      province: province ?? null,
      captcha_score: captchaScore ?? null,
    })

    if (error) {
      if (error.code === '23505') {
        set(st => ({ respondedIds: new Set([...st.respondedIds, surveyId]) }))
        return { error: 'Ya enviaste tu respuesta a esta encuesta.' }
      }
      return { error: error.message }
    }

    // Mark as responded and refresh total_responses counter
    set(st => ({ respondedIds: new Set([...st.respondedIds, surveyId]) }))
    const { data: fresh } = await supabase
      .from('surveys')
      .select('*')
      .eq('id', surveyId)
      .single()
    if (fresh) {
      set(st => ({
        surveys: st.surveys.map(s => s.id === surveyId ? fresh as Survey : s),
      }))
    }

    // Fetch real aggregated results from survey_responses via RPC
    await get().fetchSurveyResults(surveyId)

    return { error: null }
  },
}))
