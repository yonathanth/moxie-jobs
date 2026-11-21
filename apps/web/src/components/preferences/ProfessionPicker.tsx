"use client";

import clsx from "clsx";
import { Check, ChevronRight, Layers, Loader2, Lock, Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { PlanLimits, ProfessionDto, TaxonomyDto } from "@ethio/shared";
import { search } from "@/lib/search";
import { usePricing, useResolveTerm } from "@/components/miniapp/hooks";
import { haptic } from "@/lib/telegram";
import { Chip, ChipGroup, SearchInput } from "../ui";
import { CategoryIcon } from "../categoryIcons";
import { usePaywall } from "../paywall";
import { toggle } from "./state";

interface Props {
  taxonomy: TaxonomyDto;
  professionIds: string[];
  functionIds: string[];
  limits: PlanLimits;
  onChange: (next: { professionIds: string[]; functionIds: string[] }) => void;
}

/** Pick specific professions (search or browse) and/or whole categories. */
export function ProfessionPicker({ taxonomy, professionIds, functionIds, limits, onChange }: Props) {
  const [query, setQuery] = useState("");
  const [openFunction, setOpenFunction] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const resolve = useResolveTerm();

  const { all, byId, functionsById } = useMemo(() => {
    const all: ProfessionDto[] = taxonomy.functions.flatMap((f) => f.professions);
    return {
      all,
      byId: new Map(all.map((p) => [p.id, p])),
      functionsById: new Map(taxonomy.functions.map((f) => [f.id, f])),
    };
  }, [taxonomy]);

  const results = useMemo(() => search(all, query, 25), [all, query]);
  const professionsFull = professionIds.length >= limits.maxProfessions;
  const functionsFull = functionIds.length >= limits.maxFunctions;
  // Free plan: whole categories are a paid feature.
  const categoriesLocked = limits.maxFunctions === 0;
  const pricing = usePricing();
  const upgradeAllowsMore = Object.values(pricing.data?.limits ?? {}).some((l) => l.maxProfessions > limits.maxProfessions);
  const paywall = usePaywall();
  const blocked = (reason: "professions" | "categories") => {
    if (!paywall.gate(reason)) haptic.error();
  };

  const toggleProfession = (id: string) => {
    if (!professionIds.includes(id) && professionsFull) return blocked("professions");
    haptic.select();
    onChange({ professionIds: toggle(professionIds, id), functionIds });
  };
  const toggleFunction = (id: string) => {
    if (!functionIds.includes(id) && (categoriesLocked || functionsFull)) return blocked("categories");
    haptic.select();
    const adding = !functionIds.includes(id);
    onChange({ professionIds, functionIds: toggle(functionIds, id) });
    // Following the whole category covers every role in it: fold the list away.
    if (adding) setOpenFunction(null);
  };

  // "Not listed": the server maps the typed title to the closest professions (saved answer, local match, then AI).
  const notListed = () => {
    const text = query.trim();
    if (professionsFull) return blocked("professions");
    resolve.mutate(
      { kind: "profession", text },
      {
        onSuccess: ({ ids }) => {
          const known = ids.filter((id) => byId.has(id) && !professionIds.includes(id));
          if (!known.length) {
            haptic.error();
            setNotice(`We couldn't match "${text}". Try another word, or browse the categories below.`);
            return;
          }
          haptic.select();
          const added = known.slice(0, limits.maxProfessions - professionIds.length);
          onChange({ professionIds: [...professionIds, ...added], functionIds });
          setNotice(`Matched "${text}" to ${added.map((id) => byId.get(id)!.name).join(", ")}.`);
          setQuery("");
        },
        onError: () => setNotice("Couldn't check that right now. Please try again."),
      },
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {(professionIds.length > 0 || functionIds.length > 0) && (
        <ChipGroup>
          {professionIds.map((id, i) => (
            <Chip key={id} inactive={i >= limits.maxProfessions} onRemove={() => toggleProfession(id)}>
              {byId.get(id)?.name ?? id}
            </Chip>
          ))}
          {functionIds.map((id, i) => (
            <Chip key={`f:${id}`} inactive={i >= limits.maxFunctions} onRemove={() => toggleFunction(id)}>
              Any {functionsById.get(id)?.name ?? id} job
            </Chip>
          ))}
        </ChipGroup>
      )}

      <SearchInput
        value={query}
        onChange={(v) => {
          setQuery(v);
          setNotice(null);
        }}
        placeholder="Search a job title, e.g. Accountant, Nurse, ሹፌር"
      />
      {notice && <p className="text-[13px] text-hint">{notice}</p>}

      {professionsFull && (
        <p className="text-xs text-hint">
          You&apos;ve picked the maximum of {limits.maxProfessions} professions. Remove one to add another
          {upgradeAllowsMore && (
            <>
              , or{" "}
              <Link href="/app/plans" className="font-semibold text-accent-strong">
                upgrade for more
              </Link>
            </>
          )}
          .
        </p>
      )}

      {query.trim() ? (
        <ul className="-mx-1 flex flex-col">
          {results.length === 0 && <li className="px-1 pt-3 text-sm text-hint">No exact match.</li>}
          {results.map((p) => {
            const selected = professionIds.includes(p.id);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => toggleProfession(p.id)}
                  className={clsx("flex w-full items-center justify-between gap-3 rounded-lg px-1 py-2.5 text-left", !selected && professionsFull && "opacity-40")}
                >
                  <span>
                    <span className="block text-[15px]">{p.name}</span>
                    <span className="block text-xs text-hint">{functionsById.get(p.functionId)?.name}</span>
                  </span>
                  <span
                    className={clsx(
                      "grid size-6 shrink-0 place-items-center rounded-full border",
                      selected ? "border-ink bg-ink text-white" : "border-separator text-hint",
                    )}
                  >
                    {selected ? <Check className="size-3.5" strokeWidth={3} /> : <Plus className="size-3.5" strokeWidth={2.5} />}
                  </span>
                </button>
              </li>
            );
          })}
          {query.trim().length >= 2 && !results.some((r) => r.name.toLowerCase() === query.trim().toLowerCase()) && (
            <li className={clsx(results.length > 0 && "mt-1 border-t border-separator-subtle")}>
              <button
                type="button"
                onClick={notListed}
                disabled={resolve.isPending}
                className="flex w-full items-center gap-2 rounded-lg px-1 py-2.5 text-left text-[13px] text-hint"
              >
                {resolve.isPending ? <Loader2 className="size-4 shrink-0 animate-spin" /> : <Plus className="size-4 shrink-0" />}
                <span>
                  Not listed? Use <span className="font-semibold text-text">&ldquo;{query.trim()}&rdquo;</span>
                </span>
              </button>
            </li>
          )}
        </ul>
      ) : (
        <div>
          <p className="mb-1 text-xs font-medium text-hint">Or browse by category</p>
          <ul className="flex flex-col divide-y divide-separator">
            {taxonomy.functions.map((f) => {
              const open = openFunction === f.id;
              const whole = functionIds.includes(f.id);
              const picked = f.professions.filter((p) => professionIds.includes(p.id)).length;
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => setOpenFunction(open ? null : f.id)}
                    aria-expanded={open}
                    className={clsx(
                      "flex w-full items-center gap-3 text-left transition-colors",
                      whole ? "my-1.5 rounded-xl border border-accent-border bg-accent-soft px-3 py-2.5" : "py-3",
                    )}
                  >
                    <span
                      className={clsx(
                        "grid size-8 shrink-0 place-items-center rounded-lg",
                        whole ? "bg-[linear-gradient(180deg,var(--accent-mid),var(--accent))] text-white" : "bg-pill text-text",
                      )}
                    >
                      <CategoryIcon id={f.id} className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={clsx("block text-[15px]", whole && "font-semibold")}>{f.name}</span>
                      {whole && <span className="block text-[12px] text-accent-strong">Every role in this category</span>}
                    </span>
                    {whole ? (
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent text-white">
                        <Check className="size-3.5" strokeWidth={3} />
                      </span>
                    ) : (
                      picked > 0 && <span className="rounded-full bg-accent-soft px-2 text-xs font-semibold text-accent-strong">{picked}</span>
                    )}
                    <ChevronRight className={clsx("size-4 text-hint-light transition-transform", open && "rotate-90")} aria-hidden />
                  </button>
                  {open && (
                    <div className="pb-4">
                      <CategoryOption
                        name={f.name}
                        selected={functionIds.includes(f.id)}
                        locked={categoriesLocked}
                        full={functionsFull}
                        onClick={() => toggleFunction(f.id)}
                      />
                      <p className="mb-2 mt-4 text-xs font-medium text-hint">Or pick specific roles</p>
                      <ChipGroup>
                        {f.professions.map((p) => (
                          <Chip
                            key={p.id}
                            selected={professionIds.includes(p.id)}
                            muted={professionsFull}
                            onClick={() => toggleProfession(p.id)}
                          >
                            {p.name}
                          </Chip>
                        ))}
                      </ChipGroup>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/** "Any job in <category>": a prominent row, not one chip among many. */
function CategoryOption({
  name,
  selected,
  locked,
  full,
  onClick,
}: {
  name: string;
  selected: boolean;
  locked: boolean;
  full: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={clsx(
        "flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors",
        selected
          ? "border-ink bg-ink text-white"
          : "border-accent-border bg-[linear-gradient(120deg,var(--accent-soft)_0%,#ffffff_80%)] hover:border-accent",
        !selected && (locked || full) && "opacity-80",
      )}
    >
      <span
        className={clsx(
          "grid size-9 shrink-0 place-items-center rounded-lg",
          selected ? "bg-white/15 text-white" : "bg-[linear-gradient(180deg,var(--accent-mid),var(--accent))] text-white",
        )}
      >
        <Layers className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold">Any job in {name}</span>
        <span className={clsx("block text-[12px]", selected ? "text-white/70" : "text-hint")}>Every role in this category, as it&apos;s posted</span>
      </span>
      {selected ? (
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-white text-ink">
          <Check className="size-3.5" strokeWidth={3} />
        </span>
      ) : locked ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent-strong">
          <Lock className="size-3" />
          Pro
        </span>
      ) : (
        <span className="grid size-6 shrink-0 place-items-center rounded-full border border-accent-border text-accent-strong">
          <Plus className="size-3.5" strokeWidth={2.5} />
        </span>
      )}
    </button>
  );
}
