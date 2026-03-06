/**
 * notimarket-api-node – Express server
 *
 * Endpoints:
 *   GET  /                    – Service info
 *   GET  /health              – Health check
 *   GET  /news                – Fetch + persist news from upstream
 *   POST /email/share-poll    – Send poll via email (Resend)
 *   GET  /sources             – List configured news sources
 *   POST /sources             – Add a news source (auto-detects RSS)
 *   DELETE /sources/:id       – Remove a news source
 *   GET  /scrape              – Scrape articles from a source
 *   POST /social/fetch        – Fetch + cache social comments for a poll
 *   GET  /social/comments     – Return cached comments for a poll
 */

import 'dotenv/config'
import express, { type Request, type Response, type NextFunction } from 'express'
import cors from 'cors'
import axios from 'axios'
import { createClient } from '@supabase/supabase-js'
import { fetchNews } from './newsFetcher.js'
import { sendSharePollEmail, type SharePollPayload } from './emailService.js'
import {
  detectRssFeed,
  scrapeArticlesFromRss,
  scrapeArticlesFromHtml,
} from './scraperService.js'
import {
  fetchTwitterComments,
  fetchFacebookComments,
  fetchTikTokComments,
  detectBotComments,
  type RawComment,
} from './socialService.js'
import type { SimpleNewsItem } from './types.js'

// ─── Config ───────────────────────────────────────────────────────────────────
const NEWS_API_BASE_URL = process.env.NEWS_API_BASE_URL ?? 'http://localhost:8000'
const APP_PORT = parseInt(process.env.APP_PORT ?? '8001', 10)
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173,http://localhost:3000')
    .split(',').map(o => o.trim()).filter(Boolean)

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? ''
const OPENROUTER_BOT_MODEL = process.env.OPENROUTER_BOT_DETECT_MODEL ?? 'openai/gpt-4o-mini'

// ─── Supabase ─────────────────────────────────────────────────────────────────
const supabaseUrl = process.env.SUPABASE_URL ?? ''
// Use service role key for server-side writes; fall back to anon for reads
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? ''
const supabaseKey = supabaseServiceKey || supabaseAnonKey

const supabase = supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey)
    : null

if (!supabase) {
    console.warn('⚠️  Supabase not configured – DB features disabled.')
}

const hasServiceKey = Boolean(supabaseServiceKey)

async function persistNews(items: SimpleNewsItem[]): Promise<void> {
    if (!supabase || items.length === 0) return
    try {
        const rows = items.map(item => ({
            id: item.id,
            title: item.title,
            summary: item.summary,
            source: item.source,
            published_at: item.published_at,
            url: item.url,
            sentiment: item.sentiment,
            topic: item.topic,
            fetched_at: new Date().toISOString(),
        }))
        const { error } = await supabase
            .from('news')
            .upsert(rows, { onConflict: 'id', ignoreDuplicates: false })
        if (error) console.error('[supabase] upsert error:', error.message)
        else console.log(`[supabase] Persisted ${rows.length} news items`)
    } catch (err) {
        console.error('[supabase] Unexpected error:', String(err))
    }
}

async function fetchNewsFromDb(topic: string, limit: number): Promise<SimpleNewsItem[]> {
    if (!supabase) return []
    try {
        const { data, error } = await supabase
            .from('news')
            .select('*')
            .eq('topic', topic)
            .order('fetched_at', { ascending: false })
            .limit(limit)
        if (error) { console.error('[supabase] select error:', error.message); return [] }
        return (data ?? []) as SimpleNewsItem[]
    } catch {
        return []
    }
}

// ─── App setup ────────────────────────────────────────────────────────────────
const app = express()
app.use(express.json())
app.use(cors({
    origin: ALLOWED_ORIGINS,
    credentials: true,
    methods: ['GET', 'HEAD', 'OPTIONS', 'POST', 'DELETE', 'PATCH'],
}))

