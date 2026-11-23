"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CvContent, CvGenerateRequest, CvPolishTarget, PackCheckoutRequest } from "@ethio/shared";
import { api, uploadCvFile } from "@/lib/api";
import { useSession } from "../miniapp/session";

/** CVs made with the GoMoxie engine (through our API). */

export function useCvList() {
  const { token } = useSession();
  return useQuery({ queryKey: ["cv", "list"], queryFn: () => api.cv.list(token) });
}

export function useCv(id: string) {
  const { token } = useSession();
  return useQuery({ queryKey: ["cv", id], queryFn: () => api.cv.get(token, id) });
}

/** The preview HTML; refetched whenever the CV (content or template) changes. */
export function useCvPreview(id: string, version: string | undefined) {
  const { token } = useSession();
  return useQuery({
    queryKey: ["cv", id, "preview", version],
    queryFn: () => api.cv.preview(token, id),
    enabled: !!version,
    staleTime: Infinity,
    placeholderData: (prev) => prev,
  });
}

export function useCvTemplates() {
  const { token } = useSession();
  return useQuery({ queryKey: ["cv", "templates"], queryFn: () => api.cv.templates(token), staleTime: 30 * 60_000 });
}

export function useGenerateCv() {
  const { token } = useSession();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CvGenerateRequest) => api.cv.generate(token, body),
    onSuccess: (res) => {
      if (res.status === "ok") qc.setQueryData(["cv", res.cv.id], res.cv);
      void qc.invalidateQueries({ queryKey: ["cv", "list"] });
    },
  });
}

export function useImportCv() {
  const { token } = useSession();
  return useMutation({ mutationFn: (file: File) => uploadCvFile(token, file) });
}

export function useUpdateCv(id: string) {
  const { token } = useSession();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { title?: string; templateId?: string; content?: CvContent }) => api.cv.update(token, id, body),
    onSuccess: (cv) => {
      qc.setQueryData(["cv", id], cv);
      void qc.invalidateQueries({ queryKey: ["cv", "list"] });
    },
  });
}

export function useDeleteCv() {
  const { token } = useSession();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.cv.remove(token, id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["cv", "list"] }),
  });
}

export function useSendCv(id: string) {
  const { token } = useSession();
  return useMutation({ mutationFn: () => api.cv.send(token, id) });
}

/** Buy a CV pack (optionally for a locked CV, which it then unlocks). */
export function usePackCheckout() {
  const { token } = useSession();
  return useMutation({ mutationFn: (body: PackCheckoutRequest) => api.checkoutPack(token, body) });
}

/** Unlock a locked CV with one pack credit. */
export function useUnlockCv(id: string) {
  const { token } = useSession();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.cv.unlock(token, id),
    onSuccess: (cv) => {
      qc.setQueryData(["cv", id], cv);
      void qc.invalidateQueries({ queryKey: ["cv", "list"] });
    },
  });
}

export function usePolishCv(id: string) {
  const { token } = useSession();
  return useMutation({ mutationFn: (body: { content?: CvContent; targets: CvPolishTarget[] | "all" }) => api.cv.polish(token, id, body) });
}

export function useReviewCv(id: string) {
  const { token } = useSession();
  return useMutation({ mutationFn: (content?: CvContent) => api.cv.review(token, id, content) });
}
