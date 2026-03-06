// src/hooks/useBotConfig.ts
// Persists BotConfig to Supabase (bot_configs table) and keeps Zustand in sync.
// Falls back to Zustand/localStorage when user is not authenticated.

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { usePollStore } from '../store/pollStore'
import { useAuth } from '../contexts/AuthContext'
import type { BotConfig } from '../types'

interface UseBotConfig {
    config: BotConfig
    loading: boolean
    saving: boolean
    save: (config: BotConfig) => Promise<boolean>
}

export function useBotConfig(): UseBotConfig {
    const { user } = useAuth()
    const storeConfig = usePollStore(s => s.botConfig)
    const setStoreConfig = usePollStore(s => s.setBotConfig)

    const [saving, setSaving] = useState(false)
    const [loading, setLoading] = useState(false)

    // ── Load from Supabase on mount (when user is present) ──────────────────────
    useEffect(() => {
        if (!user) return
        let cancelled = false

            ; (async () => {
                setLoading(true)
                const { data, error } = await supabase
                    .from('bot_configs')
                    .select('*')
                    .eq('user_id', user.id)
                    .maybeSingle()          // returns null (not error) when no row yet

                if (!cancelled && !error && data) {
                    setStoreConfig({
                        enabled: data.enabled,
                        llmProvider: data.llm_provider as BotConfig['llmProvider'],
                        llmApiKey: data.llm_api_key ?? '',
                        openrouterModel: data.openrouter_model,
                        topic: data.topic,
                        intervalMinutes: data.interval_minutes,
                        assetId: data.asset_id ?? undefined,
                    })
                }
                if (!cancelled) setLoading(false)
            })()

        return () => { cancelled = true }
    }, [user, setStoreConfig])

    // ── Save to Supabase + Zustand ───────────────────────────────────────────────
    const save = useCallback(async (config: BotConfig): Promise<boolean> => {
        // Always persist locally
        setStoreConfig(config)

        if (!user) return true   // no user → only local save

        setSaving(true)
        const { error } = await supabase
            .from('bot_configs')
            .upsert({
                user_id: user.id,
                enabled: config.enabled,
                llm_provider: config.llmProvider,
                llm_api_key: config.llmApiKey || null,
                openrouter_model: config.openrouterModel,
                topic: config.topic,
                interval_minutes: config.intervalMinutes,
                asset_id: config.assetId ?? null,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'user_id' })

        setSaving(false)

        if (error) {
            console.error('[useBotConfig] Supabase save error:', error.message)
            return false
        }
        return true
    }, [user, setStoreConfig])

    return { config: storeConfig, loading, saving, save }
}
