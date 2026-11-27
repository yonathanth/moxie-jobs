"use client";

import { useEffect, useState } from "react";
import { RowsSkeleton } from "@/components/skeletons";
import type { AdminSettingsDto } from "@ethio/shared";
import { AdminShell } from "@/components/admin/AdminShell";
import { useAdminSettings, useSaveSettings } from "@/components/admin/hooks";
import { Button, Chip, ChipGroup, ErrorText, Section, StickyFooter, Toggle } from "@/components/ui";
import { haptic } from "@/lib/telegram";

type Draft = Pick<AdminSettingsDto, "betaAllPro" | "unpaidJobs" | "delivery">;

export default function SettingsAdminPage() {
  const settings = useAdminSettings();
  const save = useSaveSettings();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings.data && !draft) setDraft({ betaAllPro: settings.data.betaAllPro, unpaidJobs: settings.data.unpaidJobs, delivery: settings.data.delivery });
  }, [settings.data, draft]);

  if (!draft) {
    return (
      <AdminShell title="Settings">
        <div className="grid place-items-center py-16">{settings.isError ? <p className="text-sm text-danger">{settings.error.message}</p> : <div className="w-full"><RowsSkeleton count={4} /></div>}</div>
      </AdminShell>
    );
  }

  const set = (patch: Partial<Draft>) => {
    setSaved(false);
    setDraft((d) => d && { ...d, ...patch });
  };
  const setDelivery = (patch: Partial<Draft["delivery"]>) => set({ delivery: { ...draft.delivery, ...patch } });
  const original = settings.data && { betaAllPro: settings.data.betaAllPro, unpaidJobs: settings.data.unpaidJobs, delivery: settings.data.delivery };
  const dirty = JSON.stringify(draft) !== JSON.stringify(original);

  return (
    <AdminShell title="Settings">
      <Section title="Beta">
        <Toggle
          label="Everyone gets Pro"
          description={draft.betaAllPro ? "On: no paywalls, limits are Pro's for every user." : "Off: users get the plan they paid for (Free otherwise)."}
          checked={draft.betaAllPro}
          onChange={(betaAllPro) => set({ betaAllPro })}
        />
      </Section>

      <Section title="Unpaid & volunteer jobs" description="Internships without pay, volunteer roles and other unpaid positions.">
        <ChipGroup>
          <Chip selected={draft.unpaidJobs === "label"} onClick={() => set({ unpaidJobs: "label" })}>
            Send, labelled &ldquo;Unpaid&rdquo;
          </Chip>
          <Chip selected={draft.unpaidJobs === "exclude"} onClick={() => set({ unpaidJobs: "exclude" })}>
            Don&apos;t send or show
          </Chip>
        </ChipGroup>
      </Section>

      <Section title="Alert timing" description="Hours are Addis Ababa time.">
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Alert on jobs up to (hours old)" value={draft.delivery.maxJobAgeHours} min={1} max={168} onChange={(maxJobAgeHours) => setDelivery({ maxJobAgeHours })} />
          <NumberField label="Missed-jobs message at (hour)" value={draft.delivery.digestHourEat} min={0} max={23} onChange={(digestHourEat) => setDelivery({ digestHourEat })} />
          <NumberField label="Quiet hours from" value={draft.delivery.quietFromEat} min={0} max={23} onChange={(quietFromEat) => setDelivery({ quietFromEat })} />
          <NumberField label="Quiet hours until" value={draft.delivery.quietToEat} min={0} max={23} onChange={(quietToEat) => setDelivery({ quietToEat })} />
        </div>
        <p className="mt-3 text-[12px] text-hint">Alerts matched during quiet hours wait until they end. Same start and end = no quiet hours.</p>
      </Section>

      <StickyFooter>
        {save.error && <ErrorText>{save.error.message}</ErrorText>}
        <Button
          loading={save.isPending}
          disabled={!dirty}
          onClick={() =>
            save.mutate(draft, {
              onSuccess: (data) => {
                haptic.success();
                setDraft({ betaAllPro: data.betaAllPro, unpaidJobs: data.unpaidJobs, delivery: data.delivery });
                setSaved(true);
              },
              onError: () => haptic.error(),
            })
          }
        >
          {saved && !dirty ? "Saved" : "Save settings"}
        </Button>
      </StickyFooter>
    </AdminShell>
  );
}

function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <label className="text-[12px] font-medium text-hint">
      {label}
      <input
        inputMode="numeric"
        value={String(value)}
        onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value.replace(/\D/g, "")) || min)))}
        className="mt-1 h-10 w-full rounded-lg border border-separator px-3 text-[15px] text-text"
      />
    </label>
  );
}

