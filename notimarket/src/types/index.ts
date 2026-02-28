// NotiMarket – Shared TypeScript Types

export interface NewsItem {
  id: string;
  title: string;
  summary: string | null;
  source: string | null;
  published_at: string | null;
  url: string;
  sentiment: "positivo" | "negativo" | "neutral";
  topic: string;
}

export interface PollOption {
  id: string;
  text: string;
  votes: number;
}

export interface Poll {
  id: string;
  /** Encuesta generada a partir de esta noticia */
  newsId: string;
  newsTitle: string;
  newsUrl: string;
  newsSource: string | null;
  question: string;
  options: PollOption[];
  topic: string;
  sentiment: NewsItem["sentiment"];
  createdAt: string;
  /** Province code if the news is province-specific (e.g. 'SD') */
  province?: string;
  totalVotes: number;
  /** True once the user has voted */
  voted?: boolean;
  /** Index of option the user selected */
  userChoice?: number;
}

export type PollStatus = "active" | "closed" | "all";

export interface ProvinceData {
  code: string;
  name: string;
  votes: number;
  sentiment: "positivo" | "negativo" | "neutral" | "mixed";
  topPoll?: string;
}

export type AdminTab = "dashboard" | "heatmap" | "bot" | "stats";

export interface BotConfig {
  enabled: boolean;
  intervalMinutes: number;
  topic: string;
  llmApiKey: string;
  llmProvider: "openai" | "gemini" | "mock";
  assetId?: string;
}

export interface KPIs {
  totalPolls: number;
  totalVotes: number;
  activePolls: number;
  avgVotesPerPoll: number;
  topTopic: string;
  sentimentBreakdown: {
    positivo: number;
    negativo: number;
    neutral: number;
  };
}
