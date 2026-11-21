import type { Job, RawPost, Source } from "@ethio/db";
import { ExtractionError, type Extractor } from "../ai/extract";
import { prisma } from "../db";
import { log } from "../log";
import type { PostButton } from "../telegram/message";
import { createData, findDuplicate, mergeData } from "./dedup";
import { fetchPageText, pickPageUrl } from "./enrich";
import { normalizeJob, type JobDraft } from "./normalize";
import { failPost, finishPost } from "./queue";
import { loadTaxonomy } from "./taxonomy";
import { prefilter } from "./text";

const DAY = 24 * 60 * 60 * 1000;

export type NewJobHook = (job: Job) => Promise<void>;

/** "2026-11-19 14:05 (Thursday)" in Addis Ababa time. */
export function formatEat(date: Date): string {
  const eat = new Date(date.getTime() + 3 * 60 * 60 * 1000);
  const weekday = eat.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  return `${eat.toISOString().slice(0, 16).replace("T", " ")} (${weekday})`;
}

function hasSpecificPath(url: string): boolean {
  try {
    const u = new URL(url);
    return u.pathname.replace(/\/+$/, "").length > 1 || u.search.length > 1;
  } catch {
    return false;
  }
}

export class PostProcessor {
  private priorities = new Map<string, number>();
  private prioritiesAt = 0;

  constructor(
    private readonly extractor: Extractor,
    private readonly onNewJob: NewJobHook,
  ) {}

  async process(id: string): Promise<void> {
    const post = await prisma.rawPost.findUnique({ where: { id }, include: { source: true } }).catch((e: unknown) => {
      log.error({ post: id, error: String(e).slice(0, 300) }, "could not load post");
      return null;
    });
    if (!post) return;
    const started = Date.now();
    try {
      const outcome = await this.run(post);
      log.info({ post: id, source: post.sourceId, msg: post.messageId.toString(), ms: Date.now() - started, ...outcome }, "post processed");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn({ post: id, attempts: post.attempts, error: message.slice(0, 300) }, "post failed");
      // If the DB is unreachable this fails too; the post stays "processing" and releaseStale requeues it.
      await failPost(id, post.attempts, message).catch((e: unknown) =>
        log.error({ post: id, error: String(e).slice(0, 300) }, "could not record post failure"),
      );
    }
  }

