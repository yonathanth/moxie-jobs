import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import type { User } from "@ethio/db";
import { CITY_IDS, EMPLOYER_FILTERS, EMPLOYMENT_TYPE_IDS, FEED_SCOPES, POSTED_WITHIN, type JobCardDto, type JobFeedPage } from "@ethio/shared";
import { AuthGuard, CurrentUser } from "../auth/auth.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JobsService } from "./jobs.service";

/** Comma-separated query values ("addis_ababa,adama") → string[]. */
const csv = (allowed?: ReadonlySet<string> | readonly string[]) =>
  z
    .string()
    .max(500)
    .optional()
    .transform((v) => {
      const items = (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      const ok = allowed ? new Set(allowed) : null;
      return ok ? items.filter((i) => ok.has(i)) : items;
    });
const flag = z
  .enum(["1", "0", "true", "false"])
  .optional()
  .transform((v) => v === "1" || v === "true");

const feedSchema = z.object({
  scope: z.enum(FEED_SCOPES).default("for_you"),
  q: z.string().trim().max(80).optional(),
  cities: csv(CITY_IDS),
  types: csv(EMPLOYMENT_TYPE_IDS),
  employers: csv(EMPLOYER_FILTERS),
  remote: flag,
  posted: z.enum(POSTED_WITHIN).optional(),
  closing: flag,
  salary: flag,
  similar: z.uuid().optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(5).max(30).optional(),
});

@Controller("jobs")
@UseGuards(AuthGuard)
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  /** The Mini App feed: "for_you" (matches) or "all" (browse), searchable, keyset-paginated. */
  @Get()
  feed(@CurrentUser() user: User, @Query(new ZodValidationPipe(feedSchema)) q: z.infer<typeof feedSchema>): Promise<JobFeedPage> {
    return this.jobs.feed(user, {
      scope: q.scope,
      q: q.q,
      cities: q.cities,
      employmentTypes: q.types,
      employers: q.employers as (typeof EMPLOYER_FILTERS)[number][],
      remote: q.remote,
      postedWithin: q.posted,
      closingSoon: q.closing,
      salaryStated: q.salary,
      similarTo: q.similar,
      cursor: q.cursor,
      limit: q.limit,
    });
  }

  @Get(":id")
  one(@CurrentUser() user: User, @Param("id", new ParseUUIDPipe()) id: string): Promise<JobCardDto> {
    return this.jobs.one(user, id);
  }
}