app.use((req: Request, _res: Response, next: NextFunction) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`)
    next()
})

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get('/', (_req: Request, res: Response) => {
    res.json({
        name: 'TuNoti API (Node)',
        version: '2.0.0',
        endpoints: ['/news', '/health', '/email/share-poll', '/sources', '/scrape', '/social/fetch', '/social/comments'],
    })
})

app.get('/health', async (_req: Request, res: Response) => {
    let upstreamOk = false
    let dbOk = false
    try {
        const r = await axios.get(`${NEWS_API_BASE_URL}/health`, { timeout: 5_000 })
        upstreamOk = r.status === 200
    } catch { /* silent */ }

    if (supabase) {
        try {
            const { error } = await supabase.from('news').select('id').limit(1)
            dbOk = !error
        } catch { /* silent */ }
    }

    res.json({
        status: 'ok',
        upstream_api: upstreamOk ? 'reachable' : 'unreachable',
        upstream_url: NEWS_API_BASE_URL,
        database: supabase ? (dbOk ? 'connected' : 'error') : 'not_configured',
        service_key: hasServiceKey ? 'configured' : 'missing (read-only mode)',
    })
})

/** GET /news – Fetch news from upstream, persist + serve */
app.get('/news', async (req: Request, res: Response) => {
    const topic = typeof req.query.topic === 'string' ? req.query.topic : 'politica'
    const assetId = typeof req.query.asset_id === 'string' ? req.query.asset_id : undefined
    const rawLimit = parseInt(String(req.query.limit ?? '20'), 10)
    const limit = isNaN(rawLimit) ? 20 : Math.min(Math.max(rawLimit, 1), 50)

    let items = await fetchNews(NEWS_API_BASE_URL, { assetId, limit, topic })

    if (items.length > 0) {
        persistNews(items).catch(() => { })
    } else {
        console.warn('[/news] Upstream returned 0 items – falling back to Supabase cache')
        items = await fetchNewsFromDb(topic, limit)
        if (items.length > 0) {
            console.log(`[/news] Served ${items.length} items from Supabase cache`)
        }
    }

    res.json(items)
})

/** POST /email/share-poll */
app.post('/email/share-poll', async (req: Request, res: Response) => {
    const { to, recipientName, pollQuestion, pollUrl, pollOptions } = req.body as Partial<SharePollPayload>

    if (!to || !pollQuestion || !pollUrl || !Array.isArray(pollOptions)) {
        res.status(400).json({ error: 'Missing required fields: to, pollQuestion, pollUrl, pollOptions' })
        return
    }

    if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY.startsWith('re_your')) {
        res.status(503).json({ error: 'Email service not configured. Set RESEND_API_KEY.' })
        return
    }

    try {
        await sendSharePollEmail({ to, recipientName, pollQuestion, pollUrl, pollOptions })
        res.json({ success: true, to })
    } catch (err) {
        console.error('[email] Error:', String(err))
        res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to send email' })
    }
})

// ─── News Sources ─────────────────────────────────────────────────────────────

/** GET /sources – list enabled news sources */
app.get('/sources', async (_req: Request, res: Response) => {
    if (!supabase) { res.json([]); return }
    const { data, error } = await supabase
        .from('news_sources')
        .select('*')
        .order('created_at', { ascending: true })
    if (error) { res.status(500).json({ error: error.message }); return }
    res.json(data ?? [])
})

/** POST /sources – add a news source, auto-detect RSS */
app.post('/sources', async (req: Request, res: Response) => {
    const { url, name } = req.body as { url?: string; name?: string }
    if (!url || !name) { res.status(400).json({ error: 'url and name required' }); return }
    if (!supabase) { res.status(503).json({ error: 'Supabase not configured' }); return }

    // Auto-detect RSS feed
    let rss_url: string | null = null
    try {
        rss_url = await detectRssFeed(url)
        if (rss_url) console.log(`[sources] RSS detected: ${rss_url}`)
        else console.log(`[sources] No RSS found for ${url}, will use HTML scraping`)
    } catch (e) {
        console.warn('[sources] RSS detection error:', String(e))
    }

    const { data, error } = await supabase
        .from('news_sources')
        .insert({ url, name, rss_url, enabled: true })
        .select()
        .single()

    if (error) {
        if (error.code === '23505') { res.status(409).json({ error: 'Source URL already exists' }); return }
        res.status(500).json({ error: error.message }); return
    }
    res.status(201).json(data)
})

/** DELETE /sources/:id – remove a news source */
app.delete('/sources/:id', async (req: Request, res: Response) => {
    if (!supabase) { res.status(503).json({ error: 'Supabase not configured' }); return }
    const { error } = await supabase
        .from('news_sources')
        .delete()
        .eq('id', req.params.id)
    if (error) { res.status(500).json({ error: error.message }); return }
    res.json({ success: true })
})

/** GET /scrape?sourceId= – scrape articles from a configured source */
app.get('/scrape', async (req: Request, res: Response) => {
    const sourceId = typeof req.query.sourceId === 'string' ? req.query.sourceId : null
    if (!sourceId) { res.status(400).json({ error: 'sourceId required' }); return }
    if (!supabase) { res.status(503).json({ error: 'Supabase not configured' }); return }

    const { data: source, error } = await supabase
        .from('news_sources')
        .select('*')
        .eq('id', sourceId)
        .single()
    if (error || !source) { res.status(404).json({ error: 'Source not found' }); return }

    try {
        let articles
        if (source.rss_url) {
            articles = await scrapeArticlesFromRss(source.rss_url, source.name)
        } else {
            articles = await scrapeArticlesFromHtml(source.url, source.name)
        }
        res.json(articles)
    } catch (err) {
        console.error('[scrape]', String(err))
        res.status(500).json({ error: `Scraping failed: ${String(err)}` })
    }
})

// ─── Social Media ─────────────────────────────────────────────────────────────

/** POST /social/fetch – fetch comments from social media and cache them */
app.post('/social/fetch', async (req: Request, res: Response) => {
    const { pollId, platform, postUrl } = req.body as {
        pollId?: string
        platform?: string
        postUrl?: string
    }

    if (!pollId || !platform || !postUrl) {
        res.status(400).json({ error: 'pollId, platform, postUrl required' })
        return
    }
    if (!supabase) { res.status(503).json({ error: 'Supabase not configured' }); return }

    let rawComments: RawComment[] = []

    try {
        if (platform === 'twitter') {
            const token = process.env.TWITTER_BEARER_TOKEN ?? ''
            if (!token) { res.status(503).json({ error: 'TWITTER_BEARER_TOKEN not configured' }); return }
            rawComments = await fetchTwitterComments(postUrl, token)
        } else if (platform === 'facebook' || platform === 'instagram') {
            const token = process.env.META_ACCESS_TOKEN ?? ''
            if (!token) { res.status(503).json({ error: 'META_ACCESS_TOKEN not configured' }); return }
            rawComments = await fetchFacebookComments(postUrl, token)
        } else if (platform === 'tiktok') {
            const key = process.env.TIKTOK_API_KEY ?? ''
            if (!key) { res.status(503).json({ error: 'TIKTOK_API_KEY not configured' }); return }
            rawComments = await fetchTikTokComments(postUrl, key)
        } else {
            res.status(400).json({ error: `Unknown platform: ${platform}` }); return
        }
    } catch (err) {
        res.status(502).json({ error: `Social API error: ${String(err)}` }); return
    }

    // Run bot detection
    let botResults: Array<{ commentId: string; is_bot: boolean; bot_score: number }> = []
    if (rawComments.length > 0 && OPENROUTER_API_KEY) {
        try {
            botResults = await detectBotComments(rawComments, OPENROUTER_API_KEY, OPENROUTER_BOT_MODEL)
        } catch (e) {
            console.warn('[social] Bot detection failed:', String(e))
        }
    }

    const botMap = new Map(botResults.map(r => [r.commentId, r]))

    // Upsert to Supabase
    const rows = rawComments.map(c => {
        const bot = botMap.get(c.id)
        return {
            poll_id: pollId,
            platform,
            comment_id: c.id,
            author_name: c.author_name,
            author_handle: c.author_handle,
            text: c.text,
            likes: c.likes,
            reply_count: c.reply_count,
            is_bot: bot?.is_bot ?? null,
            bot_score: bot?.bot_score ?? null,
            fetched_at: new Date().toISOString(),
        }
    })

    if (rows.length > 0) {
        const { error: upsertError } = await supabase
            .from('social_comments')
            .upsert(rows, { onConflict: 'platform,comment_id', ignoreDuplicates: false })
        if (upsertError) console.error('[social] upsert error:', upsertError.message)
    }

    res.json({ fetched: rawComments.length, withBotScores: botResults.length })
})

/** GET /social/comments?pollId=&platform= – return cached comments */
app.get('/social/comments', async (req: Request, res: Response) => {
    const pollId = typeof req.query.pollId === 'string' ? req.query.pollId : null
    const platform = typeof req.query.platform === 'string' ? req.query.platform : null
    if (!pollId) { res.status(400).json({ error: 'pollId required' }); return }
    if (!supabase) { res.json([]); return }

    let query = supabase
        .from('social_comments')
        .select('*')
        .eq('poll_id', pollId)
        .order('likes', { ascending: false })
        .limit(100)

    if (platform) query = query.eq('platform', platform)

    const { data, error } = await query
    if (error) { res.status(500).json({ error: error.message }); return }
    res.json(data ?? [])
})

// ─── POST /api/verify-captcha ─────────────────────────────────────────────────
// Verifies a reCAPTCHA v3 token server-side and returns a trust score.
// The secret key never leaves the server.
app.post('/api/verify-captcha', async (req: Request, res: Response) => {
    const { token, action } = req.body as { token?: string; action?: string }

    if (!token) {
        res.status(400).json({ ok: false, error: 'Token required' })
        return
    }

    const secretKey = process.env.RECAPTCHA_SECRET_KEY
    if (!secretKey) {
        // If no secret key configured, allow with null score (dev mode)
        res.json({ ok: true, score: null, reason: 'captcha_disabled' })
        return
    }

    const SCORE_THRESHOLD = 0.5

    try {
        const response = await axios.post<{
            success: boolean
            score: number
            action: string
            'error-codes'?: string[]
        }>(
            'https://www.google.com/recaptcha/api/siteverify',
            null,
            { params: { secret: secretKey, response: token } }
        )

        const { success, score, action: returnedAction } = response.data

        if (!success) {
            res.json({ ok: false, score: 0, reason: 'invalid_token' })
            return
        }
        if (action && returnedAction !== action) {
            res.json({ ok: false, score, reason: 'action_mismatch' })
            return
        }

        res.json({ ok: score >= SCORE_THRESHOLD, score, threshold: SCORE_THRESHOLD })
    } catch (err) {
        console.error('[captcha] Verify error:', String(err))
        res.status(500).json({ ok: false, error: 'Captcha verification failed' })
    }
})

// ══════════════════════════════════════════════════════════════════════════════
// ─── Phone Survey Calls (Premium) ────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
import crypto from 'crypto'
import { initiateCall, handleCallWebhook, type SurveyForCall, type CallContact } from './callService.js'

// Non-null accessor – supabase is guaranteed configured at startup (checked above)
const db = () => supabase!

const ELEVENLABS_AGENT_ID = process.env.ELEVENLABS_AGENT_ID ?? ''
const ELEVENLABS_WEBHOOK_SECRET = process.env.ELEVENLABS_WEBHOOK_SECRET ?? ''

// ── Helper: verify caller is a premium admin ──────────────────────────────────
async function requirePremiumAdmin(req: Request, res: Response): Promise<{ userId: string } | null> {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Missing Authorization header' })
        return null
    }
    const token = authHeader.slice(7)
    const { data: { user }, error } = await db().auth.getUser(token)
    if (error || !user) {
        res.status(401).json({ error: 'Invalid token' })
        return null
    }
    const { data: profile } = await db()
        .from('profiles')
        .select('role, is_premium')
        .eq('id', user.id)
        .single()
    if (profile?.role !== 'admin') {
        res.status(403).json({ error: 'Admin access required' })
        return null
    }
    if (!profile?.is_premium) {
        res.status(403).json({ error: 'Premium plan required for phone campaigns' })
        return null
    }
    return { userId: user.id }
}

// ── POST /api/calls/initiate — single outbound call ───────────────────────────
app.post('/api/calls/initiate', async (req: Request, res: Response) => {
    const caller = await requirePremiumAdmin(req, res)
    if (!caller) return

    const { survey_id, phone_number, contact_name } = req.body as {
        survey_id: string
        phone_number: string
        contact_name?: string
    }
    if (!survey_id || !phone_number) {
        res.status(400).json({ error: 'survey_id and phone_number are required' })
        return
    }
    if (!ELEVENLABS_AGENT_ID) {
        res.status(503).json({ error: 'ElevenLabs agent not configured (ELEVENLABS_AGENT_ID missing)' })
        return
    }

    try {
        // Fetch survey
        const { data: survey, error: surveyErr } = await db()
            .from('surveys')
            .select('id, title, topic, questions')
            .eq('id', survey_id)
            .single()
        if (surveyErr || !survey) {
            res.status(404).json({ error: 'Survey not found' })
            return
        }

        // Create a one-off campaign for this single call
        const { data: campaign, error: campErr } = await db()
            .from('phone_campaigns')
            .insert({
                survey_id,
                created_by: caller.userId,
                status: 'running',
                total_numbers: 1,
                calls_made: 0,
                calls_done: 0,
                agent_id: ELEVENLABS_AGENT_ID,
            })
            .select('id')
            .single()
        if (campErr || !campaign) {
            res.status(500).json({ error: 'Failed to create campaign' })
            return
        }

        const result = await initiateCall(
            survey as SurveyForCall,
            { phone: phone_number, name: contact_name } as CallContact,
            campaign.id,
        )
        res.json({ ok: true, call_id: result.callId, conversation_id: result.conversationId, campaign_id: campaign.id })
    } catch (err) {
        console.error('[calls/initiate]', err)
        res.status(500).json({ error: String(err) })
    }
})

// ── POST /api/calls/batch — batch outbound calls from CSV contacts ─────────────
app.post('/api/calls/batch', async (req: Request, res: Response) => {
    const caller = await requirePremiumAdmin(req, res)
    if (!caller) return

    const { survey_id, contacts } = req.body as {
        survey_id: string
        contacts: { phone: string; name?: string }[]
    }
    if (!survey_id || !Array.isArray(contacts) || contacts.length === 0) {
        res.status(400).json({ error: 'survey_id and contacts[] are required' })
        return
    }
    if (!ELEVENLABS_AGENT_ID) {
        res.status(503).json({ error: 'ElevenLabs agent not configured' })
        return
    }

    const capped = contacts.slice(0, 50) // max 50 per batch

    try {
        const { data: survey, error: surveyErr } = await db()
            .from('surveys')
            .select('id, title, topic, questions')
            .eq('id', survey_id)
            .single()
        if (surveyErr || !survey) {
            res.status(404).json({ error: 'Survey not found' })
            return
        }

        const { data: campaign, error: campErr } = await db()
            .from('phone_campaigns')
            .insert({
                survey_id,
                created_by: caller.userId,
                status: 'running',
                total_numbers: capped.length,
                calls_made: 0,
                calls_done: 0,
                agent_id: ELEVENLABS_AGENT_ID,
            })
            .select('id')
            .single()
        if (campErr || !campaign) {
            res.status(500).json({ error: 'Failed to create campaign' })
            return
        }

        // Fire calls asynchronously (don't wait for all to finish)
        const results: { phone: string; callId?: string; error?: string }[] = []
        for (const contact of capped) {
            try {
                const r = await initiateCall(survey as SurveyForCall, contact, campaign.id)
                results.push({ phone: contact.phone, callId: r.callId })
            } catch (err) {
                results.push({ phone: contact.phone, error: String(err) })
            }
        }

        res.json({ ok: true, campaign_id: campaign.id, total: capped.length, results })
    } catch (err) {
        console.error('[calls/batch]', err)
        res.status(500).json({ error: String(err) })
    }
})

// ── GET /api/calls/campaigns — list campaigns for a survey ────────────────────
app.get('/api/calls/campaigns', async (req: Request, res: Response) => {
    const caller = await requirePremiumAdmin(req, res)
    if (!caller) return

    const surveyId = req.query.survey_id as string | undefined

    let query = db()
        .from('phone_campaigns')
        .select('*, phone_calls(count)')
        .order('created_at', { ascending: false })
        .limit(50)

    if (surveyId) query = query.eq('survey_id', surveyId)

    const { data, error } = await query
    if (error) {
        res.status(500).json({ error: error.message })
        return
    }
    res.json(data)
})

// ── POST /api/calls/webhook — ElevenLabs post-call webhook ────────────────────
// Must use express.raw() to preserve body for HMAC verification.
app.post(
    '/api/calls/webhook',
    express.raw({ type: 'application/json' }),
    async (req: Request, res: Response) => {
        // Verify HMAC-SHA256 signature
        if (ELEVENLABS_WEBHOOK_SECRET) {
            const sig = req.headers['elevenlabs-signature'] as string | undefined
            if (!sig) {
                res.status(401).json({ error: 'Missing signature' })
                return
            }
            const computed = crypto
                .createHmac('sha256', ELEVENLABS_WEBHOOK_SECRET)
                .update(req.body as Buffer)
                .digest('hex')
            if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(computed))) {
                res.status(401).json({ error: 'Invalid signature' })
                return
            }
        }

        let payload: {
            conversation_id: string
            transcript: { role: 'agent' | 'user'; message: string }[]
            call_duration_secs?: number
            call_status?: string
        }

        try {
            payload = JSON.parse((req.body as Buffer).toString('utf-8'))
        } catch {
            res.status(400).json({ error: 'Invalid JSON body' })
            return
        }

        try {
            await handleCallWebhook(payload)
            res.json({ ok: true })
        } catch (err) {
            console.error('[calls/webhook]', err)
            res.status(500).json({ error: String(err) })
        }
    },
)

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
    res.status(404).json({ detail: 'Not found' })
})

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(APP_PORT, () => {
    console.log(`✅  TuNoti API (Node) running at http://localhost:${APP_PORT}`)
    console.log(`🔗  Upstream: ${NEWS_API_BASE_URL}`)
    console.log(`🌐  CORS: ${ALLOWED_ORIGINS.join(', ')}`)
    console.log(`🗄️   Supabase: ${supabase ? (hasServiceKey ? 'service role' : 'anon key') : 'not configured'}`)
    console.log(`🤖  OpenRouter: ${OPENROUTER_API_KEY ? 'configured' : 'not configured'}`)
})
