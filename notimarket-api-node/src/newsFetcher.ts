// src/newsFetcher.ts – Internal client for news-intelligence-api
// Mirrors the behaviour of the original Python news_fetcher.py

import axios from 'axios'
import { createHash } from 'node:crypto'
import type { SimpleNewsItem, RawNewsItem } from './types.js'

// ─── Sentiment normalizer ─────────────────────────────────────────────────────
const SENTIMENT_MAP: Record<string, 'positivo' | 'negativo' | 'neutral'> = {
    bullish: 'positivo',
    positive: 'positivo',
    bearish: 'negativo',
    negative: 'negativo',
    neutral: 'neutral',
}

function normalizeSentiment(raw?: string): 'positivo' | 'negativo' | 'neutral' {
    if (!raw) return 'neutral'
    return SENTIMENT_MAP[raw.toLowerCase()] ?? 'neutral'
}

// ─── MD5-based deterministic ID (same as Python implementation) ───────────────
function makeId(url: string): string {
    return createHash('md5').update(url).digest('hex').slice(0, 12)
}

// ─── Main fetcher ─────────────────────────────────────────────────────────────
export async function fetchNews(
    baseUrl: string,
    options: { assetId?: string; limit?: number; topic?: string } = {}
): Promise<SimpleNewsItem[]> {
    const { assetId, limit = 20, topic = 'politica' } = options

    const params: Record<string, string | number> = { limit: Math.min(limit, 50) }
    if (assetId) params.asset_id = assetId

    try {
        const { data } = await axios.get<RawNewsItem[]>(`${baseUrl}/news`, {
            params,
            timeout: 10_000,
        })

        return data.map((item): SimpleNewsItem => {
            const url = item.original_url ?? ''
            return {
                id: makeId(url),
                title: item.title ?? 'Sin título',
                summary: item.summary ?? null,
                source: item.source_name ?? null,
                published_at: item.published_at ?? null,
                url,
                sentiment: normalizeSentiment(item.sentiment),
                topic,
            }
        })
    } catch (err) {
        if (axios.isAxiosError(err)) {
            console.error(`[newsFetcher] HTTP error contacting upstream: ${err.message}`)
        } else {
            console.error(`[newsFetcher] Unexpected error: ${String(err)}`)
        }
        return []
    }
}
