// pollBot.ts – Bot that fetches news and generates polls
import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import type { NewsItem, Poll, PollOption, BotConfig } from "../types";

const NEWS_API_URL = import.meta.env.VITE_NEWS_API_URL || "http://localhost:8001";

// ---------------------------------------------------------------------------
// Shared prompt builder
// ---------------------------------------------------------------------------

function buildPrompt(news: NewsItem): string {
    return `Eres un generador de encuestas políticas en español para República Dominicana.
Basándote en este titular de noticia: "${news.title}"
Fuente: "${news.source || "Desconocida"}"
Resumen: "${news.summary || "Sin resumen"}"

Genera una encuesta con:
1. Una pregunta directa y clara en español
2. Exactamente 4 opciones de respuesta creativas y diversas

Responde SOLO con este JSON (sin markdown):
{
  "question": "...",
  "options": ["opción 1", "opción 2", "opción 3", "opción 4"]
}`;
}

function buildPollFromParsed(
    news: NewsItem,
    parsed: { question: string; options: string[] }
): Poll {
    const options: PollOption[] = parsed.options.map((text: string) => ({
        id: uuidv4(),
        text,
        votes: 0,
    }));
    return {
        id: `poll-${news.id}`,
        newsId: news.id,
        newsTitle: news.title,
        newsUrl: news.url,
        newsSource: news.source,
        question: parsed.question,
        options,
        topic: news.topic,
        sentiment: news.sentiment,
        createdAt: new Date().toISOString(),
        totalVotes: 0,
        voted: false,
    };
}

// ---------------------------------------------------------------------------
// Mock poll generator (no LLM required)
// ---------------------------------------------------------------------------

function mockGeneratePoll(news: NewsItem): Poll {
    const options: PollOption[] = [
        { id: uuidv4(), text: "Completamente de acuerdo", votes: 0 },
        { id: uuidv4(), text: "Parcialmente de acuerdo", votes: 0 },
        { id: uuidv4(), text: "En desacuerdo", votes: 0 },
        { id: uuidv4(), text: "No tengo opinión", votes: 0 },
    ];

    return {
        id: `poll-${news.id}`,
        newsId: news.id,
        newsTitle: news.title,
        newsUrl: news.url,
        newsSource: news.source,
        question: `¿Cuál es tu opinión sobre: "${news.title.slice(0, 80)}${news.title.length > 80 ? "..." : ""}"?`,
        options,
        topic: news.topic,
        sentiment: news.sentiment,
        createdAt: new Date().toISOString(),
        totalVotes: 0,
        voted: false,
    };
}

// ---------------------------------------------------------------------------
// OpenRouter poll generator (unified access to GPT-4, Claude, Llama, etc.)
// ---------------------------------------------------------------------------

async function openrouterGeneratePoll(
    news: NewsItem,
    apiKey: string,
    model: string
): Promise<Poll> {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": window.location.origin,
            "X-Title": "TuNoti Bot",
        },
        body: JSON.stringify({
            model: model || "openai/gpt-4o-mini",
            messages: [{ role: "user", content: buildPrompt(news) }],
            temperature: 0.7,
        }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message ?? "OpenRouter error");
    const raw = data.choices[0].message.content;
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch?.[0] ?? raw);
    return buildPollFromParsed(news, parsed);
}

// ---------------------------------------------------------------------------
// OpenAI poll generator
// ---------------------------------------------------------------------------

async function openAIGeneratePoll(news: NewsItem, apiKey: string): Promise<Poll> {
    const response = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
            model: "gpt-3.5-turbo",
            messages: [{ role: "user", content: buildPrompt(news) }],
            temperature: 0.7,
        },
        {
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
        }
    );

    const raw = response.data.choices[0].message.content;
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch?.[0] ?? raw);
    return buildPollFromParsed(news, parsed);
}

// ---------------------------------------------------------------------------
// Gemini poll generator
// ---------------------------------------------------------------------------

