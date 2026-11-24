"use client";

import { usePathname } from "next/navigation";
import { JobCardSkeleton } from "./jobs/JobCard";
import { Card, Skeleton } from "./ui";

/**
 * Loading placeholders shaped like the page that's coming, so nothing jumps
 * when it arrives. Use these instead of a spinner for page and list loads;
 * keep spinners for actions in progress (a button, "waiting for payment").
 */

function Header({ subtitle = true }: { subtitle?: boolean }) {
  return (
    <div>
      <Skeleton className="h-7 w-40" />
      {subtitle && <Skeleton className="mt-2.5 h-4 w-64 max-w-full" />}
    </div>
  );
}

type SkeletonVariant = "list" | "jobs" | "detail" | "form" | "cv" | "cvs" | "plans" | "profile";

/** The placeholder the page at this path shows while it loads, so sign-in and page load look like one. */
export function skeletonFor(path: string): SkeletonVariant {
  if (/^\/app\/jobs\/[^/]+/.test(path)) return "detail";
  if (path.startsWith("/app/jobs")) return "jobs";
  if (path === "/app/cvs") return "cvs";
  if (path.startsWith("/app/cvs/new") || path.startsWith("/app/onboarding") || path.startsWith("/app/preferences")) return "form";
  if (path.startsWith("/app/cvs/")) return "cv";
  if (path.startsWith("/app/plans")) return "plans";
  if (path === "/app") return "profile";
  return "list";
}

export function RouteSkeleton() {
  return <ScreenSkeleton variant={skeletonFor(usePathname() ?? "")} />;
}

/** A screen of its own: header + body. */
export function ScreenSkeleton({ variant = "list" }: { variant?: SkeletonVariant }) {
  return (
    <main aria-busy="true" aria-label="Loading" className="mx-auto min-h-dvh w-full max-w-lg px-4 pb-28 pt-5">
      {variant === "jobs" && <JobsSkeleton />}
      {variant === "detail" && <JobDetailSkeleton />}
      {variant === "form" && <FormSkeleton />}
      {variant === "cv" && <CvPageSkeleton />}
      {variant === "plans" && <PlansSkeleton />}
      {variant === "profile" && <ProfileSkeleton />}
      {variant === "cvs" && (
        <>
          <Header />
          <div className="mt-5 flex flex-col gap-3">
            {[0, 1].map((i) => (
              <Card key={i} className="flex min-h-[96px] items-center gap-4 px-4 py-5">
                <Skeleton className="size-10 rounded-xl" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-2/5" />
                  <Skeleton className="mt-2 h-3 w-3/5" />
                </div>
                <Skeleton className="size-8 rounded-full" />
              </Card>
            ))}
          </div>
          <Skeleton className="mb-2 mt-5 h-4 w-20" />
          <div className="grid grid-cols-2 gap-3">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="aspect-[1/1.414] rounded-2xl" />
            ))}
          </div>
        </>
      )}
      {variant === "list" && (
        <>
          <Header />
          <div className="mt-5">
            <RowsSkeleton />
          </div>
        </>
      )}
    </main>
  );
}

/** Rows of cards with an icon, two lines and a trailing mark (CV list, admin lists). */
export function RowsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-busy="true">
      {Array.from({ length: count }, (_, i) => (
        <Card key={i} className="flex items-center gap-3 p-3.5">
          <Skeleton className="size-10 rounded-xl" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="mt-2 h-3 w-2/5" />
          </div>
          <Skeleton className="h-4 w-4" />
        </Card>
      ))}
    </div>
  );
}

/** Job cards in the feed (the same placeholder the feed shows while it loads). */
export function JobCardsSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      {Array.from({ length: count }, (_, i) => (
        <JobCardSkeleton key={i} />
      ))}
    </div>
  );
}

function JobsSkeleton() {
  return (
    <>
      <Header subtitle={false} />
      <Skeleton className="mt-4 h-11 w-full rounded-xl" />
      <div className="mt-3 flex gap-2">
        <Skeleton className="h-8 w-24 rounded-full" />
        <Skeleton className="h-8 w-20 rounded-full" />
        <Skeleton className="h-8 w-28 rounded-full" />
      </div>
      <div className="mt-4">
        <JobCardsSkeleton />
      </div>
    </>
  );
}

