"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminGrantPlan, AdminSettingsDto, AdminUserPlanFilter, AdminUserStatusFilter } from "@ethio/shared";
import { api } from "@/lib/api";
import { useSession } from "../miniapp/session";

/** Admin data (Mini App → Admin). The API refuses non-admins. */

export function useAdminOverview() {
  const { token } = useSession();
  return useQuery({ queryKey: ["admin", "overview"], queryFn: () => api.admin.overview(token), staleTime: 15_000 });
}

export function useReviewQueue() {
  const { token } = useSession();
  return useInfiniteQuery({
    queryKey: ["admin", "review"],
    queryFn: ({ pageParam }) => api.admin.review(token, pageParam ?? undefined),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useReviewAction() {
  const { token } = useSession();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: { id: string; action: "approve" | "reject"; professionId?: string; functionId?: string }) =>
      a.action === "approve"
        ? api.admin.approve(token, a.id, { professionId: a.professionId, functionId: a.functionId })
        : api.admin.reject(token, a.id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin"] }),
  });
}

export function useAdminSettings() {
  const { token } = useSession();
  return useQuery({ queryKey: ["admin", "settings"], queryFn: () => api.admin.settings(token) });
}

export function useSaveSettings() {
  const { token } = useSession();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<AdminSettingsDto>) => api.admin.saveSettings(token, body),
    onSuccess: (data) => {
      qc.setQueryData(["admin", "settings"], data);
      void qc.invalidateQueries({ queryKey: ["pricing"] });
      void qc.invalidateQueries({ queryKey: ["admin", "overview"] });
    },
  });
}

export function useAdminSources() {
  const { token } = useSession();
  return useQuery({ queryKey: ["admin", "sources"], queryFn: () => api.admin.sources(token) });
}

export function useSourceActions() {
  const { token } = useSession();
  const qc = useQueryClient();
  const done = () => void qc.invalidateQueries({ queryKey: ["admin", "sources"] });
  return {
    patch: useMutation({
      mutationFn: (a: { id: string; body: { isActive?: boolean; trust?: number; linkPriority?: number } }) => api.admin.patchSource(token, a.id, a.body),
      onSuccess: done,
    }),
    add: useMutation({ mutationFn: (handle: string) => api.admin.addSource(token, handle), onSuccess: done }),
  };
}

export interface UsersFilter {
  q: string;
  plan: AdminUserPlanFilter;
  status: AdminUserStatusFilter;
  joined: "" | "7d" | "30d";
}

export function useAdminUsers(f: UsersFilter) {
  const { token } = useSession();
  return useInfiniteQuery({
    queryKey: ["admin", "users", f],
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams({ plan: f.plan, status: f.status });
      if (f.q.trim()) p.set("q", f.q.trim());
      if (f.joined) p.set("joined", f.joined);
      if (pageParam) p.set("cursor", pageParam);
      return api.admin.users(token, p.toString());
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    placeholderData: (prev) => prev,
  });
}

export function useAdminUser(id: string | null) {
  const { token } = useSession();
  return useQuery({ queryKey: ["admin", "user", id], queryFn: () => api.admin.user(token, id!), enabled: !!id });
}

export function useGrantPlan(id: string) {
  const { token } = useSession();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AdminGrantPlan) => api.admin.grant(token, id, body),
    onSuccess: (data) => {
      qc.setQueryData(["admin", "user", id], data);
      void qc.invalidateQueries({ queryKey: ["admin", "users"] });
      void qc.invalidateQueries({ queryKey: ["admin", "overview"] });
    },
  });
}
