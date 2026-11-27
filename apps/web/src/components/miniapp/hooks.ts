"use client";

import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import type { CheckoutRequest, CvContact, JobCardDto, JobFeedPage, JobFeedQuery, PreferencesInput, ResolveTermRequest } from "@ethio/shared";
import { api } from "@/lib/api";
import { getWebApp } from "@/lib/telegram";
import { useSession } from "./session";

export function useTaxonomy() {
  return useQuery({ queryKey: ["taxonomy"], queryFn: api.taxonomy, staleTime: 10 * 60_000 });
}

export function usePreferences() {
  const { token } = useSession();
  return useQuery({ queryKey: ["preferences"], queryFn: () => api.preferences(token) });
}

export function useSavePreferences() {
  const { token, me, setMe } = useSession();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PreferencesInput) => api.savePreferences(token, input),
    onSuccess: (prefs) => {
      qc.setQueryData(["preferences"], prefs);
      // New preferences mean new matches: the feed asks again (and shows "finding matches" meanwhile).
      void qc.invalidateQueries({ queryKey: ["jobs"] });
      if (!me.onboarded) setMe({ ...me, onboarded: true });
    },
  });
}

export function useSetAlertsPaused() {
  const { token, setMe } = useSession();
  return useMutation({
    mutationFn: (alertsPaused: boolean) => api.updateMe(token, { alertsPaused }),
    onSuccess: setMe,
  });
}

/** Saves the personal details printed on every CV. */
export function useSaveCvContact() {
  const { token, setMe } = useSession();
  return useMutation({ mutationFn: (c: CvContact) => api.setCvContact(token, c), onSuccess: setMe });
}

/** Shows Telegram's native back button while `onBack` is set. */
export function useBackButton(onBack: (() => void) | null) {
  const handler = useRef(onBack);
  handler.current = onBack;
  const active = onBack !== null;

  useEffect(() => {
    const wa = getWebApp();
    if (!wa || !active) return;
    const cb = () => handler.current?.();
    wa.BackButton.onClick(cb);
    wa.BackButton.show();
    return () => {
      wa.BackButton.offClick(cb);
      wa.BackButton.hide();
    };
  }, [active]);
}

export function usePricing() {
  return useQuery({ queryKey: ["pricing"], queryFn: api.pricing, staleTime: 10 * 60_000 });
}

/** Reloads /me (plan, limits, stats), e.g. after a payment or when returning to the app. */
export function useRefreshMe() {
  const { token, setMe } = useSession();
  return useMutation({ mutationFn: () => api.me(token), onSuccess: setMe });
}

export function useCheckout() {
  const { token } = useSession();
  return useMutation({ mutationFn: (req: CheckoutRequest) => api.checkout(token, req) });
}

/** Polls a payment while it is pending (the API confirms it with SantimPay on each poll). */
export function usePayment(id: string | null) {
  const { token } = useSession();
  return useQuery({
    queryKey: ["payment", id],
    queryFn: () => api.payment(token, id!),
    enabled: id !== null,
    refetchInterval: (q) => (q.state.data?.status === "pending" || !q.state.data ? 4_000 : false),
    refetchOnWindowFocus: true,
  });
}

/** Page size for the feed; MAX_FEED_ITEMS caps how much one scroll session loads. */
export const FEED_PAGE_SIZE = 20;
export const MAX_FEED_ITEMS = 300;

/** Infinite feed: fetches the next page on demand, stops at MAX_FEED_ITEMS. */
export function useJobFeed(query: Omit<JobFeedQuery, "cursor" | "limit">) {
  const { token } = useSession();
  return useInfiniteQuery({
    queryKey: ["jobs", query],
    queryFn: ({ pageParam }) => api.jobs(token, { ...query, cursor: pageParam ?? undefined, limit: FEED_PAGE_SIZE }),
    initialPageParam: null as string | null,
    getNextPageParam: (last, pages) => (pages.length * FEED_PAGE_SIZE >= MAX_FEED_ITEMS ? undefined : (last.nextCursor ?? undefined)),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

export function useJob(id: string, enabled = true) {
  const { token } = useSession();
  return useQuery({ queryKey: ["job", id], queryFn: () => api.job(token, id), enabled: enabled && !!id });
}

/**
 * Save / unsave a job. Optimistic: every cached copy (feed pages and the job itself) flips at once;
 * the Saved tab is refetched afterwards so it gains or loses the job.
 */
export function useToggleSaved() {
  const { token } = useSession();
  const qc = useQueryClient();
  const setEverywhere = (id: string, saved: boolean) => {
    qc.setQueryData<JobCardDto>(["job", id], (j) => (j ? { ...j, saved } : j));
    qc.setQueriesData<InfiniteData<JobFeedPage>>({ queryKey: ["jobs"] }, (data) =>
      data
        ? { ...data, pages: data.pages.map((p) => ({ ...p, items: p.items.map((j) => (j.id === id ? { ...j, saved } : j)) })) }
        : data,
    );
  };
  return useMutation({
    mutationFn: ({ id, saved }: { id: string; saved: boolean }) => api.setSaved(token, id, saved),
    onMutate: ({ id, saved }) => setEverywhere(id, saved),
    onError: (_err, { id, saved }) => setEverywhere(id, !saved),
    onSettled: () => qc.invalidateQueries({ queryKey: ["jobs", { scope: "saved" }], exact: false, refetchType: "inactive" }),
  });
}

/** "Not listed": maps typed text to the closest degrees/professions on the server (cached, cheap). */
export function useResolveTerm() {
  const { token } = useSession();
  return useMutation({ mutationFn: (req: ResolveTermRequest) => api.resolveTerm(token, req) });
}
