import type { Job } from "@ethio/db";
import { createAiClient } from "./ai/client";
import { BackfillWatcher } from "./delivery/backfill";
import { matchAndQueue } from "./delivery/matcher";
import { Sender } from "./delivery/sender";
import { OnboardingNudge } from "./delivery/nudge";
import { Promoter } from "./delivery/promo";
import { MissedDigest } from "./delivery/digest";
import { Extractor } from "./ai/extract";
import { prisma } from "./db";
import { env } from "./env";
import { log } from "./log";
import { runExpiry } from "./pipeline/expiry";
import { Pipeline } from "./pipeline/pipeline";
import { PostProcessor } from "./pipeline/process";
import { connectListener } from "./telegram/client";
import { Listener } from "./telegram/listener";
import { JoinWatcher, ReviewWatcher } from "./admin-watchers";
import { AfricanUnionAdapter } from "./web/african-union";
import { ReliefwebAdapter } from "./web/reliefweb";
import { WebSourceRunner } from "./web/runner";

// Network blips (DB or Telegram unreachable for a few seconds) must not kill the worker:
// every loop retries on its own timer, so log and keep running.
process.on("unhandledRejection", (reason) => {
  log.error({ error: reason instanceof Error ? reason.stack : String(reason) }, "unhandled rejection (continuing)");
});

async function main() {
  const e = env();
  const { client: ai, model } = createAiClient();

  const sender = new Sender();
  // Marketing pictures in two daily slots (replaces the old 18:00 summary).
  const promoter = new Promoter();
  const nudge = new OnboardingNudge();
  // Free users: the jobs they missed yesterday, every morning.
  const digest = new MissedDigest();
  if (e.DELIVERY_ENABLED) {
    sender.start();
    promoter.start();
    nudge.start();
    digest.start();
  }
  else log.warn("delivery disabled (DELIVERY_ENABLED=false): jobs are matched but not sent");

  const onNewJob = async (job: Job) => {
    log.info({ job: job.id, title: job.title, company: job.company }, "new job");
    const queued = await matchAndQueue(job);
    if (queued && e.DELIVERY_ENABLED) sender.kick();
  };

  const backfill = new BackfillWatcher(() => {
    if (e.DELIVERY_ENABLED) sender.kick();
  });
  backfill.start();

  const pipeline = new Pipeline(new PostProcessor(new Extractor(ai, model), onNewJob), e.PIPELINE_CONCURRENCY);
  pipeline.start();

  // Jobs approved in the admin are matched like new jobs.
  const review = new ReviewWatcher(onNewJob);
  review.start();

  let listener: Listener | null = null;
  let joiner: JoinWatcher | null = null;
  if (e.LISTENER_ENABLED) {
    const tg = await connectListener();
    listener = new Listener(tg, () => pipeline.kick(), e.POLL_INTERVAL_SECONDS * 1000);
    await listener.start();
    const l = listener;
    joiner = new JoinWatcher(tg, () => void l.reloadSources());
    joiner.start();
  } else {
    log.warn("listener disabled (LISTENER_ENABLED=false): processing queued posts only");
  }

  const web = new WebSourceRunner([new ReliefwebAdapter(), new AfricanUnionAdapter()], () => pipeline.kick());
  if (e.WEB_SOURCES_ENABLED) web.start();
  else log.warn("web sources disabled (WEB_SOURCES_ENABLED=false)");

  await runExpiry().catch((err: unknown) => log.error({ err: String(err) }, "expiry failed"));
  const expiryTimer = setInterval(
    () => void runExpiry().catch((err: unknown) => log.error({ err: String(err) }, "expiry failed")),
    60 * 60_000,
  );

  log.info({ model, concurrency: e.PIPELINE_CONCURRENCY }, "worker running");

  const shutdown = async (signal: string) => {
    log.info({ signal }, "shutting down");
    clearInterval(expiryTimer);
    backfill.stop();
    review.stop();
    joiner?.stop();
    web.stop();
    await listener?.stop().catch(() => undefined);
    await pipeline.stop();
    promoter.stop();
    digest.stop();
    nudge.stop();
    await sender.stop();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  log.fatal({ err: err instanceof Error ? err.stack : String(err) }, "worker failed to start");
  process.exit(1);
});
