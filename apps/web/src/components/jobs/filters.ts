import {
  CITY_IDS,
  EMPLOYER_FILTERS,
  EMPLOYMENT_TYPE_IDS,
  POSTED_WITHIN,
  type EmployerFilter,
  type FeedScope,
  type JobFeedQuery,
  type PostedWithin,
} from "@ethio/shared";

/** Feed state that lives in the URL, so back-navigation and reloads keep the same view. Pure. */
export interface FeedState {
  scope: FeedScope;
  q: string;
  cities: string[];
  types: string[];
  employers: EmployerFilter[];
  remote: boolean;
  posted: PostedWithin | null;
  closing: boolean;
  salary: boolean;
  /** "Similar jobs" from a job card: jobs like this job id. */
  similar: string | null;
}

export const EMPTY_FILTERS: Omit<FeedState, "scope" | "q"> = {
  cities: [],
  types: [],
  employers: [],
  remote: false,
  posted: null,
  closing: false,
  salary: false,
  similar: null,
};

const list = (v: string | null, allowed: ReadonlySet<string> | readonly string[]) => {
  const ok = new Set(allowed);
  return (v ?? "").split(",").filter((x) => ok.has(x));
};

export function parseFeedState(params: URLSearchParams): FeedState {
  const posted = params.get("posted");
  return {
    scope: params.get("scope") === "all" ? "all" : params.get("scope") === "saved" ? "saved" : "for_you",
    q: (params.get("q") ?? "").slice(0, 80),
    cities: list(params.get("cities"), CITY_IDS),
    types: list(params.get("types"), EMPLOYMENT_TYPE_IDS),
    employers: list(params.get("employers"), EMPLOYER_FILTERS) as EmployerFilter[],
    remote: params.get("remote") === "1",
    posted: (POSTED_WITHIN as readonly string[]).includes(posted ?? "") ? (posted as PostedWithin) : null,
    closing: params.get("closing") === "1",
    salary: params.get("salary") === "1",
    similar: /^[0-9a-f-]{36}$/i.test(params.get("similar") ?? "") ? params.get("similar") : null,
  };
}

export function feedStateToParams(s: FeedState): string {
  const p = new URLSearchParams();
  if (s.scope !== "for_you") p.set("scope", s.scope);
  if (s.q.trim()) p.set("q", s.q.trim());
  if (s.cities.length) p.set("cities", s.cities.join(","));
  if (s.types.length) p.set("types", s.types.join(","));
  if (s.employers.length) p.set("employers", s.employers.join(","));
  if (s.remote) p.set("remote", "1");
  if (s.posted) p.set("posted", s.posted);
  if (s.closing) p.set("closing", "1");
  if (s.salary) p.set("salary", "1");
  if (s.similar) p.set("similar", s.similar);
  return p.toString();
}

export function toQuery(s: FeedState): Omit<JobFeedQuery, "cursor" | "limit"> {
  return {
    scope: s.scope,
    q: s.q.trim() || undefined,
    cities: s.cities,
    employmentTypes: s.types,
    employers: s.employers,
    remote: s.remote || undefined,
    postedWithin: s.posted ?? undefined,
    closingSoon: s.closing || undefined,
    salaryStated: s.salary || undefined,
    similarTo: s.similar ?? undefined,
  };
}

/** Number of active filters (search and tab not counted), for the filter button badge. */
export function activeFilterCount(s: FeedState): number {
  return s.cities.length + s.types.length + s.employers.length + (s.remote ? 1 : 0) + (s.posted ? 1 : 0) + (s.closing ? 1 : 0) + (s.salary ? 1 : 0);
}

export const EMPLOYER_FILTER_LABEL: Record<EmployerFilter, string> = {
  private: "Private company",
  government: "Government",
  ngo: "NGO",
  international: "UN, AU & embassies",
  foreign: "International company",
};

export const POSTED_LABEL: Record<PostedWithin, string> = { "1d": "Last 24 hours", "3d": "Last 3 days", "7d": "Last 7 days", "30d": "Last 30 days" };
