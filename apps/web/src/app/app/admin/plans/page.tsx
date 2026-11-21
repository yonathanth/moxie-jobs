"use client";

import { useEffect, useState } from "react";
import { RowsSkeleton } from "@/components/skeletons";
import { BILLING_PERIODS, PAID_PLANS, PERIOD_LABEL, PLAN_NAME, PLANS, type AdminSettingsDto, type PlanLimits } from "@ethio/shared";
import { AdminShell } from "@/components/admin/AdminShell";
import { useAdminSettings, useSaveSettings } from "@/components/admin/hooks";
import { Button, Card, ErrorText, StickyFooter, Toggle } from "@/components/ui";
import { haptic } from "@/lib/telegram";

type Draft = Pick<AdminSettingsDto, "prices" | "planLimits" | "cvPrices" | "unpaidCvCap">;
const pickDraft = (d: AdminSettingsDto): Draft => ({ prices: d.prices, planLimits: d.planLimits, cvPrices: d.cvPrices, unpaidCvCap: d.unpaidCvCap });

const LIMIT_ROWS: { key: keyof PlanLimits; label: string; max: number }[] = [
  { key: "maxProfessions", label: "Professions", max: 10 },
  { key: "maxFunctions", label: "Whole categories", max: 10 },
  { key: "maxFieldsOfStudy", label: "Degrees", max: 10 },
  { key: "maxLocations", label: "Cities", max: 20 },
];

