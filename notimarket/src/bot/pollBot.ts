// pollBot.ts – Bot that fetches news and generates polls
import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import { NewsItem, Poll, PollOption, BotConfig } from "../types";

const NEWS_API_URL = import.meta.env.VITE_NEWS_API_URL || "http://localhost:8001";

// ---------------------------------------------------------------------------
// Mock poll generator (no LLM required)
// ---------------------------------------------------------------------------

function mockGeneratePoll(news: NewsItem): Poll {
    const sentimentLabel =
        news.sentiment === "positivo"
            ? "favorable"
            : news.sentiment === "negativo"
                ? "desfavorable"
                : "neutral";

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
// OpenAI poll generator
// ---------------------------------------------------------------------------

async function openAIGeneratePoll(news: NewsItem, apiKey: string): Promise<Poll> {
    const prompt = `Eres un generador de encuestas políticas en español para República Dominicana.
Basándote en este titular de noticia: "${news.title}"
Resumen: "${news.summary || "Sin resumen"}"

Genera una encuesta con:
1. Una pregunta directa y clara en español
2. Exactamente 4 opciones de respuesta creativas y diversas

Responde SOLO con este JSON (sin markdown):
{
  "question": "...",
  "options": ["opción 1", "opción 2", "opción 3", "opción 4"]
}`;

    const response = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
            model: "gpt-3.5-turbo",
            messages: [{ role: "user", content: prompt }],
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
    const parsed = JSON.parse(raw);

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
// Gemini poll generator
// ---------------------------------------------------------------------------

async function geminiGeneratePoll(news: NewsItem, apiKey: string): Promise<Poll> {
    const prompt = `Eres un generador de encuestas políticas en español para República Dominicana.
Basándote en: "${news.title}"
Resumen: "${news.summary || ""}"
Genera una pregunta y 4 opciones de respuesta.
Responde SOLO con JSON: {"question": "...", "options": ["...", "...", "...", "..."]}`;

    const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`,
        {
            contents: [{ parts: [{ text: prompt }] }],
        }
    );

    const raw = response.data.candidates[0].content.parts[0].text;
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch?.[0] ?? raw);

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
// Main bot runner
// ---------------------------------------------------------------------------

export async function runPollBot(
    config: BotConfig,
    existingPollIds: Set<string>,
    onPollCreated: (poll: Poll) => void,
    onLog: (msg: string) => void
): Promise<void> {
    onLog(`🤖 Bot iniciado – tema: ${config.topic}, proveedor: ${config.llmProvider}`);

    // 1. Fetch news
    let newsItems: NewsItem[] = [];
    try {
        const { data } = await axios.get<NewsItem[]>(`${NEWS_API_URL}/news`, {
            params: { topic: config.topic, limit: 10, asset_id: config.assetId },
        });
        newsItems = data;
        onLog(`📰 ${newsItems.length} noticias obtenidas`);
    } catch (err) {
        onLog(`❌ Error al obtener noticias: ${err}`);
        return;
    }

    // 2. Filter only new (no existing poll for this news)
    const fresh = newsItems.filter((n) => !existingPollIds.has(`poll-${n.id}`));
    onLog(`✨ ${fresh.length} noticias nuevas para procesar`);

    // 3. Generate polls
    for (const news of fresh.slice(0, 5)) {
        try {
            let poll: Poll;

            if (config.llmProvider === "openai" && config.llmApiKey) {
                poll = await openAIGeneratePoll(news, config.llmApiKey);
            } else if (config.llmProvider === "gemini" && config.llmApiKey) {
                poll = await geminiGeneratePoll(news, config.llmApiKey);
            } else {
                poll = mockGeneratePoll(news);
            }

            onPollCreated(poll);
            onLog(`✅ Encuesta creada: "${poll.question.slice(0, 60)}..."`);
        } catch (err) {
            onLog(`⚠️ Error generando encuesta para "${news.title.slice(0, 40)}": ${err}`);
        }
    }

    onLog(`🏁 Bot finalizado`);
}
