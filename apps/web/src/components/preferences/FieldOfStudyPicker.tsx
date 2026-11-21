"use client";

import clsx from "clsx";
import { Check, Loader2, Plus, Search } from "lucide-react";
import { useId, useMemo, useState } from "react";
import type { FieldOfStudyDto } from "@ethio/shared";
import { useResolveTerm } from "@/components/miniapp/hooks";
import { search } from "@/lib/search";
import { haptic } from "@/lib/telegram";
import { usePaywall } from "../paywall";
import { Chip, ChipGroup } from "../ui";

interface Props {
  fields: FieldOfStudyDto[];
  value: string[];
  max: number;
  onChange: (ids: string[]) => void;
}

/**
 * "Your degree": searchable dropdown over every program (names shown in English;
 * Amharic and short forms are search-only aliases). Nothing fits → "Not listed?
 * Use '…'" maps the typed text to the closest programs on the server.
 */
export function FieldOfStudyPicker({ fields, value, max, onChange }: Props) {
  const listId = useId();
  const paywall = usePaywall();
  const resolve = useResolveTerm();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [notice, setNotice] = useState<string | null>(null);

  const pickable = useMemo(() => fields.filter((f) => f.id !== "any_field"), [fields]);
  const byId = useMemo(() => new Map(pickable.map((f) => [f.id, f])), [pickable]);
  const full = value.length >= max;
  const trimmed = query.trim();
  const results = useMemo(() => (trimmed ? search(pickable, trimmed, 8) : []), [pickable, trimmed]);
  const exact = results.some((f) => f.name.toLowerCase() === trimmed.toLowerCase());
  const showList = open && trimmed.length > 0;
  // The "Not listed" row is the last option in the list.
  const optionCount = results.length + (trimmed.length >= 2 && !exact ? 1 : 0);

  const add = (ids: string[]) => {
    const fresh = ids.filter((id) => !value.includes(id));
    if (!fresh.length) return setNotice("Already on your list.");
    if (full) {
      if (!paywall.gate("fields")) haptic.error();
      return;
    }
    haptic.select();
    onChange([...value, ...fresh].slice(0, Math.max(max, value.length)));
    setNotice(null);
    setQuery("");
    setHighlight(-1);
  };

  const notListed = () => {
    if (full) {
      if (!paywall.gate("fields")) haptic.error();
      return;
    }
    resolve.mutate(
      { kind: "field", text: trimmed },
      {
        onSuccess: ({ ids }) => {
          const known = ids.filter((id) => byId.has(id));
          if (!known.length) {
            haptic.error();
            setNotice(`We couldn't match "${trimmed}". Try another word, like the main subject.`);
            return;
          }
          add(known.slice(0, Math.max(1, max - value.length)));
          setNotice(`Matched "${trimmed}" to ${known.map((id) => byId.get(id)!.name).join(", ")}.`);
        },
        onError: () => setNotice("Couldn't check that right now. Please try again."),
      },
    );
  };

  const choose = (i: number) => {
    if (i < results.length) add([results[i]!.id]);
    else notListed();
  };

  return (
    <div className="flex flex-col gap-3">
      {value.length > 0 && (
        <ChipGroup>
          {value.map((id, i) => (
            <Chip key={id} inactive={i >= max} onRemove={() => onChange(value.filter((x) => x !== id))}>
              {byId.get(id)?.name ?? id}
            </Chip>
          ))}
        </ChipGroup>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-hint-light" />
        <input
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={highlight >= 0 ? `${listId}-${highlight}` : undefined}
          autoComplete="off"
          enterKeyHint="search"
          value={query}
          placeholder={value.length ? "Add another degree (optional)" : "Search your degree, e.g. Accounting, Nursing"}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setHighlight(-1);
            setNotice(null);
          }}
          onFocus={() => setOpen(true)}
          // Delay so a tap on an option lands before the list closes.
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((h) => Math.min(h + 1, optionCount - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => Math.max(h - 1, -1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (highlight >= 0) choose(highlight);
              else if (results[0] && results[0].name.toLowerCase() === trimmed.toLowerCase()) choose(0);
              else if (trimmed.length >= 2) notListed();
            } else if (e.key === "Escape") setOpen(false);
          }}
          className="h-11 w-full rounded-xl border border-separator bg-surface pl-10 pr-3.5 text-[15px] outline-none transition-colors placeholder:text-hint-light focus:border-ink"
        />

        {showList && (
          <div
            id={listId}
            role="listbox"
            className="absolute z-30 mt-1.5 max-h-72 w-full overflow-y-auto rounded-xl border border-separator bg-surface py-1 shadow-[0_18px_44px_-20px_rgba(15,17,21,0.35)]"
          >
            {results.map((f, i) => {
              const chosen = value.includes(f.id);
              return (
                <button
                  key={f.id}
                  id={`${listId}-${i}`}
                  type="button"
                  role="option"
                  aria-selected={highlight === i}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => choose(i)}
                  className={clsx("flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left", highlight === i && "bg-neutral-50")}
                >
                  <span className="min-w-0 truncate text-[15px] font-medium">{f.name}</span>
                  {chosen ? <Check className="size-4 shrink-0 text-accent" /> : <Plus className="size-4 shrink-0 text-hint-light" />}
                </button>
              );
            })}
            {trimmed.length >= 2 && !exact && (
              <button
                id={`${listId}-${results.length}`}
                type="button"
                role="option"
                aria-selected={highlight === results.length}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlight(results.length)}
                onClick={() => choose(results.length)}
                disabled={resolve.isPending}
                className={clsx(
                  "flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-[13px] text-hint",
                  results.length > 0 && "mt-1 border-t border-separator-subtle",
                  highlight === results.length && "bg-neutral-50",
                )}
              >
                {resolve.isPending ? <Loader2 className="size-4 shrink-0 animate-spin" /> : <Plus className="size-4 shrink-0" />}
                <span>
                  {results.length ? "Not listed? " : "No match. "}Use <span className="font-semibold text-text">&ldquo;{trimmed}&rdquo;</span>
                </span>
              </button>
            )}
          </div>
        )}
      </div>

      {notice && <p className="text-[13px] text-hint">{notice}</p>}

    </div>
  );
}
