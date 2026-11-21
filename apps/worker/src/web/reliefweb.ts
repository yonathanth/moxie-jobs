import { env } from "../env";
import { clampText, type WebAdapter, type WebItem, type WebListing } from "./types";

/**
 * ReliefWeb jobs API v2 (https://apidoc.reliefweb.int/read/resources/jobs/).
 * Needs an approved appname (RELIEFWEB_APPNAME). Limits: 1000 entries per call,
 * 10 000 calls per day; we make one call every few hours.
 * Usage promise from our appname request: summaries only, always link back.
 */

const API_URL = "https://api.reliefweb.int/v2/jobs";
const LOOKBACK_DAYS = 3;
const FIELDS = [
  "id",
  "title",
  "body",
  "how_to_apply",
  "date.created",
  "date.closing",
  "source.name",
  "country.name",
  "city.name",
  "career_categories.name",
  "experience.name",
  "type.name",
  "url",
  "url_alias",
];

/** Request body for jobs in Ethiopia created in the last few days, newest first. */
export function reliefwebRequestBody(now = new Date()) {
  const from = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 3_600_000).toISOString();
  return {
    preset: "latest",
    filter: {
      operator: "AND",
      conditions: [
        { field: "country.iso3", value: "ETH" },
        { field: "date.created", value: { from } },
      ],
    },
    fields: { include: FIELDS },
    sort: ["date.created:desc"],
    limit: 200,
  };
}

type Named = { name?: unknown } | { name?: unknown }[] | undefined;

/** ReliefWeb returns reference fields as arrays of {name} (sometimes a single object). */
function names(v: Named): string[] {
  const list = Array.isArray(v) ? v : v ? [v] : [];
  return list.map((x) => (typeof x?.name === "string" ? x.name.trim() : "")).filter(Boolean);
}

export interface ReliefwebJob {
  id: number | string;
  fields: {
    title?: string;
    body?: string;
    how_to_apply?: string;
    date?: { created?: string; closing?: string };
    source?: Named;
    country?: Named;
    city?: Named;
    career_categories?: Named;
    experience?: Named;
    type?: Named;
    url?: string;
    url_alias?: string;
  };
}

/** Maps one API record to a stored item. Pure, unit-tested. */
export function reliefwebToItem(job: ReliefwebJob): WebItem | null {
  const f = job.fields ?? {};
  const id = String(job.id);
  if (!/^\d+$/.test(id) || !f.title) return null;
  const url = f.url_alias || f.url || `https://reliefweb.int/job/${id}`;
  const created = f.date?.created ? new Date(f.date.created) : null;
  const line = (label: string, values: string[]) => (values.length ? `${label}: ${values.join(", ")}` : null);
  const text = [
    f.title,
    line("Organization", names(f.source)),
    line("Location", [...names(f.city), ...names(f.country)]),
    line("Job type", names(f.type)),
    line("Career category", names(f.career_categories)),
    line("Experience", names(f.experience)),
    f.date?.closing ? `Closing date: ${f.date.closing.slice(0, 10)}` : null,
    "",
    f.body?.trim() ?? "",
    f.how_to_apply?.trim() ? `\nHow to apply:\n${f.how_to_apply.trim()}` : null,
  ]
    .filter((x): x is string => x !== null)
    .join("\n");
  return {
    externalId: BigInt(id),
    url,
    postedAt: created && !Number.isNaN(created.getTime()) ? created : new Date(),
    text: clampText(text),
  };
}

export class ReliefwebAdapter implements WebAdapter {
  readonly sourceId = "reliefweb";
  readonly intervalMs = 3 * 60 * 60_000;

  notReady(): string | null {
    return env().RELIEFWEB_APPNAME ? null : "RELIEFWEB_APPNAME not set (waiting for ReliefWeb approval)";
  }

  async list(): Promise<WebListing[]> {
    const url = `${API_URL}?appname=${encodeURIComponent(env().RELIEFWEB_APPNAME!)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": env().FETCH_USER_AGENT },
      body: JSON.stringify(reliefwebRequestBody()),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`ReliefWeb API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const json = (await res.json()) as { data?: ReliefwebJob[] };
    const listings: WebListing[] = [];
    for (const job of json.data ?? []) {
      const item = reliefwebToItem(job);
      if (item) listings.push({ externalId: item.externalId, url: item.url, postedAt: item.postedAt, item });
    }
    return listings;
  }
}