function JobDetailSkeleton() {
  return (
    <>
      <Skeleton className="mb-4 h-11 w-full rounded-full" />
      <div className="flex gap-2">
        <Skeleton className="h-6 w-20 rounded-full" />
        <Skeleton className="h-6 w-28 rounded-full" />
      </div>
      <Skeleton className="mt-3 h-7 w-4/5" />
      <Skeleton className="mt-2 h-4 w-1/2" />
      <div className="mt-3 flex gap-2">
        <Skeleton className="h-9 w-20 rounded-full" />
        <Skeleton className="h-9 w-20 rounded-full" />
      </div>
      <Card className="mt-5 grid gap-3.5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-5 rounded-md" />
            <Skeleton className="h-4 flex-1" />
          </div>
        ))}
      </Card>
      <Skeleton className="mt-6 h-5 w-32" />
      <Card className="mt-2 grid gap-2">
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-11/12" />
        <Skeleton className="h-3.5 w-4/5" />
        <Skeleton className="h-3.5 w-3/5" />
      </Card>
      <Skeleton className="mt-6 h-5 w-28" />
      <Card className="mt-2 grid gap-2.5">
        {["w-4/5", "w-3/5", "w-2/3"].map((w) => (
          <div key={w} className="flex items-center gap-2.5">
            <Skeleton className="size-4 rounded-full" />
            <Skeleton className={`h-3.5 ${w}`} />
          </div>
        ))}
      </Card>
      <Skeleton className="mt-6 h-5 w-28" />
      <Card className="mt-2 grid gap-2">
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-2/3" />
      </Card>
    </>
  );
}

function FormSkeleton() {
  return (
    <>
      <Header />
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="mt-6">
          <Skeleton className="h-5 w-36" />
          <Card className="mt-2 grid gap-3">
            <Skeleton className="h-11 w-full rounded-xl" />
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-8 w-24 rounded-full" />
              <Skeleton className="h-8 w-32 rounded-full" />
              <Skeleton className="h-8 w-20 rounded-full" />
            </div>
          </Card>
        </div>
      ))}
    </>
  );
}

function PlansSkeleton() {
  return (
    <>
      <Header />
      <Skeleton className="mt-5 h-10 w-full rounded-xl" />
      {Array.from({ length: 2 }, (_, i) => (
        <Card key={i} className="mt-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-7 w-20" />
          </div>
          <div className="mt-4 grid gap-2.5">
            {Array.from({ length: 4 }, (_, j) => (
              <Skeleton key={j} className="h-4 w-4/5" />
            ))}
          </div>
          <Skeleton className="mt-5 h-12 w-full rounded-xl" />
        </Card>
      ))}
    </>
  );
}

function ProfileSkeleton() {
  return (
    <>
      <Header />
      <Card className="mt-5 flex items-center gap-3">
        <Skeleton className="size-10 rounded-xl" />
        <div className="flex-1">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="mt-2 h-3 w-1/2" />
        </div>
        <Skeleton className="h-9 w-20 rounded-lg" />
      </Card>
      <div className="mt-5">
        <RowsSkeleton count={3} />
      </div>
      <Skeleton className="mt-6 h-5 w-20" />
      <Card className="mt-2 flex items-center gap-3">
        <div className="flex-1">
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="mt-2 h-3 w-3/5" />
        </div>
        <Skeleton className="h-7 w-12 rounded-full" />
      </Card>
    </>
  );
}

/** The CV page: title, two buttons, and a paper sheet. */
export function CvPageSkeleton() {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-2 h-7 w-4/5" />
        </div>
        <Skeleton className="h-11 w-28 rounded-lg" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Skeleton className="h-11 rounded-xl" />
        <Skeleton className="h-11 rounded-xl" />
      </div>
      <div className="mt-4">
        <PaperSkeleton />
      </div>
    </>
  );
}

/** An A4 page with placeholder lines, for a CV that hasn't rendered yet. */
export function PaperSkeleton() {
  return (
    <div aria-busy="true" className="aspect-[1/1.414] w-full overflow-hidden rounded-xl border border-separator bg-white p-[7%]">
      <Skeleton className="h-[5%] w-1/2" />
      <Skeleton className="mt-[2%] h-[2.2%] w-1/3" />
      <Skeleton className="mt-[2%] h-[1.8%] w-3/5" />
      {[0, 1, 2].map((block) => (
        <div key={block} className="mt-[7%]">
          <Skeleton className="h-[2.4%] min-h-2.5 w-1/4" />
          <div className="mt-[3%] grid gap-[6px]">
            <Skeleton className="h-2 w-full" />
            <Skeleton className="h-2 w-11/12" />
            <Skeleton className="h-2 w-4/5" />
            {block < 2 && <Skeleton className="h-2 w-2/3" />}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Template thumbnails in a 3-column grid. */
export function TemplatesSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {Array.from({ length: count }, (_, i) => (
        <div key={i}>
          <Skeleton className="aspect-[1/1.414] w-full rounded-lg" />
          <Skeleton className="mt-1.5 h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}
