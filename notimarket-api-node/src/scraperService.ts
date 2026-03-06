// scraperService.ts – RSS auto-detection + article extraction
import axios from 'axios'
import * as cheerio from 'cheerio'
import Parser from 'rss-parser'

export interface ScrapedArticle {
  id: string
  title: string
  url: string
  summary: string | null
  source: string | null
  published_at: string | null
  sentiment: 'positivo' | 'negativo' | 'neutral'
  topic: string
}

const RSS_SUFFIXES = [
  '/feed',
  '/rss',
  '/feed.xml',
  '/rss.xml',
  '/feeds/latest.rss',
  '/news/rss',
  '/noticias/rss',
]

const HEADERS = {
  'User-Agent': 'TuNotiBot/1.0 (news aggregator; contact@tunoti.do)',
  'Accept': 'text/html,application/xhtml+xml,application/xml,application/rss+xml',
}

/** Try to find an RSS feed URL for a given site */
export async function detectRssFeed(siteUrl: string): Promise<string | null> {
  const base = siteUrl.replace(/\/$/, '')

  // 1. Try common RSS path suffixes
  for (const suffix of RSS_SUFFIXES) {
    try {
      const url = base + suffix
      const res = await axios.get(url, { timeout: 6000, headers: HEADERS })
      const ct = res.headers['content-type'] ?? ''
      if (
        res.status === 200 &&
        (ct.includes('xml') || ct.includes('rss') || String(res.data).trim().startsWith('<'))
      ) {
        return url
      }
    } catch {
      // try next
    }
  }

  // 2. Parse HTML for <link rel="alternate" type="application/rss+xml">
  try {
    const res = await axios.get(siteUrl, { timeout: 8000, headers: HEADERS })
    const $ = cheerio.load(res.data as string)
    const rssHref =
      $('link[type="application/rss+xml"]').attr('href') ||
      $('link[type="application/atom+xml"]').attr('href')
    if (rssHref) {
      return new URL(rssHref, siteUrl).href
    }
  } catch {
    // no RSS detectable
  }

  return null
}

/** Parse an RSS/Atom feed and return articles */
export async function scrapeArticlesFromRss(
  rssUrl: string,
  sourceName: string,
  limit = 10
): Promise<ScrapedArticle[]> {
  const parser = new Parser({
    headers: HEADERS,
    timeout: 10000,
  })

  const feed = await parser.parseURL(rssUrl)

  return feed.items.slice(0, limit).map((item) => ({
    id: slugId(item.link ?? item.title ?? String(Math.random())),
    title: item.title ?? '(sin título)',
    url: item.link ?? '',
    summary: item.contentSnippet ?? stripHtml(item.content ?? '') ?? null,
    source: sourceName || feed.title || null,
    published_at: item.pubDate ? new Date(item.pubDate).toISOString() : null,
    sentiment: 'neutral' as const,
    topic: 'general',
  }))
}

/** Fallback: scrape HTML page for og:/meta article links */
export async function scrapeArticlesFromHtml(
  siteUrl: string,
  sourceName: string,
  limit = 10
): Promise<ScrapedArticle[]> {
  const res = await axios.get(siteUrl, { timeout: 10000, headers: HEADERS })
  const $ = cheerio.load(res.data as string)
  const articles: ScrapedArticle[] = []

  // Try structured article tags first
  $('article, [class*="article"], [class*="news-item"], [class*="story-card"], [class*="post-card"]').each(
    (_, el) => {
      if (articles.length >= limit) return false
      const title =
        $(el).find('h1,h2,h3').first().text().trim() ||
        $(el).find('[class*="title"]').first().text().trim()
      const href = $(el).find('a[href]').first().attr('href')
      if (!title || !href) return
      articles.push({
        id: slugId(href),
        title,
        url: new URL(href, siteUrl).href,
        summary: $(el).find('p').first().text().trim() || null,
        source: sourceName,
        published_at: null,
        sentiment: 'neutral',
        topic: 'general',
      })
    }
  )

  // Fallback to og: meta if no structured content
  if (articles.length === 0) {
    const ogTitle = $('meta[property="og:title"]').attr('content')
    const ogUrl = $('meta[property="og:url"]').attr('content') || siteUrl
    const ogDesc = $('meta[property="og:description"]').attr('content') || null
    if (ogTitle) {
      articles.push({
        id: slugId(ogUrl),
        title: ogTitle,
        url: ogUrl,
        summary: ogDesc,
        source: sourceName,
        published_at: null,
        sentiment: 'neutral',
        topic: 'general',
      })
    }
  }

  return articles
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function slugId(input: string): string {
  // Deterministic 12-char ID from the last part of a URL
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0
  }
  return 'src-' + Math.abs(hash).toString(36).slice(0, 8)
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}
