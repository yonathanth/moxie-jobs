"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ScreenSkeleton } from "@/components/skeletons";
import type { Preferences, TaxonomyDto } from "@ethio/shared";
import { useBackButton, usePreferences, useSavePreferences, useTaxonomy } from "@/components/miniapp/hooks";
import { useSession } from "@/components/miniapp/session";
import { PreferenceSections } from "@/components/preferences/PreferenceSections";
import { fromDto, hasTarget, overLimits, salaryInvalid, trimToLimits } from "@/components/preferences/state";
import { Button, Card, CenteredMessage, ErrorText, PageHeader, Screen, StickyFooter } from "@/components/ui";
import { ChevronRight, Crown } from "lucide-react";
import type { PlanLimits } from "@ethio/shared";
import { usePaywall, type PaywallReason } from "@/components/paywall";
import { ApiError } from "@/lib/api";
import { haptic } from "@/lib/telegram";

export default function PreferencesPage() {
  const router = useRouter();
  const { me } = useSession();
  const taxonomy = useTaxonomy();
  const saved = usePreferences();

  useEffect(() => {
    if (!me.onboarded) router.replace("/app/onboarding");
  }, [me.onboarded, router]);

  useBackButton(() => router.push("/app"));

  if (taxonomy.isPending || saved.isPending) {
    return (
      <ScreenSkeleton variant="form" />
    );
  }
  const error = taxonomy.error ?? saved.error;
  if (error) {
    return (
      <CenteredMessage title="Couldn't load your preferences" body={error.message}>
        <Button onClick={() => void Promise.all([taxonomy.refetch(), saved.refetch()])}>Try again</Button>
      </CenteredMessage>
    );
  }

  // Keyed so the form re-initialises if the saved preferences change underneath it.
  return <Editor key={saved.data?.updatedAt ?? "new"} initial={fromDto(saved.data)} taxonomy={taxonomy.data!} />;
}

function Editor({ initial, taxonomy }: { initial: Preferences; taxonomy: TaxonomyDto }) {
  const { me } = useSession();
  const save = useSavePreferences();
  const [prefs, setPrefs] = useState(initial);
  const [justSaved, setJustSaved] = useState(false);
  const dirty = JSON.stringify(prefs) !== JSON.stringify(initial);
  const over = overLimits(prefs, me.limits);
  const paywall = usePaywall();

  const onChange = (patch: Partial<Preferences>) => {
    setJustSaved(false);
    setPrefs((p) => ({ ...p, ...patch }));
  };

  const submit = () =>
    save.mutate(prefs, {
      onSuccess: () => {
        haptic.success();
        setJustSaved(true);
      },
      onError: () => haptic.error(),
    });

  return (
    <Screen>
      <PageHeader title="Job preferences" subtitle="We match every new job against these." />
      {me.effectivePlan === "free" && (
        <button type="button" onClick={() => paywall.gate("daily_cap")} className="mt-4 block w-full text-left">
          <Card className="flex items-center gap-3 border-accent-border bg-accent-soft/50 py-3">
            <Crown className="size-4 shrink-0 text-accent-strong" />
            <p className="flex-1 text-[13px] text-accent-strong">
              <span className="font-semibold">Free plan:</span> {me.limits.dailyJobCap ?? "unlimited"} alerts a day, local jobs only. Pro adds unlimited alerts and NGO &amp;
              international jobs.
            </p>
            <ChevronRight className="size-4 text-accent-strong" />
          </Card>
        </button>
      )}

      {over.length > 0 && (
        <Card className="mt-4 border-accent-border bg-accent-soft/50">
          <p className="text-[14px] font-semibold text-text">Some picks aren&apos;t active on your plan</p>
          <p className="mt-1 text-[13px] text-hint">
            Your plan includes {over.map((o) => `${o.max} ${o.label}`).join(", ")}. We match on the first ones; the rest are marked inactive below.
          </p>
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" className="h-10 w-auto flex-1 text-sm" onClick={() => onChange(trimToLimits(prefs, me.limits))}>
              Keep the active ones
            </Button>
            <Button variant="accent" className="h-10 w-auto flex-1 text-sm" onClick={() => paywall.gate(overReason(prefs, me.limits))}>
              Upgrade
            </Button>
          </div>
        </Card>
      )}

      <PreferenceSections group="work" value={prefs} onChange={onChange} taxonomy={taxonomy} limits={me.limits} />
      <PreferenceSections group="background" value={prefs} onChange={onChange} taxonomy={taxonomy} limits={me.limits} />
      <PreferenceSections group="where" value={prefs} onChange={onChange} taxonomy={taxonomy} limits={me.limits} />

      <StickyFooter>
        {save.error && (
          <ErrorText>
            {save.error instanceof ApiError && save.error.issues.length
              ? save.error.issues.map((i) => i.message).join(". ")
              : save.error.message}
          </ErrorText>
        )}
        {!hasTarget(prefs) && (
          <p className="text-center text-xs text-hint">Pick at least one profession, category or field of study.</p>
        )}
        {over.length > 0 && <p className="text-center text-xs text-hint">Remove the inactive picks, or keep the active ones, to save.</p>}
        <Button onClick={submit} disabled={!dirty || !hasTarget(prefs) || salaryInvalid(prefs) || over.length > 0 || save.isPending}>
          {save.isPending ? "Saving…" : justSaved && !dirty ? "Saved ✓" : "Save changes"}
        </Button>
      </StickyFooter>
    </Screen>
  );
}

/** The paywall that lifts the first list over this plan's limit. */
function overReason(p: Preferences, l: PlanLimits): PaywallReason {
  if (p.professionIds.length > l.maxProfessions) return "professions";
  if (p.functionIds.length > l.maxFunctions) return "categories";
  if (p.fieldOfStudyIds.length > l.maxFieldsOfStudy) return "fields";
  return "locations";
}
