// useNews.ts – Fetch simplified news from notimarket-api
import { useState, useCallback } from "react";
import axios from "axios";
import { NewsItem } from "../types";

const NEWS_API_URL = import.meta.env.VITE_NEWS_API_URL || "http://localhost:8001";

interface UseNewsReturn {
    news: NewsItem[];
    loading: boolean;
    error: string | null;
    fetchNews: (topic?: string, limit?: number) => Promise<NewsItem[]>;
}

export const useNews = (): UseNewsReturn => {
    const [news, setNews] = useState<NewsItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchNews = useCallback(
        async (topic = "politica", limit = 20): Promise<NewsItem[]> => {
            setLoading(true);
            setError(null);
            try {
                const { data } = await axios.get<NewsItem[]>(`${NEWS_API_URL}/news`, {
                    params: { topic, limit },
                });
                setNews(data);
                return data;
            } catch (err: unknown) {
                const msg =
                    axios.isAxiosError(err)
                        ? err.message
                        : "Error al cargar noticias";
                setError(msg);
                return [];
            } finally {
                setLoading(false);
            }
        },
        []
    );

    return { news, loading, error, fetchNews };
};
