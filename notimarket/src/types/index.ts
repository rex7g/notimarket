// NotiMarket – Shared TypeScript Types

/** Dominican Republic province codes */
export type ProvinceCode =
  'MCI' | 'DAJ' | 'VAL' | 'SRO' | 'EPI' | 'PUP' | 'ESP' | 'HMI' | 'MTS' | 'SAM' |
  'STI' | 'LAV' | 'MNO' | 'SRA' | 'DUA' | 'SJU' | 'AZU' | 'PER' | 'SCR' | 'MOP' |
  'ELS' | 'HAM' | 'SPM' | 'LRO' | 'ALG' | 'DNL' | 'SDQ' | 'IND' | 'BAH' | 'BAR' | 'PED'

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
  /** DR province code if the poll is province-specific (e.g. 'SDQ') */
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

export type AdminTab = "dashboard" | "heatmap" | "bot" | "stats" | "usuarios" | "fuentes" | "encuestas" | "llamadas";

// ── Phone Survey Campaigns (Premium) ──────────────────────────────────────────

export type PhoneCampaignStatus = "pending" | "running" | "completed" | "failed";
export type PhoneCallStatus = "pending" | "calling" | "completed" | "no_answer" | "failed";

export interface PhoneCampaign {
  id: string;
  survey_id: string;
  created_by: string | null;
  status: PhoneCampaignStatus;
  total_numbers: number;
  calls_made: number;
  calls_done: number;
  agent_id: string;
  created_at: string;
  completed_at: string | null;
}

export interface PhoneCall {
  id: string;
  campaign_id: string;
  survey_id: string;
  phone_number: string;
  contact_name: string | null;
  el_conversation_id: string | null;
  status: PhoneCallStatus;
  transcript: { role: "agent" | "user"; message: string }[] | null;
  answered: boolean;
  duration_secs: number | null;
  created_at: string;
  completed_at: string | null;
}

export interface ProvinceHeatmapDatum {
  province: string;
  count: number;
}

export interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: 'user' | 'admin';
  is_premium: boolean;
  created_at: string;
}

export interface BotConfig {
  enabled: boolean;
  intervalMinutes: number;
  topic: string;
  llmApiKey: string;
  llmProvider: "openai" | "gemini" | "mock" | "openrouter";
  openrouterModel: string;
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

export interface NewsSource {
  id: string;
  url: string;
  name: string;
  rss_url: string | null;
  enabled: boolean;
  created_at: string;
}

export type SocialPlatform = 'twitter' | 'facebook' | 'instagram' | 'tiktok';

// ── Survey (Encuesta) – multi-question entity separate from bot Polls ─────────

export interface SurveyOption {
  id: string;
  text: string;
  // votes are NOT stored here – computed from survey_responses via get_survey_results RPC
}

/** Aggregated result row returned by get_survey_results() RPC */
export interface SurveyResultItem {
  question_id: string;
  option_id: string;
  vote_count: number;
}

export interface SurveyQuestion {
  id: string;
  question: string;
  options: SurveyOption[];
}

export type SurveyStatus = "active" | "closed" | "draft";

export interface Survey {
  id: string;
  title: string;
  description: string | null;
  topic: string;
  province: string | null;
  status: SurveyStatus;
  questions: SurveyQuestion[];   // stored as JSONB in Supabase
  total_responses: number;
  created_by: string | null;
  created_at: string;
}

/** One user's answer to a single survey question */
export interface SurveyAnswer {
  question_id: string;
  option_id: string;
  option_index: number;
}

export interface SurveyResponse {
  id: string;
  survey_id: string;
  user_id: string;
  answers: SurveyAnswer[];
  province: string | null;
  captcha_score: number | null;
  created_at: string;
}

export interface SocialComment {
  id: string;
  poll_id: string;
  platform: SocialPlatform;
  comment_id: string;
  author_name: string | null;
  author_handle: string | null;
  text: string | null;
  likes: number;
  reply_count: number;
  is_bot: boolean | null;
  bot_score: number | null;
  fetched_at: string;
}
