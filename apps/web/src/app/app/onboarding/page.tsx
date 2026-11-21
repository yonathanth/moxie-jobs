"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ScreenSkeleton } from "@/components/skeletons";
import type { Preferences } from "@ethio/shared";
import { useBackButton, useSavePreferences, useTaxonomy } from "@/components/miniapp/hooks";
import { useSession } from "@/components/miniapp/session";
import { PreferenceSections, type SectionGroup } from "@/components/preferences/PreferenceSections";
import { EMPTY_PREFERENCES, hasTarget, salaryInvalid } from "@/components/preferences/state";
import { Button, CenteredMessage, ErrorText, PageHeader, Screen, StickyFooter } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { getWebApp, haptic } from "@/lib/telegram";

const STEPS: { group: SectionGroup; title: string; subtitle: string }[] = [
  { group: "work", title: "What do you do?", subtitle: "We'll send you jobs that match." },
  { group: "background", title: "Your background", subtitle: "Helps us skip jobs you don't qualify for." },
  { group: "where", title: "Where and how", subtitle: "Almost done." },
];

export default function OnboardingPage() {
  const router = useRouter();
  const { me } = useSession();
  const taxonomy = useTaxonomy();
  const save = useSavePreferences();
  const [step, setStep] = useState(0);
  const [prefs, setPrefs] = useState<Preferences>(EMPTY_PREFERENCES);
  const [done, setDone] = useState(false);

  // Already set up (e.g. reopened an old link): go to the editor instead.
  useEffect(() => {
    if (me.onboarded && !done) router.replace("/app/preferences");
  }, [me.onboarded, done, router]);

  useBackButton(step > 0 && !done ? () => setStep((s) => s - 1) : null);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);

  if (taxonomy.isPending) {
    return (
      <ScreenSkeleton variant="form" />
    );
  }
  if (taxonomy.isError) {
    return (
      <CenteredMessage title="Couldn't load" body={taxonomy.error.message}>
        <Button onClick={() => void taxonomy.refetch()}>Try again</Button>
      </CenteredMessage>
    );
  }

  if (done) {
    return (
      <CenteredMessage
        title="You're all set"
        body="We'll message you in the chat as soon as a matching job is posted. You can change your preferences anytime."
      >
        <div className="flex flex-col gap-2">
          <Button onClick={() => router.replace("/app/jobs")}>Go to my jobs</Button>
          {getWebApp() && (
            <Button variant="secondary" onClick={() => getWebApp()?.close()}>
              Close
            </Button>
          )}
        </div>
      </CenteredMessage>
    );
  }

  const current = STEPS[step];
  const last = step === STEPS.length - 1;
  const workPicked = prefs.professionIds.length + prefs.functionIds.length > 0;
  const canContinue = step === 0 ? true : hasTarget(prefs) && !salaryInvalid(prefs);

  const next = () => {
    if (!last) {
      haptic.select();
      setStep(step + 1);
      return;
    }
    save.mutate(prefs, {
      onSuccess: () => {
        haptic.success();
        setDone(true);
      },
      onError: () => haptic.error(),
    });
  };

  return (
    <Screen>
      <div className="flex gap-1.5 px-1" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
        {STEPS.map((s, i) => (
          <span key={s.group} className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? "bg-accent" : "bg-pill"}`} />
        ))}
      </div>
      <div className="mt-5">
        <PageHeader eyebrow={`Step ${step + 1} of ${STEPS.length}`} title={current.title} subtitle={current.subtitle} />
      </div>

      <PreferenceSections
        group={current.group}
        value={prefs}
        onChange={(patch) => setPrefs((p) => ({ ...p, ...patch }))}
        taxonomy={taxonomy.data}
        limits={me.limits}
      />

      <StickyFooter>
        {save.error && (
          <ErrorText>
            {save.error instanceof ApiError && save.error.issues.length
              ? save.error.issues.map((i) => i.message).join(". ")
              : save.error.message}
          </ErrorText>
        )}
        {step === 1 && !hasTarget(prefs) && (
          <p className="text-center text-xs text-hint">Add your degree, or go back and choose a profession.</p>
        )}
        <Button onClick={next} disabled={!canContinue || save.isPending}>
          {save.isPending ? "Saving…" : last ? "Start getting jobs" : step === 0 && !workPicked ? "Skip, match me by degree" : "Continue"}
        </Button>
      </StickyFooter>
    </Screen>
  );
}
