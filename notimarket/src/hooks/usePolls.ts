// usePolls.ts – Poll-related derived selectors
import { useMemo } from "react";
import { usePollStore } from "../store/pollStore";
import { Poll, ProvinceData, KPIs } from "../types";

export const usePolls = () => {
    const polls = usePollStore((s) => s.polls);
    const vote = usePollStore((s) => s.vote);

    const sortedPolls = useMemo(
        () => [...polls].sort((a, b) => b.totalVotes - a.totalVotes),
        [polls]
    );

    const pollsByTopic = useMemo(() => {
        const map: Record<string, Poll[]> = {};
        polls.forEach((p) => {
            if (!map[p.topic]) map[p.topic] = [];
            map[p.topic].push(p);
        });
        return map;
    }, [polls]);

    const provinceData = useMemo((): ProvinceData[] => {
        const map: Record<string, ProvinceData> = {};
        polls.forEach((poll) => {
            const prov = poll.province || "SD";
            if (!map[prov]) {
                map[prov] = {
                    code: prov,
                    name: prov,
                    votes: 0,
                    sentiment: poll.sentiment,
                    topPoll: poll.question,
                };
            }
            map[prov].votes += poll.totalVotes;
        });
        return Object.values(map);
    }, [polls]);

    const kpis = useMemo((): KPIs => {
        const totalVotes = polls.reduce((acc, p) => acc + p.totalVotes, 0);
        const topicCounts = polls.reduce((acc, p) => {
            acc[p.topic] = (acc[p.topic] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
        const topTopic =
            Object.entries(topicCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

        const sentimentBreakdown = polls.reduce(
            (acc, p) => {
                acc[p.sentiment] = (acc[p.sentiment] || 0) + 1;
                return acc;
            },
            { positivo: 0, negativo: 0, neutral: 0 } as KPIs["sentimentBreakdown"]
        );

        return {
            totalPolls: polls.length,
            totalVotes,
            activePolls: polls.filter((p) => !p.voted).length,
            avgVotesPerPoll: polls.length ? Math.round(totalVotes / polls.length) : 0,
            topTopic,
            sentimentBreakdown,
        };
    }, [polls]);

    return { polls, sortedPolls, pollsByTopic, provinceData, kpis, vote };
};
