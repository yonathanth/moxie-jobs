"use client";

import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EMPLOYER_FILTERS, EMPLOYMENT_TYPES, POSTED_WITHIN, type City } from "@ethio/shared";
import { search } from "@/lib/search";
import { haptic } from "@/lib/telegram";
import { toggle } from "../preferences/state";
import { Button, Chip, ChipGroup, SearchInput, Toggle } from "../ui";
import { EMPLOYER_FILTER_LABEL, EMPTY_FILTERS, POSTED_LABEL, type FeedState } from "./filters";

const POPULAR_CITIES = ["addis_ababa", "adama", "bahir_dar", "hawassa", "dire_dawa", "mekelle", "gondar", "jimma"];

type Filters = Omit<FeedState, "scope" | "q">;

/** Bottom sheet with every feed filter. Edits a draft; "Show jobs" applies it. */
export function FilterSheet({
  value,
  cities,
  onApply,
  onClose,
}: {
  value: Filters;
  cities: readonly City[];
  onApply: (f: Filters) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Filters>(value);
  const [cityQuery, setCityQuery] = useState("");
  const byId = useMemo(() => new Map(cities.map((c) => [c.id, c])), [cities]);
  const set = (patch: Partial<Filters>) => {
    haptic.select();
    setDraft((d) => ({ ...d, ...patch }));
  };

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const cityOptions = cityQuery.trim()
    ? search(cities, cityQuery, 10)
    : POPULAR_CITIES.map((id) => byId.get(id)).filter((c): c is City => !!c);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center" role="dialog" aria-modal="true" aria-label="Filters">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className="relative flex max-h-[88dvh] w-full max-w-lg flex-col rounded-t-3xl bg-surface shadow-[0_-12px_40px_-12px_rgba(15,17,21,0.3)] animate-fade-up">
        <div className="flex items-center justify-between border-b border-separator-subtle px-5 py-4">
          <h2 className="text-lg font-bold tracking-tight">Filters</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-full bg-pill text-hint">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <FilterGroup title="Posted">
            <ChipGroup>
              <Chip selected={draft.posted === null} onClick={() => set({ posted: null })}>
                Any time
              </Chip>
              {POSTED_WITHIN.map((p) => (
                <Chip key={p} selected={draft.posted === p} onClick={() => set({ posted: p })}>
                  {POSTED_LABEL[p]}
                </Chip>
              ))}
            </ChipGroup>
          </FilterGroup>

          <FilterGroup title="Employer">
            <ChipGroup>
              {EMPLOYER_FILTERS.map((e) => (
                <Chip key={e} selected={draft.employers.includes(e)} onClick={() => set({ employers: toggle(draft.employers, e) })}>
                  {EMPLOYER_FILTER_LABEL[e]}
                </Chip>
              ))}
            </ChipGroup>
          </FilterGroup>

          <FilterGroup title="Job type">
            <ChipGroup>
              {EMPLOYMENT_TYPES.map((t) => (
                <Chip key={t.id} selected={draft.types.includes(t.id)} onClick={() => set({ types: toggle(draft.types, t.id) })}>
                  {t.label}
                </Chip>
              ))}
            </ChipGroup>
          </FilterGroup>

          <FilterGroup title="City">
            {draft.cities.length > 0 && (
              <div className="mb-3">
                <ChipGroup>
                  {draft.cities.map((id) => (
                    <Chip key={id} onRemove={() => set({ cities: toggle(draft.cities, id) })}>
                      {byId.get(id)?.name ?? id}
                    </Chip>
                  ))}
                </ChipGroup>
              </div>
            )}
            <SearchInput value={cityQuery} onChange={setCityQuery} placeholder="Search a city" />
            <div className="mt-3">
              <ChipGroup>
                {cityOptions
                  .filter((c) => !draft.cities.includes(c.id))
                  .map((c) => (
                    <Chip key={c.id} onClick={() => set({ cities: [...draft.cities, c.id] })}>
                      {c.name}
                    </Chip>
                  ))}
              </ChipGroup>
            </div>
          </FilterGroup>

          <div className="flex flex-col gap-4 border-t border-separator-subtle py-4">
            <Toggle label="Remote only" checked={draft.remote} onChange={(remote) => set({ remote })} />
            <Toggle label="Closing within 3 days" checked={draft.closing} onChange={(closing) => set({ closing })} />
            <Toggle label="Shows salary" description="Only jobs that state the pay. Most posts don't." checked={draft.salary} onChange={(salary) => set({ salary })} />
          </div>
        </div>

        <div className="flex gap-2 border-t border-separator px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
          <Button variant="secondary" className="w-auto flex-1" onClick={() => setDraft(EMPTY_FILTERS)}>
            Clear
          </Button>
          <Button className="w-auto flex-[2]" onClick={() => onApply(draft)}>
            Show jobs
          </Button>
        </div>
      </div>
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="pb-5">
      <h3 className="mb-2.5 text-[13px] font-semibold text-hint">{title}</h3>
      {children}
    </section>
  );
}
