"use client";

import clsx from "clsx";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { Bookmark, ChevronRight, Clock, Lock, Search, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ScreenSkeleton } from "@/components/skeletons";
import { EMPLOYMENT_TYPES, type FeedScope, type JobCardDto } from "@ethio/shared";
import { FilterSheet } from "@/components/jobs/FilterSheet";
import { Portal } from "@/components/Portal";
import { JobCard, JobCardSkeleton } from "@/components/jobs/JobCard";
import {
  activeFilterCount,
  EMPLOYER_FILTER_LABEL,
  EMPTY_FILTERS,
  feedStateToParams,
  parseFeedState,
  POSTED_LABEL,
  toQuery,
  type FeedState,
} from "@/components/jobs/filters";
import { MAX_FEED_ITEMS, useJob, useJobFeed, useTaxonomy } from "@/components/miniapp/hooks";
import { useSession } from "@/components/miniapp/session";
import { usePaywall } from "@/components/paywall";
import { Button, Chip, Sheet, Spinner } from "@/components/ui";
import { haptic } from "@/lib/telegram";

export default function JobsPage() {
  return (
    <Suspense
      fallback={
        <ScreenSkeleton variant="jobs" />
      }
    >
      <Feed />
    </Suspense>
  );
}

function Feed() {
  const router = useRouter();
  const params = useSearchParams();
  const { me } = useSession();
  const taxonomy = useTaxonomy();
  const paywall = usePaywall();
  const state = useMemo(() => parseFeedState(new URLSearchParams(params.toString())), [params]);
  const [qInput, setQInput] = useState(state.q);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const update = (patch: Partial<FeedState>) => {
    const next = feedStateToParams({ ...state, ...patch });
    router.replace(next ? `/app/jobs?${next}` : "/app/jobs", { scroll: false });
  };

  // Debounced search: the URL (and the query) change 350 ms after typing stops.
  useEffect(() => {
    if (qInput === state.q) return;
    const t = setTimeout(() => update({ q: qInput }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qInput]);

  useEffect(() => {
    if (!me.onboarded) router.replace("/app/onboarding");
  }, [me.onboarded, router]);

  const feed = useJobFeed(toQuery(state));
  const similarJob = useJob(state.similar ?? "", !!state.similar);
  // Unique by id: locked premium matches pinned to the top of page 1 can come round again on later pages.
  const items = useMemo(() => {
    const seen = new Set<string>();
    return (feed.data?.pages.flatMap((p) => p.items) ?? []).filter((j) => !seen.has(j.id) && seen.add(j.id));
  }, [feed.data]);
  const lockedCount = feed.data?.pages[0]?.lockedCount ?? 0;
  const held = state.scope === "for_you" ? feed.data?.pages[0]?.held : undefined;
  // All jobs: a label above each posting day ("Today", "Yesterday", "Mon 24 Nov"). For you and Saved have none.
  const rows = useMemo(() => (state.scope === "all" ? withDayLabels(items) : items.map((job) => ({ kind: "job" as const, job }))), [items, state.scope]);
  // Just set up or edited preferences: the worker is still matching. Show that (not "no matches") and ask again.
  const matching = state.scope === "for_you" && !feed.isPlaceholderData && !!feed.data?.pages[0]?.matching;
  useEffect(() => {
    if (!matching) return;
    const t = setInterval(() => void feed.refetch(), 3000);
    return () => clearInterval(t);
  }, [matching, feed]);
  const filterCount = activeFilterCount(state);
  const cityName = useMemo(() => new Map((taxonomy.data?.cities ?? []).map((c) => [c.id, c.name])), [taxonomy.data]);

  // Window virtualization: only the cards near the viewport are in the DOM.
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    const list = listRef.current;
    setScrollMargin(list?.offsetTop ?? 0);
    // The held-matches row above the list opens and closes: keep the list's offset right.
    const above = list?.parentElement;
    if (!list || !above) return;
    const ro = new ResizeObserver(() => setScrollMargin(list.offsetTop));
    ro.observe(above);
    return () => ro.disconnect();
  }, [lockedCount, filterCount, state.scope, feed.isPending, held?.count]);
  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => 200,
    overscan: 6,
    gap: 12,
    scrollMargin,
  });
  const virtualItems = virtualizer.getVirtualItems();

  // Infinite scroll: fetch the next page when the last few cards come into view.
  const lastIndex = virtualItems[virtualItems.length - 1]?.index ?? -1;
  useEffect(() => {
    if (lastIndex >= rows.length - 6 && feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage();
  }, [lastIndex, rows.length, feed]);

  const setScope = (scope: FeedScope) => {
    if (scope === state.scope) return;
    haptic.select();
    window.scrollTo({ top: 0 });
    update({ scope });
  };

  const activeChips: { key: string; label: string; clear: () => void }[] = [
    ...(state.similar ? [{ key: "similar", label: similarJob.data ? `Similar to: ${similarJob.data.title}` : "Similar jobs", clear: () => update({ similar: null }) }] : []),
    ...state.cities.map((id) => ({ key: `c:${id}`, label: cityName.get(id) ?? id, clear: () => update({ cities: state.cities.filter((x) => x !== id) }) })),
    ...state.types.map((id) => ({
      key: `t:${id}`,
      label: EMPLOYMENT_TYPES.find((t) => t.id === id)?.label ?? id,
      clear: () => update({ types: state.types.filter((x) => x !== id) }),
    })),
    ...state.employers.map((id) => ({ key: `e:${id}`, label: EMPLOYER_FILTER_LABEL[id], clear: () => update({ employers: state.employers.filter((x) => x !== id) }) })),
    ...(state.remote ? [{ key: "remote", label: "Remote", clear: () => update({ remote: false }) }] : []),
    ...(state.posted ? [{ key: "posted", label: POSTED_LABEL[state.posted], clear: () => update({ posted: null }) }] : []),
    ...(state.closing ? [{ key: "closing", label: "Closing soon", clear: () => update({ closing: false }) }] : []),
    ...(state.salary ? [{ key: "salary", label: "Shows salary", clear: () => update({ salary: false }) }] : []),
  ];

  return (
    <main className="mx-auto w-full max-w-lg pb-28">
      <div className="sticky top-0 z-10 border-b border-separator-subtle bg-bg/95 px-4 pb-3 pt-4 backdrop-blur">
        <div className="flex items-center justify-between px-1">
          <h1 className="text-[26px] font-bold tracking-tight">Jobs</h1>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl border border-separator bg-surface p-1">
          {(["for_you", "all", "saved"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              className={clsx(
                "inline-flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition-colors",
                state.scope === s ? "bg-ink text-white" : "text-hint",
              )}
            >
              {s === "saved" && <Bookmark className={clsx("size-3.5", state.scope === s && "fill-current")} />}
              {s === "for_you" ? "For you" : s === "all" ? "All jobs" : "Saved"}
            </button>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <label className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-hint-light" />
            <input
              type="search"
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="Search title, company or skill"
              enterKeyHint="search"
              className="h-11 w-full rounded-xl border border-separator bg-surface pl-9 pr-9 text-[15px] outline-none transition-colors placeholder:text-hint-light focus:border-ink"
            />
            {qInput && (
              <button type="button" aria-label="Clear search" onClick={() => setQInput("")} className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center text-hint">
                <X className="size-4" />
              </button>
            )}
          </label>
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            aria-label="Filters"
            className={clsx(
              "relative grid size-11 shrink-0 place-items-center rounded-xl border transition-colors",
              filterCount ? "border-ink bg-ink text-white" : "border-separator bg-surface text-text",
            )}
          >
            <SlidersHorizontal className="size-4" />
            {filterCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-accent text-[11px] font-bold text-white">{filterCount}</span>
            )}
          </button>
        </div>
        {activeChips.length > 0 && (
          <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
            {activeChips.map((c) => (
              <span key={c.key} className="shrink-0">
                <Chip onRemove={c.clear}>{c.label}</Chip>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="px-4 pt-4">
        {feed.isPending ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 5 }, (_, i) => (
              <JobCardSkeleton key={i} />
            ))}
          </div>
        ) : feed.isError ? (
          <div className="py-16 text-center">
            <p className="font-semibold">Couldn&apos;t load jobs</p>
            <p className="mt-1 text-sm text-hint">{feed.error.message}</p>
            <div className="mx-auto mt-4 max-w-xs">
              <Button onClick={() => void feed.refetch()}>Try again</Button>
            </div>
          </div>
        ) : items.length === 0 && !held && matching ? (
          <FindingMatches />
        ) : items.length === 0 && !held ? (
          <EmptyState
            scope={state.scope}
            filtered={filterCount > 0 || !!state.q}
            onClear={() => {
              setQInput("");
              update({ ...EMPTY_FILTERS, q: "" });
            }}
            onBrowse={() => setScope("all")}
          />
        ) : (
          <div className={clsx("transition-opacity", feed.isPlaceholderData && "opacity-60")}>
            {held && <HeldMatches count={held.count} items={held.items} dailyCap={me.limits.dailyJobCap ?? 5} onUpgrade={() => paywall.gate("daily_cap")} />}
            <div ref={listRef}>
            {matching && (
              <p className="mb-3 flex items-center justify-center gap-2 text-[13px] text-hint">
                <Spinner size="xs" />
                Finding more jobs that match you
              </p>
            )}
            <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
              {virtualItems.map((v) => {
                const row = rows[v.index]!;
                return (
                  <div
                    key={row.kind === "job" ? row.job.id : `day:${row.label}`}
                    data-index={v.index}
                    ref={virtualizer.measureElement}
                    className="absolute inset-x-0 top-0"
                    style={{ transform: `translateY(${v.start - virtualizer.options.scrollMargin}px)` }}
                  >
                    {row.kind === "job" ? <JobCard job={row.job} /> : <DayLabel label={row.label} first={v.index === 0} />}
                  </div>
                );
              })}
            </div>
            </div>
            <div className="py-6 text-center text-[13px] text-hint">
              {feed.isFetchingNextPage ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner />
                </span>
              ) : feed.hasNextPage ? null : items.length >= MAX_FEED_ITEMS ? (
                "That's the latest " + MAX_FEED_ITEMS + ". Search or filter to find more."
              ) : (
                "You're all caught up."
              )}
            </div>
          </div>
        )}
      </div>

      {filtersOpen && taxonomy.data && (
        <Portal>
        <FilterSheet
          value={state}
          cities={taxonomy.data.cities}
          onClose={() => setFiltersOpen(false)}
          onApply={(f) => {
            setFiltersOpen(false);
            window.scrollTo({ top: 0 });
            update(f);
          }}
        />
        </Portal>
      )}
    </main>
  );
}

type Row = { kind: "job"; job: JobCardDto } | { kind: "day"; label: string };

const EAT_MS = 3 * 3_600_000;
const eatDay = (iso: string) => Math.floor((new Date(iso).getTime() + EAT_MS) / 86_400_000);

/** "Today", "Yesterday", "Mon 24 Nov" (Addis Ababa days; the year only when it isn't this year). */
function dayLabel(day: number, today: number): string {
  if (day === today) return "Today";
  if (day === today - 1) return "Yesterday";
  const d = new Date(day * 86_400_000);
  const sameYear = d.getUTCFullYear() === new Date(today * 86_400_000).getUTCFullYear();
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }), timeZone: "UTC" });
}

