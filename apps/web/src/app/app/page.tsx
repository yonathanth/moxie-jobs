"use client";

import { ArrowRight, Briefcase, ChevronRight, Crown, Lock, PencilLine, Settings2, ShieldCheck, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ScreenSkeleton } from "@/components/skeletons";
import { usePaywall } from "@/components/paywall";
import { EXPERIENCE_BANDS, PLAN_NAME, type MeDto, type PreferencesDto, type TaxonomyDto } from "@ethio/shared";
import { usePreferences, useRefreshMe, useSetAlertsPaused, useTaxonomy } from "@/components/miniapp/hooks";
import { useSession } from "@/components/miniapp/session";
import { Badge, Button, Card, cx, IconTile, PageHeader, Screen, Section, Sheet, Toast, Toggle, useToast } from "@/components/ui";
import { haptic } from "@/lib/telegram";
import { ContactForm } from "@/components/cv/ContactForm";
import { ShareAppCard } from "@/components/ShareAppCard";
import { categoryLabel } from "@/components/preferences/ProfessionPicker";
import { formatDate } from "@/lib/plans";

/** Mini App home: plan, today's alerts, locked premium matches, what we match on. */
export default function MiniAppHome() {
  const router = useRouter();
  const { me } = useSession();
  const taxonomy = useTaxonomy();
  const prefs = usePreferences();
  const alerts = useSetAlertsPaused();
  const refresh = useRefreshMe();
  const paywall = usePaywall();
  const [confirmAlerts, setConfirmAlerts] = useState<"on" | "off" | null>(null);
  const [toast, showToast] = useToast();

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

      {taxonomy.data && prefs.data && <PreferencesSummary prefs={prefs.data} taxonomy={taxonomy.data} />}

      <CvDetails me={me} />
      <PlanCard me={me} />
      <ShareAppCard />

      <Section title="Alerts">
        <Toggle
          label="Send me job alerts"
          description={me.alertsPaused ? "Paused. You won't get new jobs until you turn this on." : "Instantly, the moment a matching job is posted"}
          checked={!me.alertsPaused}
          onChange={(on) => setConfirmAlerts(on ? "on" : "off")}
        />
      </Section>
      {confirmAlerts && (
        <ConfirmAlerts
          turningOn={confirmAlerts === "on"}
          busy={alerts.isPending}
          onCancel={() => setConfirmAlerts(null)}
          onConfirm={() =>
            alerts.mutate(confirmAlerts === "off", {
              onSuccess: (m) => {
                haptic.success();
                setConfirmAlerts(null);
                showToast(m.alertsPaused ? "Alerts paused" : "Alerts are on");
              },
              onError: () => {
                haptic.error();
                showToast("Couldn't change alerts. Try again.", "error");
              },
            })
          }
        />
      )}
      <Toast message={toast.message} tone={toast.tone} />
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

/** Today's alerts as one tappable card that opens the feed. */
/**
 * Today's alerts. On the free plan it nudges by where they are in the day: a
 * quiet "Go unlimited" link, then "2 left today" near the limit, then the card
 * itself becomes the upgrade prompt once the limit is reached. Paid: "Unlimited".
 */
function TodayCard({ me }: { me: MeDto }) {
  const paywall = usePaywall();
  const cap = me.limits.dailyJobCap;
  const n = me.stats.sentToday;
  const used = Math.min(n, cap ?? Infinity);
  const left = cap === null ? null : Math.max(0, cap - used);
  const reached = left === 0;
  const near = left !== null && !reached && left <= 2;
  const upgrade = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    paywall.gate("daily_cap", { then: "/app/jobs?scope=for_you" });
  };
  const waiting = me.stats.waitingToday;

  return (
    <Link href="/app/jobs" className="group mt-5 block">
      <Card className={cx("transition-colors group-active:bg-neutral-50", reached && "border-accent-border bg-[linear-gradient(120deg,var(--accent-soft)_0%,#ffffff_75%)]")}>
        <div className="flex items-center gap-3">
          <IconTile tone={reached ? "accent" : "sky"}>{reached ? <Lock className="size-5" /> : <Briefcase className="size-5" />}</IconTile>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold">
              {reached ? "Today's limit reached" : n === 0 ? "No new jobs yet today" : `${n} new ${n === 1 ? "job" : "jobs"} for you today`}
            </p>
            <p className="text-[13px] text-hint">
              {reached
                ? waiting > 0
                  ? `${waiting} more ${waiting === 1 ? "job is" : "jobs are"} waiting in your feed`
                  : "New matches wait in your feed until tomorrow"
                : `${me.stats.sentThisWeek} this week · open your feed`}
            </p>
          </div>
          {reached ? (
            <button type="button" onClick={upgrade} className="shrink-0 rounded-full bg-accent px-3.5 py-2 text-[13px] font-semibold text-white shadow-[0_8px_18px_-10px_rgba(255,94,31,0.8)]">
              Upgrade
            </button>
          ) : (
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ink text-white transition-transform group-hover:translate-x-0.5">
              <ArrowRight className="size-4" />
            </span>
          )}
        </div>
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs font-medium text-hint">
            <span>{near ? `${left} ${left === 1 ? "alert" : "alerts"} left today` : "Today's alerts"}</span>
            {cap === null ? (
              <span className="text-emerald">Unlimited</span>
            ) : (
              <span className="flex items-center gap-2">
                {!reached && (
                  <button type="button" onClick={upgrade} className="font-semibold text-accent-strong">
                    Go unlimited
                  </button>
                )}
                <span>
                  {used}/{cap}
                </span>
              </span>
            )}
          </div>
          {cap !== null && (
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-pill">
              <div className={cx("h-full rounded-full transition-all", reached || near ? "bg-accent" : "bg-sky-500")} style={{ width: `${(used / cap) * 100}%` }} />
            </div>
          )}
        </div>
      </Card>
    </Link>
  );
}

