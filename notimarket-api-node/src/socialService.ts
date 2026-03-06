// socialService.ts – Social media comment fetching + bot detection
// Supports: Twitter/X, Facebook/Instagram (Meta), TikTok

export interface RawComment {
  id: string
  author_name: string | null
  author_handle: string | null
  text: string
  likes: number
  reply_count: number
}

export interface BotDetectionResult {
  commentId: string
  is_bot: boolean
  bot_score: number
}

// ─── Twitter / X ─────────────────────────────────────────────────────────────

/**
 * Extracts tweet ID from a tweet URL.
 * https://x.com/user/status/1234567890  →  "1234567890"
 */
function extractTweetId(postUrl: string): string | null {
  const match = postUrl.match(/\/status\/(\d+)/)
  return match ? match[1] : null
}

export async function fetchTwitterComments(
  postUrl: string,
  bearerToken: string
): Promise<RawComment[]> {
  const tweetId = extractTweetId(postUrl)
  if (!tweetId) throw new Error('URL de Twitter inválida')

  // Search recent tweets that reply to this tweet
  const searchUrl = new URL('https://api.twitter.com/2/tweets/search/recent')
  searchUrl.searchParams.set('query', `conversation_id:${tweetId}`)
  searchUrl.searchParams.set(
    'tweet.fields',
    'author_id,public_metrics,conversation_id,text'
  )
  searchUrl.searchParams.set('expansions', 'author_id')
  searchUrl.searchParams.set('user.fields', 'name,username')
  searchUrl.searchParams.set('max_results', '50')

  const res = await fetch(searchUrl.toString(), {
    headers: { Authorization: `Bearer ${bearerToken}` },
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(`Twitter API: ${err?.title ?? res.statusText}`)
  }

  const data = await res.json()
  const usersMap: Record<string, { name: string; username: string }> = {}
  for (const u of data.includes?.users ?? []) {
    usersMap[u.id] = { name: u.name, username: u.username }
  }

  return (data.data ?? []).map((t: any) => ({
    id: t.id,
    author_name: usersMap[t.author_id]?.name ?? null,
    author_handle: usersMap[t.author_id]?.username
      ? `@${usersMap[t.author_id].username}`
      : null,
    text: t.text,
    likes: t.public_metrics?.like_count ?? 0,
    reply_count: t.public_metrics?.reply_count ?? 0,
  }))
}

// ─── Facebook / Instagram (Meta Graph API) ───────────────────────────────────

/**
 * Extracts Facebook post ID from a URL.
 * https://www.facebook.com/PageName/posts/1234567890  →  "1234567890"
 */
function extractFacebookPostId(postUrl: string): string | null {
  const match = postUrl.match(/\/posts\/(\d+)/) || postUrl.match(/[?&]story_fbid=(\d+)/)
  return match ? match[1] : null
}

export async function fetchFacebookComments(
  postUrl: string,
  accessToken: string
): Promise<RawComment[]> {
  const postId = extractFacebookPostId(postUrl)
  if (!postId) throw new Error('URL de Facebook inválida')

  const url = new URL(`https://graph.facebook.com/v18.0/${postId}/comments`)
  url.searchParams.set('fields', 'id,from,message,like_count,comment_count')
  url.searchParams.set('limit', '50')
  url.searchParams.set('access_token', accessToken)

  const res = await fetch(url.toString())
  if (!res.ok) {
    const err = await res.json()
    throw new Error(`Facebook API: ${err?.error?.message ?? res.statusText}`)
  }

  const data = await res.json()
  return (data.data ?? []).map((c: any) => ({
    id: c.id,
    author_name: c.from?.name ?? null,
    author_handle: null,
    text: c.message ?? '',
    likes: c.like_count ?? 0,
    reply_count: c.comment_count ?? 0,
  }))
}

// ─── TikTok (Research API) ───────────────────────────────────────────────────

/**
 * Extracts TikTok video ID from a URL.
 * https://www.tiktok.com/@user/video/7123456789012345678  →  "7123456789012345678"
 */
function extractTikTokVideoId(videoUrl: string): string | null {
  const match = videoUrl.match(/\/video\/(\d+)/)
  return match ? match[1] : null
}

export async function fetchTikTokComments(
  videoUrl: string,
  apiKey: string
): Promise<RawComment[]> {
  const videoId = extractTikTokVideoId(videoUrl)
  if (!videoId) throw new Error('URL de TikTok inválida')

  // TikTok Research API v2
  const url = 'https://open.tiktokapis.com/v2/research/video/comment/list/'
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      video_id: videoId,
      max_count: 50,
      cursor: 0,
      fields: ['text', 'like_count', 'reply_count', 'create_time'],
    }),
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(`TikTok API: ${err?.error?.message ?? res.statusText}`)
  }

  const data = await res.json()
  return (data.data?.comments ?? []).map((c: any, idx: number) => ({
    id: `tiktok-${videoId}-${idx}`,
    author_name: null,
    author_handle: null,
    text: c.text ?? '',
    likes: c.like_count ?? 0,
    reply_count: c.reply_count ?? 0,
  }))
}

