import type {
  CvContact,
  PackCheckoutRequest,
  AdminOverviewDto,
  AdminSettingsDto,
  AdminSourceDto,
  AdminGrantPlan,
  AdminUserDetail,
  AdminUsersPage,
  AuthResponse,
  ReviewPage,
  CheckoutRequest,
  CheckoutResponse,
  CvContent,
  CvDetailDto,
  CvGenerateRequest,
  CvGenerateResponse,
  CvListDto,
  CvPolishResponse,
  CvPolishTarget,
  CvReviewTip,
  CvTemplateDto,
  JobCardDto,
  JobFeedPage,
  JobFeedQuery,
  MeDto,
  PaymentDto,
  PreferencesDto,
  PreferencesInput,
  PricingDto,
  ResolveTermRequest,
  ResolveTermResponse,
  TaxonomyDto,
  BroadcastAudience,
  BroadcastRequest,
  BroadcastResult,
} from "@ethio/shared";
import { API_URL } from "./config";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues: { path: string; message: string }[] = [],
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...rest,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string | string[]; issues?: ApiError["issues"] };
    const message = Array.isArray(body.message) ? body.message.join(", ") : body.message;
    throw new ApiError(res.status, message || `Request failed (${res.status})`, body.issues ?? []);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  loginTelegram: (initData: string) =>
    request<AuthResponse>("/auth/telegram", { method: "POST", body: JSON.stringify({ initData }) }),
  loginDev: (telegramId?: number) =>
    request<AuthResponse>("/auth/dev", { method: "POST", body: JSON.stringify(telegramId ? { telegramId } : {}) }),
  taxonomy: () => request<TaxonomyDto>("/taxonomy"),
  resolveTerm: (token: string, body: ResolveTermRequest) =>
    request<ResolveTermResponse>("/taxonomy/resolve", { method: "POST", token, body: JSON.stringify(body) }),
  me: (token: string) => request<MeDto>("/me", { token }),
  prepareJobShare: (token: string, jobId: string) => request<{ id: string }>(`/jobs/${jobId}/share`, { method: "POST", token }),
  setCvContact: (token: string, body: CvContact) => request<MeDto>("/me/cv-contact", { method: "PUT", token, body: JSON.stringify(body) }),
  updateMe: (token: string, body: { alertsPaused: boolean }) =>
    request<MeDto>("/me", { method: "PATCH", token, body: JSON.stringify(body) }),
  preferences: (token: string) => request<PreferencesDto | null>("/me/preferences", { token }),
  savePreferences: (token: string, body: PreferencesInput) =>
    request<PreferencesDto>("/me/preferences", { method: "PUT", token, body: JSON.stringify(body) }),
  pricing: () => request<PricingDto>("/billing/plans"),
  checkoutPack: (token: string, body: PackCheckoutRequest) =>
    request<CheckoutResponse>("/billing/packs/checkout", { method: "POST", token, body: JSON.stringify(body) }),
  checkout: (token: string, body: CheckoutRequest) =>
    request<CheckoutResponse>("/billing/checkout", { method: "POST", token, body: JSON.stringify(body) }),
  jobs: (token: string, q: JobFeedQuery) => request<JobFeedPage>(`/jobs?${feedParams(q)}`, { token }),
  job: (token: string, id: string) => request<JobCardDto>(`/jobs/${id}`, { token }),
  setSaved: (token: string, id: string, saved: boolean) =>
    request<{ saved: boolean }>(`/jobs/${id}/save`, { method: saved ? "PUT" : "DELETE", token }),
  admin: {
    overview: (token: string) => request<AdminOverviewDto>("/admin/overview", { token }),
    review: (token: string, cursor?: string) => request<ReviewPage>(`/admin/review${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, { token }),
    approve: (token: string, id: string, body: { professionId?: string; functionId?: string }) =>
      request<void>(`/admin/review/${id}/approve`, { method: "POST", token, body: JSON.stringify(body) }),
    reject: (token: string, id: string) => request<void>(`/admin/review/${id}/reject`, { method: "POST", token, body: "{}" }),
    settings: (token: string) => request<AdminSettingsDto>("/admin/settings", { token }),
    saveSettings: (token: string, body: Partial<AdminSettingsDto>) =>
      request<AdminSettingsDto>("/admin/settings", { method: "PUT", token, body: JSON.stringify(body) }),
    sources: (token: string) => request<AdminSourceDto[]>("/admin/sources", { token }),
    patchSource: (token: string, id: string, body: { isActive?: boolean; trust?: number; linkPriority?: number; title?: string }) =>
      request<void>(`/admin/sources/${encodeURIComponent(id)}`, { method: "PATCH", token, body: JSON.stringify(body) }),
    users: (token: string, params: string) => request<AdminUsersPage>(`/admin/users?${params}`, { token }),
    user: (token: string, id: string) => request<AdminUserDetail>(`/admin/users/${id}`, { token }),
    grant: (token: string, id: string, body: AdminGrantPlan) =>
      request<AdminUserDetail>(`/admin/users/${id}/plan`, { method: "POST", token, body: JSON.stringify(body) }),
    broadcastAudience: (token: string, audience: BroadcastAudience) => request<BroadcastResult>(`/admin/broadcast/audience?audience=${audience}`, { token }),
    broadcast: (token: string, body: BroadcastRequest) => request<BroadcastResult>("/admin/broadcast", { method: "POST", token, body: JSON.stringify(body) }),
    addSource: (token: string, handle: string) => request<void>("/admin/sources", { method: "POST", token, body: JSON.stringify({ handle }) }),
  },
  cv: {
    list: (token: string) => request<CvListDto>("/cv", { token }),
    get: (token: string, id: string) => request<CvDetailDto>(`/cv/${id}`, { token }),
    preview: (token: string, id: string) => request<{ html: string }>(`/cv/${id}/preview`, { token }),
    templates: (token: string) => request<CvTemplateDto[]>("/cv/templates", { token }),
    generate: (token: string, body: CvGenerateRequest) =>
      request<CvGenerateResponse>("/cv/generate", { method: "POST", token, body: JSON.stringify(body) }),
    update: (token: string, id: string, body: { title?: string; templateId?: string; content?: CvContent }) =>
      request<CvDetailDto>(`/cv/${id}`, { method: "PATCH", token, body: JSON.stringify(body) }),
    remove: (token: string, id: string) => request<void>(`/cv/${id}`, { method: "DELETE", token }),
    send: (token: string, id: string) => request<{ sent: boolean; watermarked: boolean }>(`/cv/${id}/send`, { method: "POST", token, body: "{}" }),
    unlock: (token: string, id: string) => request<CvDetailDto>(`/cv/${id}/unlock`, { method: "POST", token, body: "{}" }),
    polish: (token: string, id: string, body: { content?: CvContent; targets: CvPolishTarget[] | "all" }) =>
      request<CvPolishResponse>(`/cv/${id}/polish`, { method: "POST", token, body: JSON.stringify(body) }),
    review: (token: string, id: string, content?: CvContent) =>
      request<{ tips: CvReviewTip[] }>(`/cv/${id}/review`, { method: "POST", token, body: JSON.stringify({ content }) }),
  },
  payment: (token: string, id: string) => request<PaymentDto>(`/billing/payments/${id}`, { token }),
};

/** Feed query → URL params (same names the API validates). */
export function feedParams(q: JobFeedQuery): string {
  const p = new URLSearchParams({ scope: q.scope });
  if (q.q?.trim()) p.set("q", q.q.trim());
  if (q.cities?.length) p.set("cities", q.cities.join(","));
  if (q.employmentTypes?.length) p.set("types", q.employmentTypes.join(","));
  if (q.employers?.length) p.set("employers", q.employers.join(","));
  if (q.remote) p.set("remote", "1");
  if (q.postedWithin) p.set("posted", q.postedWithin);
  if (q.closingSoon) p.set("closing", "1");
  if (q.salaryStated) p.set("salary", "1");
  if (q.similarTo) p.set("similar", q.similarTo);
  if (q.cursor) p.set("cursor", q.cursor);
  if (q.limit) p.set("limit", String(q.limit));
  return p.toString();
}

/** Multipart upload (no JSON content type: the browser sets the boundary). */
export async function uploadCvFile(token: string, file: File): Promise<{ text: string }> {
  const form = new FormData();
  form.append("file", file);
  let res: Response;
  try {
    res = await fetch(`${API_URL}/cv/import`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string | string[] };
    const message = Array.isArray(body.message) ? body.message.join(", ") : body.message;
    throw new ApiError(res.status, message || `Upload failed (${res.status})`);
  }
  return (await res.json()) as { text: string };
}
