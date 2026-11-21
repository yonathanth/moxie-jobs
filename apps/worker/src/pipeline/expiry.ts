import { prisma } from "../db";
import { log } from "../log";

/** Hourly: expire jobs past their deadline (or 30 days old without one) and purge old page copies. */
export async function runExpiry(): Promise<void> {
  const expired = await prisma.$executeRaw`
    UPDATE "Job" SET status = 'expired', "updatedAt" = now()
    WHERE status = 'active'
      AND (("deadline" IS NOT NULL AND "deadline" < now())
        OR ("deadline" IS NULL AND "firstSeenAt" < now() - interval '30 days'))`;
  const hidden = await prisma.$executeRaw`
    UPDATE "Job" SET status = 'hidden', "updatedAt" = now()
    WHERE status = 'expired' AND "updatedAt" < now() - interval '90 days'`;
  const purged = await prisma.$executeRaw`
    UPDATE "RawPost" SET "pageText" = NULL
    WHERE "pageText" IS NOT NULL AND "createdAt" < now() - interval '30 days'`;
  if (expired || hidden || purged) log.info({ expired, hidden, purged }, "expiry run");
}
