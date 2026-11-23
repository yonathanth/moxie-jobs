import { cache } from "react";
import type { PublicJobDto } from "@ethio/shared";
import { API_URL } from "./config";

/** Server-side API base: the internal address when set (same machine), else the public one. */
const SERVER_API_URL = (process.env.API_INTERNAL_URL ?? API_URL).replace(/\/$/, "");

/** A shared job, for /j/:id and its preview image. Cached 5 min; null if missing. */
export const getPublicJob = cache(async (id: string): Promise<PublicJobDto | null> => {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  try {
    const res = await fetch(`${SERVER_API_URL}/public/jobs/${id}`, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    return (await res.json()) as PublicJobDto;
  } catch {
    return null;
  }
});

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Addis_Ababa" });
}

/** "Accountant at Dashen Bank" / "Accountant · NGO". */
export function jobHeadline(job: PublicJobDto): string {
  const who = job.company ?? job.employerLabel;
  return who ? `${job.title} at ${who}` : job.title;
}