/**
 * All jobs: a day label before the first job of each posting day. The top 5 are mixed (a few NGO and international
 * jobs moved up), so a day gets its label only once.
 */
function withDayLabels(items: JobCardDto[]): Row[] {
  const today = eatDay(new Date().toISOString());
  const days = items.map((j) => eatDay(j.firstSeenAt));
  const rows: Row[] = [];
  let current: number | null | undefined;
  items.forEach((job, i) => {
    const day = days[i] ?? today;
    if (day !== current) {
      // A day only gets one label, even if a pinned job sends the order back and forth.
      if (!rows.some((r) => r.kind === "day" && r.label === dayLabel(day, today))) rows.push({ kind: "day", label: dayLabel(day, today) });
      current = day;
    }
    rows.push({ kind: "job", job });
  });
  return rows;
}

function DayLabel({ label, first }: { label: string; first: boolean }) {
  return <p className={clsx("px-1 text-[13px] font-semibold text-hint", !first && "pt-3")}>{label}</p>;
}

/**
 * Today's matches over the free limit: one row instead of a wall of locked cards. Tapping it opens them all in a
 * sheet over the feed; closing it goes back to the feed.
 */
function HeldMatches({ count, items, dailyCap, onUpgrade }: { count: number; items: JobCardDto[]; dailyCap: number; onUpgrade: () => void }) {
  const [open, setOpen] = useState(false);
  const title = `${count} ${count === 1 ? "job" : "jobs"} waiting for you`;
  return (
    <section className="mb-4 rounded-2xl border border-separator bg-surface">
      <button
        type="button"
        onClick={() => {
          haptic.select();
          setOpen(true);
        }}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-separator-subtle bg-bg text-accent-strong">
          <Clock className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold">{title}</span>
          <span className="block text-[13px] text-hint">You&apos;ve seen your {dailyCap} free jobs today. <span className="font-semibold text-text">Subscribe to see {count === 1 ? "it" : "them"} now</span>, or wait until tomorrow.</span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-hint" />
      </button>
      <div className="px-4 pb-4">
        <Button variant="accent" onClick={onUpgrade}>
          See them now
        </Button>
      </div>
      {open && (
        <Sheet
          title={title}
          onClose={() => setOpen(false)}
          footer={
            <Button
              variant="accent"
              onClick={() => {
                setOpen(false);
                onUpgrade();
              }}
            >
              Subscribe to see them now
            </Button>
          }
        >
          <p className="mb-3 text-[14px] text-hint">You&apos;ve seen your {dailyCap} free jobs today. <span className="font-semibold text-text">Subscribe to see {count === 1 ? "it" : "them"} now</span>, or wait until tomorrow.</p>
          <div className="flex flex-col gap-3 pb-2">
            {items.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        </Sheet>
      )}
    </section>
  );
}

/** While the first matches are being found: a calm loading state instead of "No matches yet". */
function FindingMatches() {
  return (
    <div>
      <div className="flex flex-col items-center py-6 text-center">
        <Spinner />
        <p className="mt-3 font-semibold">Finding jobs that match you</p>
        <p className="mx-auto mt-1 max-w-xs text-sm text-hint">This takes a few seconds. They&apos;ll show here and in your chat with the bot.</p>
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }, (_, i) => (
          <JobCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

function EmptyState({ scope, filtered, onClear, onBrowse }: { scope: FeedScope; filtered: boolean; onClear: () => void; onBrowse: () => void }) {
  if (filtered) {
    return (
      <div className="py-16 text-center">
        <p className="font-semibold">No jobs match these filters</p>
        <p className="mt-1 text-sm text-hint">Try fewer filters or another word.</p>
        <div className="mx-auto mt-4 max-w-xs">
          <Button variant="secondary" onClick={onClear}>
            Clear search and filters
          </Button>
        </div>
      </div>
    );
  }
  if (scope === "saved") {
    return (
      <div className="py-16 text-center">
        <span className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl border border-accent-border/60 bg-accent-soft text-accent-strong">
          <Bookmark className="size-5" />
        </span>
        <p className="font-semibold">No saved jobs yet</p>
        <p className="mx-auto mt-1 max-w-xs text-sm text-hint">Tap Save on any job to keep it here for later, even after it closes.</p>
        <div className="mx-auto mt-4 max-w-xs">
          <Button variant="secondary" onClick={onBrowse}>
            Browse all jobs
          </Button>
        </div>
      </div>
    );
  }
  if (scope === "for_you") {
    return (
      <div className="py-16 text-center">
        <p className="font-semibold">No matches yet</p>
        <p className="mx-auto mt-1 max-w-xs text-sm text-hint">Jobs that fit your preferences show up here as soon as they&apos;re posted.</p>
        <div className="mx-auto mt-4 flex max-w-xs flex-col gap-2">
          <Button onClick={onBrowse}>Browse all jobs</Button>
          <Link href="/app/preferences" className="text-sm font-semibold text-accent-strong">
            Edit preferences
          </Link>
        </div>
      </div>
    );
  }
  return (
    <div className="py-16 text-center">
      <p className="font-semibold">No open jobs right now</p>
      <p className="mt-1 text-sm text-hint">New jobs are added around the clock.</p>
    </div>
  );
}
