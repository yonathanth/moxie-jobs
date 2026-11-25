"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { api } from "@/lib/api";
import { askToAllowMessages } from "@/lib/telegram";
import { parseFeedState, toQuery } from "../jobs/filters";
import { FEED_PAGE_SIZE } from "./hooks";
import { useSession } from "./session";

/**
 * Right after sign-in, loads what the main tabs show first (in parallel, in the background),
 * so opening Jobs, CVs or Profile renders from cache instead of waiting on the network.
 */
export function Prefetch() {
  const qc = useQueryClient();
  const { token, me } = useSession();

  useEffect(() => {
    if (!me.onboarded) return;
    const feed = toQuery(parseFeedState(new URLSearchParams()));
    void qc.prefetchInfiniteQuery({
      queryKey: ["jobs", feed],
      queryFn: ({ pageParam }) => api.jobs(token, { ...feed, cursor: pageParam ?? undefined, limit: FEED_PAGE_SIZE }),
      initialPageParam: null as string | null,
      staleTime: 60_000,
    });
    void qc.prefetchQuery({ queryKey: ["taxonomy"], queryFn: api.taxonomy, staleTime: 10 * 60_000 });
    void qc.prefetchQuery({ queryKey: ["cv", "list"], queryFn: () => api.cv.list(token) });
    void qc.prefetchQuery({ queryKey: ["preferences"], queryFn: () => api.preferences(token) });
    // Set up already but the bot may not be allowed to message them (opened from a link): ask, a few seconds in.
    const ask = setTimeout(askToAllowMessages, 4000);
    return () => clearTimeout(ask);
    // Once per session: the token only changes in the background and the cache doesn't depend on it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
