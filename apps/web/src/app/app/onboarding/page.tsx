"use client";

import { ArrowRight, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ScreenSkeleton } from "@/components/skeletons";
import type { Preferences } from "@ethio/shared";
import { useSavePreferences, useTaxonomy } from "@/components/miniapp/hooks";
import { useSession } from "@/components/miniapp/session";
import { Portal } from "@/components/Portal";
import { PreferenceSections } from "@/components/preferences/PreferenceSections";
import { EMPTY_PREFERENCES } from "@/components/preferences/state";
import { Button, CenteredMessage, ErrorText, IconTile, PageHeader, Screen, StickyFooter } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { haptic } from "@/lib/telegram";

/**
 * First run: one step, the kinds of jobs they want. Everything else (degree, experience, city,
 * salary) is optional and lives in Profile → Matching on.
 */
export default function OnboardingPage() {
  const router = useRouter();
  const { me } = useSession();
  const taxonomy = useTaxonomy();
  const save = useSavePreferences();
  const [prefs, setPrefs] = useState<Preferences>(EMPTY_PREFERENCES);
  const [done, setDone] = useState(false);

  // Already set up (e.g. reopened an old link): go to the editor instead.
  useEffect(() => {
    if (me.onboarded && !done) router.replace("/app/preferences");
  }, [me.onboarded, done, router]);

  if (taxonomy.isPending) return <ScreenSkeleton variant="form" />;
  if (taxonomy.isError) {
    return (
      <CenteredMessage title="Couldn't load" body={taxonomy.error.message}>
        <Button onClick={() => void taxonomy.refetch()}>Try again</Button>
      </CenteredMessage>
    );
  }

  const picked = prefs.professionIds.length + prefs.functionIds.length;
  const finish = () =>
    save.mutate(prefs, {
      onSuccess: () => {
        haptic.success();
        setDone(true);
      },
      onError: () => haptic.error(),
    });

  return (
    <Screen>
      <PageHeader eyebrow="Welcome" title="What kind of jobs do you want?" />

      <PreferenceSections
        group="work"
        bare
        value={prefs}
        onChange={(patch) => setPrefs((p) => ({ ...p, ...patch }))}
        taxonomy={taxonomy.data}
        limits={me.limits}
      />

      {!done && (
        <StickyFooter>
          {save.error && (
            <ErrorText>
              {save.error instanceof ApiError && save.error.issues.length ? save.error.issues.map((i) => i.message).join(". ") : save.error.message}
            </ErrorText>
          )}
          <Button onClick={finish} disabled={picked === 0} loading={save.isPending}>
            {picked === 0 ? "Pick at least one" : "Start getting jobs"}
          </Button>
        </StickyFooter>
      )}

      {done && <AllSet onContinue={() => router.replace("/app/jobs")} />}
    </Screen>
  );
}

function AllSet({ onContinue }: { onContinue: () => void }) {
  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center px-6" role="dialog" aria-modal="true" aria-labelledby="all-set-title">
        <div className="absolute inset-0 bg-black/40 animate-[fade-in_0.2s_ease-out]" />
        <div className="relative w-full max-w-sm rounded-3xl bg-surface p-6 text-center shadow-[0_20px_60px_-20px_rgba(15,17,21,0.4)] animate-[sheet-up_0.24s_ease-out]">
          <div className="flex justify-center">
            <IconTile tone="emerald">
              <CheckCircle2 className="size-5" />
            </IconTile>
          </div>
          <h2 id="all-set-title" className="mt-4 text-[22px] font-bold leading-tight tracking-tight">
            You&apos;re all set
          </h2>
          <p className="mt-2 text-[15px] text-hint">
            We&apos;ll message you the moment a matching job is posted. Add more details anytime in Profile → Matching on.
          </p>
          <div className="mt-6">
            <Button onClick={onContinue}>
              Continue to jobs
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