async function geminiGeneratePoll(news: NewsItem, apiKey: string): Promise<Poll> {
    const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`,
        { contents: [{ parts: [{ text: buildPrompt(news) }] }] }
    );

    const raw = response.data.candidates[0].content.parts[0].text;
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch?.[0] ?? raw);
    return buildPollFromParsed(news, parsed);
}

// ---------------------------------------------------------------------------
// Main bot runner
// ---------------------------------------------------------------------------

export async function runPollBot(
    config: BotConfig,
    existingPollIds: Set<string>,
    onPollCreated: (poll: Poll) => void,
    onLog: (msg: string) => void
): Promise<void> {
    const providerLabel = config.llmProvider === "openrouter"
        ? `OpenRouter (${config.openrouterModel || "gpt-4o-mini"})`
        : config.llmProvider;
    onLog(`🤖 Bot iniciado – tema: ${config.topic}, proveedor: ${providerLabel}`);

    // 1. Fetch news (standard endpoint + scraped sources)
    let newsItems: NewsItem[] = [];
    try {
        const { data } = await axios.get<NewsItem[]>(`${NEWS_API_URL}/news`, {
            params: { topic: config.topic, limit: 10, asset_id: config.assetId },
            timeout: 8000,
        });
        newsItems = data;
        onLog(`📰 ${newsItems.length} noticias obtenidas`);
    } catch (err: unknown) {
        const isNetworkErr =
            axios.isAxiosError(err) &&
            (err.code === 'ERR_NETWORK' || err.code === 'ECONNREFUSED' || err.message === 'Network Error');

        if (isNetworkErr) {
            onLog(`❌ No se pudo conectar al API (${NEWS_API_URL}).`);
            onLog(`   👉 Asegúrate de que notimarket-api-node esté corriendo:`);
            onLog(`      cd notimarket-api-node && npm run dev`);
            onLog(`   ℹ️  O cambia VITE_NEWS_API_URL en el .env del frontend.`);
        } else {
            onLog(`❌ Error al obtener noticias: ${err}`);
        }
        return;
    }


    // 2. Also fetch from configured custom sources
    try {
        const { data: sources } = await axios.get(`${NEWS_API_URL}/sources`);
        if (Array.isArray(sources) && sources.length > 0) {
            onLog(`📡 ${sources.length} fuentes configuradas – raspando artículos...`);
            for (const src of sources.slice(0, 3)) {
                try {
                    const { data: scraped } = await axios.get(`${NEWS_API_URL}/scrape`, {
                        params: { sourceId: src.id },
                    });
                    if (Array.isArray(scraped)) {
                        newsItems = [...newsItems, ...scraped];
                        onLog(`  ✓ ${scraped.length} artículos de ${src.name}`);
                    }
                } catch {
                    onLog(`  ⚠️ No se pudo raspar ${src.name}`);
                }
            }
        }
    } catch {
        // sources endpoint may not exist yet; continue
    }

    // Deduplicate by id
    const seen = new Set<string>();
    newsItems = newsItems.filter((n) => {
        if (seen.has(n.id)) return false;
        seen.add(n.id);
        return true;
    });

    // 3. Filter only new (no existing poll for this news)
    const fresh = newsItems.filter((n) => !existingPollIds.has(`poll-${n.id}`));
    onLog(`✨ ${fresh.length} noticias nuevas para procesar`);

    // 4. Generate polls
    for (const news of fresh.slice(0, 5)) {
        try {
            let poll: Poll;

            if (config.llmProvider === "openrouter" && config.llmApiKey) {
                poll = await openrouterGeneratePoll(news, config.llmApiKey, config.openrouterModel);
            } else if (config.llmProvider === "openai" && config.llmApiKey) {
                poll = await openAIGeneratePoll(news, config.llmApiKey);
            } else if (config.llmProvider === "gemini" && config.llmApiKey) {
                poll = await geminiGeneratePoll(news, config.llmApiKey);
            } else {
                poll = mockGeneratePoll(news);
            }

            onPollCreated(poll);
            onLog(`✅ Encuesta creada: "${poll.question.slice(0, 60)}..." [${news.source ?? "—"}]`);
        } catch (err) {
            onLog(`⚠️ Error generando encuesta para "${news.title.slice(0, 40)}": ${err}`);
        }
    }

    onLog(`🏁 Bot finalizado`);
}