export default function PlansAdminPage() {
  const settings = useAdminSettings();
  const save = useSaveSettings();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings.data && !draft) setDraft(pickDraft(settings.data));
  }, [settings.data, draft]);

  if (!draft) {
    return (
      <AdminShell title="Prices & limits">
        <div className="grid place-items-center py-16">{settings.isError ? <p className="text-sm text-danger">{settings.error.message}</p> : <div className="w-full"><RowsSkeleton count={4} /></div>}</div>
      </AdminShell>
    );
  }

  const setPrice = (plan: (typeof PAID_PLANS)[number], period: (typeof BILLING_PERIODS)[number], v: string) => {
    setSaved(false);
    setDraft((d) => d && { ...d, prices: { ...d.prices, [plan]: { ...d.prices[plan], [period]: Number(v.replace(/\D/g, "")) || 0 } } });
  };
  const setLimit = (plan: (typeof PLANS)[number], patch: Partial<PlanLimits>) => {
    setSaved(false);
    setDraft((d) => d && { ...d, planLimits: { ...d.planLimits, [plan]: { ...d.planLimits[plan], ...patch } } });
  };
  const dirty = !settings.data || JSON.stringify(draft) !== JSON.stringify(pickDraft(settings.data));
  const invalidPrice = PAID_PLANS.some((p) => BILLING_PERIODS.some((per) => draft.prices[p][per] < 1)) || draft.cvPrices.cv_new < 1 || draft.cvPrices.cv_tailor < 1;
  const setCv = (patch: Partial<Pick<Draft, "cvPrices" | "unpaidCvCap">>) => {
    setSaved(false);
    setDraft((d) => d && { ...d, ...patch });
  };

  return (
    <AdminShell title="Prices & limits" subtitle="Prices apply to new purchases. Limits apply right away to everyone on that plan.">
      <section className="mt-5">
        <h2 className="mb-2 px-1 text-[15px] font-semibold">Prices (ETB)</h2>
        <Card>
          <div className="grid grid-cols-[1fr_repeat(3,minmax(0,1fr))] items-center gap-2 text-[12px] font-medium text-hint">
            <span />
            {BILLING_PERIODS.map((p) => (
              <span key={p} className="text-center">
                {PERIOD_LABEL[p]}
              </span>
            ))}
            {PAID_PLANS.map((plan) => (
              <PriceRow key={plan} label={PLAN_NAME[plan]} values={BILLING_PERIODS.map((per) => draft.prices[plan][per])} onChange={(i, v) => setPrice(plan, BILLING_PERIODS[i]!, v)} />
            ))}
          </div>
        </Card>
      </section>

      <section className="mt-5">
        <h2 className="mb-2 px-1 text-[15px] font-semibold">Pay per CV (ETB)</h2>
        <Card>
          <div className="grid grid-cols-3 gap-3">
            <NumberField label="New / improved" value={draft.cvPrices.cv_new} onChange={(n) => setCv({ cvPrices: { ...draft.cvPrices, cv_new: n ?? 0 } })} />
            <NumberField label="Tailored" value={draft.cvPrices.cv_tailor} onChange={(n) => setCv({ cvPrices: { ...draft.cvPrices, cv_tailor: n ?? 0 } })} />
            <NumberField label="Max unpaid CVs" value={draft.unpaidCvCap} max={20} onChange={(n) => setCv({ unpaidCvCap: n ?? 0 })} />
          </div>
          <p className="mt-2 text-[12px] text-hint">Used after a plan&apos;s monthly CVs run out. People see the CV first and pay to download the clean PDF.</p>
        </Card>
      </section>

      {PLANS.map((plan) => (
        <section key={plan} className="mt-5">
          <h2 className="mb-2 px-1 text-[15px] font-semibold">{PLAN_NAME[plan]}</h2>
          <Card>
            <div className="grid grid-cols-2 gap-3">
              {LIMIT_ROWS.map((r) => (
                <label key={r.key} className="text-[12px] font-medium text-hint">
                  {r.label}
                  <input
                    inputMode="numeric"
                    value={String(draft.planLimits[plan][r.key])}
                    onChange={(e) => setLimit(plan, { [r.key]: Math.min(r.max, Number(e.target.value.replace(/\D/g, "")) || 0) })}
                    className="mt-1 h-10 w-full rounded-lg border border-separator px-3 text-[15px] text-text"
                  />
                </label>
              ))}
              <label className="text-[12px] font-medium text-hint">
                Alerts per day
                <input
                  inputMode="numeric"
                  placeholder="Unlimited"
                  value={draft.planLimits[plan].dailyJobCap === null ? "" : String(draft.planLimits[plan].dailyJobCap)}
                  onChange={(e) => {
                    const n = Number(e.target.value.replace(/\D/g, ""));
                    setLimit(plan, { dailyJobCap: n > 0 ? Math.min(200, n) : null });
                  }}
                  className="mt-1 h-10 w-full rounded-lg border border-separator px-3 text-[15px] text-text placeholder:text-hint-light"
                />
              </label>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <NumberField
                label="New CVs / month"
                nullable
                value={draft.planLimits[plan].cvNewPerMonth}
                max={500}
                onChange={(cvNewPerMonth) => setLimit(plan, { cvNewPerMonth })}
              />
              <NumberField
                label="Tailored CVs / month"
                nullable
                value={draft.planLimits[plan].cvTailorPerMonth}
                max={500}
                onChange={(cvTailorPerMonth) => setLimit(plan, { cvTailorPerMonth })}
              />
            </div>
            <div className="mt-4 border-t border-separator-subtle pt-3">
              <Toggle
                label="NGO, international & overseas jobs"
                description="Off = these are held back and counted in the daily summary"
                checked={draft.planLimits[plan].premiumJobs}
                onChange={(premiumJobs) => setLimit(plan, { premiumJobs })}
              />
            </div>
          </Card>
        </section>
      ))}

      <StickyFooter>
        {save.error && <ErrorText>{save.error.message}</ErrorText>}
        {invalidPrice && <p className="text-center text-xs text-danger">Every price must be at least 1 birr.</p>}
        <Button
          loading={save.isPending}
          disabled={!dirty || invalidPrice}
          onClick={() =>
            save.mutate(draft, {
              onSuccess: (data) => {
                haptic.success();
                setDraft(pickDraft(data));
                setSaved(true);
              },
              onError: () => haptic.error(),
            })
          }
        >
          {saved && !dirty ? "Saved" : "Save prices & limits"}
        </Button>
      </StickyFooter>
    </AdminShell>
  );
}

function PriceRow({ label, values, onChange }: { label: string; values: number[]; onChange: (i: number, v: string) => void }) {
  return (
    <>
      <span className="text-[14px] font-semibold text-text">{label}</span>
      {values.map((v, i) => (
        <input
          key={i}
          inputMode="numeric"
          value={v ? String(v) : ""}
          onChange={(e) => onChange(i, e.target.value)}
          className="h-10 w-full rounded-lg border border-separator px-2 text-center text-[15px] text-text"
        />
      ))}
    </>
  );
}

/** Whole-number input. With nullable, empty = unlimited (0 stays 0 = none). */
function NumberField({ label, value, onChange, max = 100_000, nullable }: { label: string; value: number | null; onChange: (n: number | null) => void; max?: number; nullable?: boolean }) {
  return (
    <label className="text-[12px] font-medium text-hint">
      {label}
      <input
        inputMode="numeric"
        placeholder={nullable ? "Unlimited" : undefined}
        value={value === null ? "" : String(value)}
        onChange={(e) => {
          const digits = e.target.value.replace(/D/g, "");
          onChange(digits === "" ? (nullable ? null : 0) : Math.min(max, Number(digits)));
        }}
        className="mt-1 h-10 w-full rounded-lg border border-separator px-3 text-[15px] text-text placeholder:text-hint-light"
      />
    </label>
  );
}