  private async run(post: RawPost & { source: Source }): Promise<Record<string, unknown>> {
    const { source } = post;
    const buttons = (post.buttons as unknown as PostButton[]) ?? [];
    const urls = [...buttons.map((b) => b.url), ...post.links];

    // 1. Cheap filters.
    const skip = prefilter(post.text);
    if (skip) {
      await finishPost(post.id, "skipped", skip);
      return { skipped: skip };
    }

    const twin = await prisma.rawPost.findFirst({
      where: { textHash: post.textHash, id: { not: post.id }, status: "done", createdAt: { gte: new Date(Date.now() - 30 * DAY) } },
      include: { sightings: { select: { jobId: true } } },
    });
    if (twin && twin.sightings.length) {
      await this.addSightings(twin.sightings.map((s) => s.jobId), post.id);
      await finishPost(post.id, "skipped", "duplicate_text");
      return { skipped: "duplicate_text", jobs: twin.sightings.length };
    }

    const specific = urls.filter(hasSpecificPath);
    if (specific.length) {
      const known = await prisma.job.findMany({ where: { sourceUrl: { in: specific } }, select: { id: true } });
      if (known.length) {
        await this.addSightings(known.map((j) => j.id), post.id);
        await finishPost(post.id, "skipped", "duplicate_link");
        return { skipped: "duplicate_link", jobs: known.length };
      }
    }

    // 2. Enrich from the source's website when the post is only a teaser.
    let pageUrl = post.pageUrl;
    let pageText = post.pageText;
    let partial = false;
    if (!pageText && (source.format === "website_link" || source.format === "mixed") && source.websiteDomains.length) {
      const candidate = pickPageUrl(urls, source.websiteDomains);
      if (candidate) {
        const page = await fetchPageText(candidate, source.websiteDomains);
        if (page) {
          pageUrl = page.url;
          pageText = page.text;
          await prisma.rawPost.update({ where: { id: post.id }, data: { pageUrl, pageText } });
        } else {
          partial = source.format === "website_link";
        }
      }
    }

    // 3. Extract.
    const taxonomy = await loadTaxonomy();
    let result;
    try {
      result = await this.extractor.extract(
        {
          postedAtEat: formatEat(post.postedAt),
          sourceTitle: source.title,
          sourceType: source.type,
          text: post.text,
          buttons,
          pageText,
        },
        taxonomy.prompt,
      );
    } catch (err) {
      const usage = err instanceof ExtractionError ? err.usage : undefined;
      await prisma.extractionLog.create({
        data: {
          rawPostId: post.id,
          model: "unknown",
          inputTokens: usage?.inputTokens ?? 0,
          outputTokens: usage?.outputTokens ?? 0,
          latencyMs: 0,
          ok: false,
          error: (err instanceof Error ? err.message : String(err)).slice(0, 1000),
        },
      });
      throw err;
    }
    const { extraction } = result;
    await prisma.extractionLog.create({
      data: {
        rawPostId: post.id,
        model: result.model,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        cachedTokens: result.usage.cachedTokens,
        latencyMs: result.latencyMs,
        jobsFound: extraction.jobs.length,
        ok: true,
      },
    });

    if (!extraction.is_job_post || extraction.reject_reason || extraction.jobs.length === 0) {
      const reason = `ai_${extraction.reject_reason ?? "not_job"}`;
      await finishPost(post.id, "skipped", reason);
      return { skipped: reason, tokens: result.usage };
    }

    // 4. Normalize, dedup, store.
    const created: Job[] = [];
    let merged = 0;
    for (const candidate of extraction.jobs) {
      const draft = normalizeJob(candidate, {
        source: { id: source.id, handle: source.handle, format: source.format, websiteDomains: source.websiteDomains },
        post: { messageId: post.messageId, postedAt: post.postedAt, links: post.links, buttons, pageUrl },
        taxonomy: taxonomy.ids,
      });
      if (!draft) continue;
      if (partial && !draft.qualityFlags.includes("partial")) draft.qualityFlags.push("partial");

      const outcome = await this.upsertJob(draft, source, post);
      if (outcome.created) created.push(outcome.job);
      else merged++;
    }

    await finishPost(post.id, "done");
    for (const job of created) {
      if (job.status === "active") await this.onNewJob(job).catch((err: unknown) => log.error({ job: job.id, err: String(err) }, "new-job hook failed"));
    }
    return { created: created.length, merged, tokens: result.usage, aiMs: result.latencyMs };
  }

  /** Find-or-create under an advisory lock so parallel reposts of one job don't create two rows. */
  private async upsertJob(draft: JobDraft, source: Source, post: RawPost) {
    const lockKey = `job:${draft.companyKey ?? draft.professionId ?? "none"}`;
    const priorities = await this.sourcePriorities();
    return prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
        const existing = await findDuplicate(draft, tx);
        if (existing) {
          const data = mergeData(
            existing,
            draft,
            { existing: priorities.get(existing.primarySourceId) ?? 0, incoming: source.linkPriority },
            source.id,
          );
          const job = Object.keys(data).length ? await tx.job.update({ where: { id: existing.id }, data }) : existing;
          await tx.jobSighting.createMany({ data: [{ jobId: job.id, rawPostId: post.id }], skipDuplicates: true });
          return { job, created: false };
        }
        const job = await tx.job.create({ data: createData(draft, source.id, post.postedAt) });
        await tx.jobSighting.create({ data: { jobId: job.id, rawPostId: post.id, isFirst: true } });
        return { job, created: true };
      },
      { timeout: 20_000, maxWait: 10_000 },
    );
  }

  private async addSightings(jobIds: string[], rawPostId: string) {
    await prisma.jobSighting.createMany({ data: jobIds.map((jobId) => ({ jobId, rawPostId })), skipDuplicates: true });
  }

  private async sourcePriorities(): Promise<Map<string, number>> {
    if (Date.now() - this.prioritiesAt > 5 * 60_000) {
      const sources = await prisma.source.findMany({ select: { id: true, linkPriority: true } });
      this.priorities = new Map(sources.map((s) => [s.id, s.linkPriority]));
      this.prioritiesAt = Date.now();
    }
    return this.priorities;
  }
}
