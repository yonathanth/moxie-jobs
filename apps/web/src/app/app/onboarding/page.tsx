"use client";

import { ArrowRight, CheckCircle2, ChevronRight, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ScreenSkeleton } from "@/components/skeletons";
import type { Preferences } from "@ethio/shared";
import { useSavePreferences, useTaxonomy } from "@/components/miniapp/hooks";
import { useSession } from "@/components/miniapp/session";
import { PreferenceSections } from "@/components/preferences/PreferenceSections";
import { EMPTY_PREFERENCES } from "@/components/preferences/state";
import { Button, Card, CenteredMessage, ErrorText, IconTile, PageHeader, Screen, StickyFooter } from "@/components/ui";
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

  if (done) {
    return (
      <Screen className="animate-fade-up">
        <div className="flex flex-col items-center pt-10 text-center">
          <IconTile tone="emerald">
            <CheckCircle2 className="size-5" />
          </IconTile>
          <h1 className="mt-4 text-[24px] font-bold leading-tight tracking-tight">You&apos;re all set</h1>
          <p className="mx-auto mt-2 max-w-xs text-[15px] text-hint">We&apos;ll message you in the chat the moment a matching job is posted.</p>
        </div>
        <Card className="mt-8 flex items-start gap-3">
          <IconTile tone="sky" size="sm">
            <SlidersHorizontal />
          </IconTile>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold">Want sharper matches?</p>
            <p className="mt-0.5 text-[13px] text-hint">
              Add your degree, experience, city or salary anytime in <span className="font-medium text-text">Profile → Matching on</span>.
            </p>
            <Link href="/app/preferences" className="mt-2 inline-flex items-center gap-0.5 text-[13px] font-semibold text-accent-strong">
              Set them now
              <ChevronRight className="size-3.5" />
            </Link>
          </div>
        </Card>
        <StickyFooter>
          <Button onClick={() => router.replace("/app/jobs")}>
            Continue to my jobs
            <ArrowRight className="size-4" />
          </Button>
        </StickyFooter>
      </Screen>
    );
  }

  const picked = prefs.professionIds.length + prefs.functionIds.length;
  const finish = () =>
    save.mutate(prefs, {
      onSuccess: () => {
        haptic.success();
        setDone(true);
        window.scrollTo({ top: 0 });
      },
      onError: () => haptic.error(),
    });

  return (
    <Screen>
      <PageHeader eyebrow="Welcome" title="What kind of jobs do you want?" subtitle="Pick one or more categories. You can narrow them down or change them later." />

      <PreferenceSections
        group="work"
        value={prefs}
        onChange={(patch) => setPrefs((p) => ({ ...p, ...patch }))}
        taxonomy={taxonomy.data}
        limits={me.limits}
      />

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
    </Screen>
  );
}
