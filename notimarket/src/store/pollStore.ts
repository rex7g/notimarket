// pollStore.ts – Global state with Zustand
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Poll, BotConfig, PollOption } from "../types";

interface PollStore {
    polls: Poll[];
    addPoll: (poll: Poll) => void;
    vote: (pollId: string, optionId: string) => void;
    clearPolls: () => void;

    botConfig: BotConfig;
    setBotConfig: (config: Partial<BotConfig>) => void;
    botRunning: boolean;
    setBotRunning: (v: boolean) => void;
    lastBotRun: string | null;
    setLastBotRun: (dt: string) => void;
}

const DEFAULT_BOT_CONFIG: BotConfig = {
    enabled: false,
    intervalMinutes: 60,
    topic: "politica",
    llmApiKey: "",
    llmProvider: "mock",
    assetId: undefined,
};

export const usePollStore = create<PollStore>()(
    persist(
        (set) => ({
            polls: [],

            addPoll: (poll) =>
                set((state) => ({
                    polls: state.polls.some((p) => p.id === poll.id)
                        ? state.polls
                        : [poll, ...state.polls],
                })),

            vote: (pollId, optionId) =>
                set((state) => ({
                    polls: state.polls.map((p) => {
                        if (p.id !== pollId || p.voted) return p;
                        const options: PollOption[] = p.options.map((o) =>
                            o.id === optionId ? { ...o, votes: o.votes + 1 } : o
                        );
                        const choiceIdx = options.findIndex((o) => o.id === optionId);
                        return {
                            ...p,
                            options,
                            totalVotes: p.totalVotes + 1,
                            voted: true,
                            userChoice: choiceIdx,
                        };
                    }),
                })),

            clearPolls: () => set({ polls: [] }),

            botConfig: DEFAULT_BOT_CONFIG,
            setBotConfig: (config) =>
                set((state) => ({ botConfig: { ...state.botConfig, ...config } })),

            botRunning: false,
            setBotRunning: (v) => set({ botRunning: v }),

            lastBotRun: null,
            setLastBotRun: (dt) => set({ lastBotRun: dt }),
        }),
        { name: "notimarket-store" }
    )
);
