"use client";

import clsx from "clsx";
import { Check, ChevronDown, Loader2, Minus, Plus } from "lucide-react";
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
  /** Roles left out of followed categories. */
  excludedIds: string[];
  limits: PlanLimits;
  onChange: (next: { professionIds: string[]; functionIds: string[]; excludedProfessionIds: string[] }) => void;
}

/** "Any Accounting & Finance job", or "Accounting & Finance: 15 of 17 roles" when some are left out. */
export function categoryLabel(name: string, roles: readonly string[], excluded: readonly string[]): string {
  const off = roles.filter((r) => excluded.includes(r)).length;
  return off ? `${name}: ${roles.length - off} of ${roles.length} roles` : `Any ${name} job`;
}

/**
 * Pick whole categories and/or specific professions (search or browse). A followed category has every
 * role on; unticking roles leaves them out (stored as exclusions, so it never uses up role slots).
 */
export function ProfessionPicker({ taxonomy, professionIds, functionIds, excludedIds, limits, onChange: emit }: Props) {
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

  // Every change carries all three lists; exclusions only live inside followed categories.
  const onChange = (next: { professionIds: string[]; functionIds: string[]; excludedProfessionIds?: string[] }) =>
    emit({ ...next, excludedProfessionIds: next.excludedProfessionIds ?? excludedIds });
  const rolesOf = (fn: string) => functionsById.get(fn)?.professions.map((p) => p.id) ?? [];
  const isOn = (id: string) => {
    const fn = byId.get(id)?.functionId;
    return professionIds.includes(id) || (!!fn && functionIds.includes(fn) && !excludedIds.includes(id));
  };

  const toggleProfession = (id: string) => {
    const fn = byId.get(id)?.functionId;
    // Inside a followed category every role is on: tapping one leaves it out, or brings it back.
    if (fn && functionIds.includes(fn)) {
      haptic.select();
      if (excludedIds.includes(id)) return onChange({ professionIds, functionIds, excludedProfessionIds: excludedIds.filter((x) => x !== id) });
      const excluded = [...excludedIds, id];
      const roles = rolesOf(fn);
      // Every role left out: that's no longer following the category.
      if (roles.every((r) => excluded.includes(r))) {
        return onChange({ professionIds, functionIds: functionIds.filter((f) => f !== fn), excludedProfessionIds: excluded.filter((x) => !roles.includes(x)) });
      }
      return onChange({ professionIds, functionIds, excludedProfessionIds: excluded });
    }
    if (!professionIds.includes(id) && professionsFull) return blocked("professions");
    haptic.select();
    onChange({ professionIds: toggle(professionIds, id), functionIds });
  };

  /** The default action: follow every job in a category (its specific roles fold into it). */
  const toggleFunction = (id: string) => {
    const inside = new Set(rolesOf(id));
    if (functionIds.includes(id)) {
      haptic.select();
      return onChange({ professionIds, functionIds: functionIds.filter((f) => f !== id), excludedProfessionIds: excludedIds.filter((x) => !inside.has(x)) });
    }
    if (categoriesLocked || functionsFull) return blocked("categories");
    haptic.select();
    onChange({
      professionIds: professionIds.filter((p) => !inside.has(p)),
      functionIds: [...functionIds, id],
      excludedProfessionIds: excludedIds.filter((x) => !inside.has(x)),
    });
  };

  /** "Select all in this category": every role on (follow it whole), or all off when they already are. */
  const selectAll = (id: string) => {
    const inside = new Set(rolesOf(id));
    const followed = functionIds.includes(id);
    if (followed && excludedIds.some((x) => inside.has(x))) {
      haptic.select();
      return onChange({ professionIds, functionIds, excludedProfessionIds: excludedIds.filter((x) => !inside.has(x)) });
    }
    toggleFunction(id);
  };

  // "Not listed": the server maps the typed title to the closest professions (saved answer, local match, then AI).
  const notListed = () => {
    const text = query.trim();
    if (professionsFull) return blocked("professions");
    resolve.mutate(
      { kind: "profession", text },
      {
        onSuccess: ({ ids }) => {
          const known = ids.filter((id) => byId.has(id) && !isOn(id));
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
              {categoryLabel(functionsById.get(id)?.name ?? id, rolesOf(id), excludedIds)}
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
        placeholder="Search a job title, e.g. Accountant, Nurse, Driver"
      />
      {notice && <p className="text-[13px] text-hint">{notice}</p>}

      {professionsFull && (
        <p className="text-xs text-hint">
          You&apos;ve picked the maximum of {limits.maxProfessions} professions. Remove one to add another
          {upgradeAllowsMore && (
            <>
              , or{" "}
              <button type="button" onClick={() => paywall.gate("professions")} className="font-semibold text-accent-strong">
                upgrade for more
              </button>
            </>
          )}
          .
        </p>
      )}

      {query.trim() ? (
        <ul className="-mx-1 flex flex-col">
          {results.length === 0 && <li className="px-1 pt-3 text-sm text-hint">No exact match.</li>}
          {results.map((p) => {
            const selected = isOn(p.id);
            const inWhole = functionIds.includes(p.functionId);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => toggleProfession(p.id)}
                  className={clsx("flex w-full items-center justify-between gap-3 rounded-lg px-1 py-2.5 text-left", !selected && !inWhole && professionsFull && "opacity-40")}
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
          <ul className="flex flex-col gap-1.5">
            {taxonomy.functions.map((f) => (
              <CategoryRow
                key={f.id}
                id={f.id}
                name={f.name}
                professions={f.professions}
                whole={functionIds.includes(f.id)}
                isOn={isOn}
                pickedIds={professionIds}
                open={openFunction === f.id}
                dimmed={!functionIds.includes(f.id) && (categoriesLocked || functionsFull)}
                professionsFull={professionsFull}
                onToggleWhole={() => toggleFunction(f.id)}
                onSelectAll={() => selectAll(f.id)}
                onToggleOpen={() => setOpenFunction(openFunction === f.id ? null : f.id)}
                onToggleProfession={toggleProfession}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * One category. The row itself selects the whole category (the default: jobs are scarce, so
 * following all of it is usually right). The chevron opens its roles: "Select all in …" first,
 * then every role, all ticked when the category is followed so people can untick what they don't want.
 */
function CategoryRow({
  id,
  name,
  professions,
  whole,
  isOn,
  pickedIds,
  open,
  dimmed,
  professionsFull,
  onToggleWhole,
  onSelectAll,
  onToggleOpen,
  onToggleProfession,
}: {
  id: string;
  name: string;
  professions: ProfessionDto[];
  whole: boolean;
  isOn: (id: string) => boolean;
  pickedIds: string[];
  open: boolean;
  dimmed: boolean;
  professionsFull: boolean;
  onToggleWhole: () => void;
  onSelectAll: () => void;
  onToggleOpen: () => void;
  onToggleProfession: (id: string) => void;
}) {
  const picked = professions.filter((p) => pickedIds.includes(p.id)).length;
  const on = professions.filter((p) => isOn(p.id)).length;
  const allOn = whole && on === professions.length;
  const state = whole ? (allOn ? "All roles" : `${on} of ${professions.length} roles`) : picked ? `${picked} specific ${picked === 1 ? "role" : "roles"}` : null;
  return (
    <li className={clsx("overflow-hidden rounded-xl border transition-colors", whole ? "border-ink bg-surface" : picked ? "border-accent-border bg-surface" : "border-separator bg-surface")}>
      <div className="flex items-center">
        <button type="button" onClick={onToggleWhole} aria-pressed={whole} className={clsx("flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-3 text-left", dimmed && "opacity-60")}>
          <span className={clsx("grid size-8 shrink-0 place-items-center rounded-lg border", whole ? "border-ink bg-ink text-white" : "border-separator bg-neutral-50 text-text")}>
            <CategoryIcon id={id} className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className={clsx("block truncate text-[15px]", (whole || picked > 0) && "font-semibold")}>{name}</span>
            {state && <span className={clsx("block text-[12px]", allOn ? "text-hint" : "text-accent-strong")}>{state}</span>}
          </span>
          <span
            className={clsx(
              "grid size-6 shrink-0 place-items-center rounded-full border transition-colors",
              whole ? "border-ink bg-ink text-white" : "border-separator text-transparent",
            )}
          >
            {whole && !allOn ? <Minus className="size-3.5" strokeWidth={3} /> : <Check className="size-3.5" strokeWidth={3} />}
          </span>
        </button>
        <button
          type="button"
          onClick={onToggleOpen}
          aria-expanded={open}
          aria-label={`Pick specific roles in ${name}`}
          className="grid h-12 w-11 shrink-0 place-items-center text-hint-light hover:text-hint"
        >
          <ChevronDown className={clsx("size-4 transition-transform", open && "rotate-180")} />
        </button>
      </div>
      {open && (
        <div className="border-t border-separator-subtle px-3 pb-3 pt-2.5">
          <button
            type="button"
            onClick={onSelectAll}
            aria-pressed={allOn}
            className={clsx("mb-2.5 flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors", allOn ? "border-ink bg-surface" : "border-separator bg-neutral-50", dimmed && "opacity-60")}
          >
            <span
              className={clsx(
                "grid size-5 shrink-0 place-items-center rounded-md border transition-colors",
                whole ? "border-ink bg-ink text-white" : "border-separator bg-surface text-transparent",
              )}
            >
              {whole && !allOn ? <Minus className="size-3.5" strokeWidth={3} /> : <Check className="size-3.5" strokeWidth={3} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold">Select all in this category</span>
              <span className="block text-[12px] text-hint">Every {name} job, including new roles</span>
            </span>
          </button>
          <p className="mb-2 text-[12px] text-hint">{whole ? "Untick any role you don't want." : "Or pick only the roles you want."}</p>
          <ChipGroup>
            {professions.map((p) => (
              <Chip
                key={p.id}
                selected={isOn(p.id)}
                muted={!whole && !pickedIds.includes(p.id) && professionsFull}
                onClick={() => onToggleProfession(p.id)}
              >
                {p.name}
              </Chip>
            ))}
          </ChipGroup>
        </div>
      )}
    </li>
  );
}
