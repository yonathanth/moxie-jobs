"use client";

import { Briefcase, ChevronRight, Crown, Lock, Settings2, ShieldCheck, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { ScreenSkeleton } from "@/components/skeletons";
import { EXPERIENCE_BANDS, PLAN_NAME, type MeDto, type PreferencesDto, type TaxonomyDto } from "@ethio/shared";
import { BottomNav } from "@/components/BottomNav";
import { usePreferences, useRefreshMe, useSetAlertsPaused, useTaxonomy } from "@/components/miniapp/hooks";
import { useSession } from "@/components/miniapp/session";
import { Badge, Card, IconTile, PageHeader, Screen, Section, Toggle } from "@/components/ui";
import { formatDate } from "@/lib/plans";

/** Mini App home: plan, today's alerts, locked premium matches, what we match on. */
export default function MiniAppHome() {
  const router = useRouter();
  const { me } = useSession();
  const taxonomy = useTaxonomy();
  const prefs = usePreferences();
  const alerts = useSetAlertsPaused();
  const refresh = useRefreshMe();

  useEffect(() => {
    if (!me.onboarded) router.replace("/app/onboarding");
  }, [me.onboarded, router]);

  // Fresh counts each time the app is opened.
  useEffect(() => {
    refresh.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!me.onboarded || taxonomy.isPending || prefs.isPending) {
    return (
      <ScreenSkeleton variant="profile" />
    );
  }

  return (
    <Screen className="animate-fade-up">
      <PageHeader
        eyebrow={`Selam${me.firstName ? `, ${me.firstName}` : ""}`}
        title="Profile"
        aside={<PlanBadge me={me} />}
      />

      <TodayCard me={me} />
      {!me.limits.premiumJobs && me.stats.lockedThisWeek > 0 && <LockedCard count={me.stats.lockedThisWeek} />}

      <Section title="Alerts">
        <Toggle
          label="Send me job alerts"
          description={me.alertsPaused ? "Paused. You won't get new jobs until you turn this on." : "Instantly, the moment a matching job is posted"}
          checked={!me.alertsPaused}
          onChange={(on) => alerts.mutate(!on)}
        />
      </Section>

      {taxonomy.data && prefs.data && <PreferencesSummary prefs={prefs.data} taxonomy={taxonomy.data} />}

      <PlanCard me={me} />
      {me.isAdmin && (
        <Link
          href="/app/admin"
          className="mt-5 flex items-center justify-between rounded-2xl border border-dashed border-neutral-300 px-4 py-3 text-[14px] font-semibold text-hint transition-colors hover:text-text"
        >
          <span className="inline-flex items-center gap-2">
            <ShieldCheck className="size-4" />
            Admin
          </span>
          <ChevronRight className="size-4" />
        </Link>
      )}
      <BottomNav />
    </Screen>
  );
}

function PlanBadge({ me }: { me: MeDto }) {
  if (me.beta && me.plan === "free") return <Badge tone="accent">Beta · Pro</Badge>;
  if (me.effectivePlan === "free") return <Badge>Free</Badge>;
  return (
    <Badge tone="ink">
      <Crown className="size-3" />
      {PLAN_NAME[me.effectivePlan]}
    </Badge>
  );
}

function TodayCard({ me }: { me: MeDto }) {
  const cap = me.limits.dailyJobCap;
  const used = Math.min(me.stats.sentToday, cap ?? Infinity);
  return (
    <Card className="mt-5">
      <div className="flex items-center gap-3">
        <IconTile tone="sky">
          <Briefcase className="size-5" />
        </IconTile>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold">
            {me.stats.sentToday === 0 ? "No new jobs yet today" : `${me.stats.sentToday} ${me.stats.sentToday === 1 ? "job" : "jobs"} sent today`}
          </p>
          <p className="text-[13px] text-hint">
            {me.stats.sentThisWeek} this week · they arrive in the chat
          </p>
        </div>
      </div>
      <Link
        href="/app/jobs"
        className="mt-4 inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-ink text-[15px] font-semibold text-white transition-colors hover:bg-ink-hover"
      >
        Open my job feed
        <ChevronRight className="size-4" />
      </Link>
      {cap !== null && (
        <div className="mt-4">
          <div className="flex justify-between text-xs font-medium text-hint">
            <span>Today&apos;s alerts</span>
            <span>
              {used}/{cap}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-pill">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(used / cap) * 100}%` }} />
          </div>
          {used >= cap && (
            <p className="mt-2 text-[13px] text-hint">
              You&apos;ve reached today&apos;s limit.{" "}
              <Link href="/app/plans" className="font-semibold text-accent-strong">
                Go unlimited
              </Link>
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

function LockedCard({ count }: { count: number }) {
  return (
    <Link href="/app/plans" className="mt-3 block">
      <Card className="flex items-center gap-3 border-accent-border bg-[linear-gradient(120deg,var(--accent-soft)_0%,#fffaf6_60%,#ffffff_100%)]">
        <IconTile>
          <Lock className="size-5" />
        </IconTile>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold">
            {count} premium {count === 1 ? "job" : "jobs"} matched you this week
          </p>
          <p className="text-[13px] text-hint">NGO, international & overseas jobs come with Pro</p>
        </div>
        <ChevronRight className="size-5 text-accent-strong" />
      </Card>
    </Link>
  );
}

function PlanCard({ me }: { me: MeDto }) {
  const paid = me.plan !== "free";
  return (
    <Section title="Plan">
      <div className="flex items-center gap-3">
        <IconTile tone={paid ? "violet" : "neutral"}>{paid ? <Crown className="size-5" /> : <Zap className="size-5" />}</IconTile>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold">{paid ? PLAN_NAME[me.plan] : me.beta ? "Pro (free during the beta)" : "Free"}</p>
          <p className="text-[13px] text-hint">
            {paid && me.planExpiresAt
              ? `Active until ${formatDate(me.planExpiresAt)}`
              : me.beta
                ? "Enjoy every feature while we're in beta"
                : "See what Pro and Career add"}
          </p>
        </div>
      </div>
      <Link
        href="/app/plans"
        className="mt-4 inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-separator text-[15px] font-semibold transition-colors hover:bg-neutral-50"
      >
        {paid ? "Manage plan" : "See plans"}
        <ChevronRight className="size-4" />
      </Link>
    </Section>
  );
}

function PreferencesSummary({ prefs, taxonomy }: { prefs: PreferencesDto; taxonomy: TaxonomyDto }) {
  const lines = useMemo(() => {
    const professions = new Map(taxonomy.functions.flatMap((f) => f.professions).map((p) => [p.id, p.name]));
    const functions = new Map(taxonomy.functions.map((f) => [f.id, f.name]));
    const fields = new Map(taxonomy.fieldsOfStudy.map((f) => [f.id, f.name]));
    const cities = new Map(taxonomy.cities.map((c) => [c.id, c.name]));
    const work = [
      ...prefs.professionIds.map((id) => professions.get(id) ?? id),
      ...prefs.functionIds.map((id) => `Any ${functions.get(id) ?? id} job`),
    ];
    return [
      { label: "Jobs", value: work.join(", ") || "Matched by degree" },
      { label: "Degree", value: prefs.fieldOfStudyIds.map((id) => fields.get(id) ?? id).join(", ") || "—" },
      { label: "Experience", value: EXPERIENCE_BANDS.find((b) => b.id === prefs.experienceBand)?.label ?? "—" },
      {
        label: "Where",
        value:
          (prefs.locationIds.length ? prefs.locationIds.map((id) => cities.get(id) ?? id).join(", ") : "Anywhere in Ethiopia") +
          (prefs.remoteOk ? " · remote OK" : ""),
      },
    ];
  }, [prefs, taxonomy]);

  return (
    <Section
      title="Matching on"
      aside={
        <Link href="/app/preferences" className="inline-flex items-center gap-1 font-semibold text-accent-strong">
          <Settings2 className="size-3.5" />
          Edit
        </Link>
      }
    >
      <dl className="flex flex-col divide-y divide-separator-subtle">
        {lines.map((l) => (
          <div key={l.label} className="flex gap-3 py-2.5 first:pt-0 last:pb-0">
            <dt className="w-24 shrink-0 text-[13px] text-hint">{l.label}</dt>
            <dd className="min-w-0 flex-1 text-[14px] font-medium">{l.value}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}
