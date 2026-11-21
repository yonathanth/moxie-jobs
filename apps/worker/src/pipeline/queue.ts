import { prisma } from "../db";

/** RawPost rows are the work queue: claim with SKIP LOCKED so several workers can't take the same post. */

const STALE_MINUTES = 10;
export const MAX_ATTEMPTS = 3;

/** Newest first: fresh jobs matter more than a catch-up backlog. */
export async function claimPosts(limit: number): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE "RawPost"
    SET status = 'processing', "lockedAt" = now(), attempts = attempts + 1, "updatedAt" = now()
    WHERE id IN (
      SELECT id FROM "RawPost"
      WHERE status = 'new'
      ORDER BY "postedAt" DESC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id`;
  return rows.map((r) => r.id);
}

/** Returns posts stuck in "processing" (worker crashed mid-way) to the queue. */
export async function releaseStale(): Promise<number> {
  return prisma.$executeRaw`
    UPDATE "RawPost" SET status = 'new', "lockedAt" = NULL, "updatedAt" = now()
    WHERE status = 'processing' AND "lockedAt" < now() - make_interval(mins => ${STALE_MINUTES}::int)`;
}

export async function finishPost(id: string, status: "done" | "skipped", skipReason?: string) {
  await prisma.rawPost.update({ where: { id }, data: { status, skipReason: skipReason ?? null, lockedAt: null, error: null } });
}

export async function failPost(id: string, attempts: number, error: string) {
  await prisma.rawPost.update({
    where: { id },
    data: { status: attempts >= MAX_ATTEMPTS ? "failed" : "new", lockedAt: null, error: error.slice(0, 2000) },
  });
}