// ─── Bot Detection via OpenRouter LLM ────────────────────────────────────────

export async function detectBotComments(
  comments: RawComment[],
  openrouterApiKey: string,
  model = 'openai/gpt-4o-mini'
): Promise<BotDetectionResult[]> {
  if (comments.length === 0) return []

  const MAX_BATCH = 20
  const results: BotDetectionResult[] = []

  // Process in batches to stay within token limits
  for (let i = 0; i < comments.length; i += MAX_BATCH) {
    const batch = comments.slice(i, i + MAX_BATCH)

    const prompt = `Analiza estos comentarios de redes sociales y determina cuáles podrían ser de bots.
Para cada comentario asigna un bot_score de 0.0 (humano) a 1.0 (bot seguro).

Señales de bot: texto repetitivo, spam de links, emojis excesivos, sin contexto, handles sospechosos, texto genérico de relleno.

Comentarios:
${batch.map((c, idx) => `${idx + 1}. [${c.author_handle ?? 'anon'}] "${c.text.slice(0, 200)}"`).join('\n')}

Responde SOLO con JSON array (sin markdown):
[{"commentId": "id", "is_bot": true/false, "bot_score": 0.0}]

IDs en orden: ${batch.map((c) => c.id).join(', ')}`

    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openrouterApiKey}`,
          'Content-Type': 'application/json',
          'X-Title': 'TuNoti BotDetector',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
        }),
      })

      const data = await res.json()
      const raw = data.choices?.[0]?.message?.content ?? '[]'
      const jsonMatch = raw.match(/\[[\s\S]*\]/)
      const parsed: Array<{ commentId: string; is_bot: boolean; bot_score: number }> =
        JSON.parse(jsonMatch?.[0] ?? '[]')

      // Map back by index if IDs don't match
      parsed.forEach((r, idx) => {
        const c = batch[idx]
        if (c) {
          results.push({ commentId: c.id, is_bot: r.is_bot, bot_score: r.bot_score ?? 0 })
        }
      })
    } catch {
      // If LLM fails, return heuristic scores
      batch.forEach((c) => {
        const score = heuristicBotScore(c.text)
        results.push({ commentId: c.id, is_bot: score > 0.7, bot_score: score })
      })
    }
  }

  return results
}

/** Simple heuristic bot score when LLM is unavailable */
function heuristicBotScore(text: string): number {
  let score = 0
  if (/https?:\/\//i.test(text)) score += 0.3
  const emojiCount = (text.match(/[\u{1F000}-\u{1FFFF}]/gu) ?? []).length
  if (emojiCount > 5) score += 0.2
  if (/click|link|follow|gana|gratis|free|win/i.test(text)) score += 0.3
  if (text.length < 10) score += 0.1
  return Math.min(score, 1)
}
