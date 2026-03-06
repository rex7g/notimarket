// src/types.ts – Shared types for NotiMarket Node API

export interface SimpleNewsItem {
    id: string
    title: string
    summary: string | null
    source: string | null
    published_at: string | null
    url: string
    sentiment: 'positivo' | 'negativo' | 'neutral'
    topic: string
}

/** Raw shape returned by news-intelligence-api */
export interface RawNewsItem {
    original_url?: string
    title?: string
    summary?: string
    source_name?: string
    published_at?: string
    sentiment?: string
    [key: string]: unknown
}