/** Personal details printed on every CV (asked once in the CV flow). */
function CvDetails({ me }: { me: MeDto }) {
  const [editing, setEditing] = useState(false);
  const c = me.cvContact;
  const rows = c
    ? [
        ["Name", c.name],
        ["Phone", c.phone],
        ["Email", c.email],
        ["City", c.location],
      ]
    : [];
  return (
    <>
      <Section
        title="CV details"
        aside={
          <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1 font-semibold text-accent-strong">
            <PencilLine className="size-3.5" />
            {c ? "Edit" : "Add"}
          </button>
        }
      >
        {c ? (
          <dl className="flex flex-col divide-y divide-separator-subtle">
            {rows.map(([label, value]) => (
              <div key={label} className="flex gap-3 py-2.5 first:pt-0 last:pb-0">
                <dt className="w-24 shrink-0 text-[13px] text-hint">{label}</dt>
                <dd className={value ? "min-w-0 flex-1 truncate text-[14px] font-medium" : "min-w-0 flex-1 text-[14px] text-hint-light"}>{value ?? "Not added"}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <button type="button" onClick={() => setEditing(true)} className="w-full text-left text-[14px] text-hint">
            Your name, phone and email for the top of your CVs. Add them once; every CV uses them.
          </button>
        )}
      </Section>
      {editing && (
        <Sheet title="CV details" onClose={() => setEditing(false)}>
          <p className="mb-4 text-[13px] text-hint">Printed at the top of every new CV.</p>
          <ContactForm submitLabel="Save" onSaved={() => setEditing(false)} />
        </Sheet>
      )}
    </>
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
      ...prefs.functionIds.map((id) => {
        const fn = taxonomy.functions.find((f) => f.id === id);
        return categoryLabel(fn?.name ?? id, fn?.professions.map((p) => p.id) ?? [], prefs.excludedProfessionIds ?? []);
      }),
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

/** Asks before pausing or resuming job alerts. */
function ConfirmAlerts({ turningOn, busy, onCancel, onConfirm }: { turningOn: boolean; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Sheet title={turningOn ? "Turn alerts back on?" : "Pause job alerts?"} onClose={onCancel}>
      <div>
        <p className="text-[15px] text-hint">
          {turningOn
            ? "We'll message you the moment a matching job is posted again."
            : "You won't get new matching jobs in Telegram until you turn them back on. Jobs posted meanwhile stay in your feed."}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Button variant="primary" loading={busy} onClick={onConfirm}>
            {turningOn ? "Turn on alerts" : "Pause alerts"}
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
