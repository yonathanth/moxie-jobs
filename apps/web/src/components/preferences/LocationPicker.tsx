"use client";

import { useMemo, useState } from "react";
import type { City } from "@ethio/shared";
import { search } from "@/lib/search";
import { haptic } from "@/lib/telegram";
import { usePaywall } from "../paywall";
import { Chip, ChipGroup, SearchInput, Toggle } from "../ui";
import { toggle } from "./state";

const POPULAR = ["addis_ababa", "adama", "bahir_dar", "hawassa", "dire_dawa", "mekelle", "gondar", "jimma", "dessie", "bishoftu"];

interface Props {
  cities: readonly City[];
  locationIds: string[];
  remoteOk: boolean;
  max: number;
  onChange: (next: { locationIds: string[]; remoteOk: boolean }) => void;
}

/** Empty locationIds means "anywhere in Ethiopia". */
export function LocationPicker({ cities, locationIds, remoteOk, max, onChange }: Props) {
  const [query, setQuery] = useState("");
  // Specific-city mode stays on while the user is choosing, even before the first pick.
  const [specific, setSpecific] = useState(locationIds.length > 0);
  const byId = useMemo(() => new Map(cities.map((c) => [c.id, c])), [cities]);
  const full = locationIds.length >= max;
  const paywall = usePaywall();

  const shown = query.trim()
    ? search(cities, query, 12)
    : POPULAR.map((id) => byId.get(id)).filter((c): c is City => !!c);

  const flip = (id: string) => {
    if (!locationIds.includes(id) && full) {
      if (!paywall.gate("locations")) haptic.error();
      return;
    }
    haptic.select();
    onChange({ locationIds: toggle(locationIds, id), remoteOk });
  };

  return (
    <div className="flex flex-col gap-4">
      <Toggle
        label="Anywhere in Ethiopia"
        description="Turn off to choose specific cities"
        checked={!specific}
        onChange={(anywhere) => {
          setSpecific(!anywhere);
          if (anywhere) onChange({ locationIds: [], remoteOk });
        }}
      />

      {specific && (
        <div className="flex flex-col gap-3">
          {locationIds.length > 0 && (
            <ChipGroup>
              {locationIds.map((id, i) => (
                <Chip key={id} inactive={i >= max} onRemove={() => flip(id)}>
                  {byId.get(id)?.name ?? id}
                </Chip>
              ))}
            </ChipGroup>
          )}
          <SearchInput value={query} onChange={setQuery} placeholder="Search a city" />
          <ChipGroup>
            {shown
              .filter((c) => !locationIds.includes(c.id))
              .map((c) => (
                <Chip key={c.id} muted={full} onClick={() => flip(c.id)}>
                  {c.name}
                </Chip>
              ))}
          </ChipGroup>
          {full && <p className="text-xs text-hint">Up to {max} cities.</p>}
        </div>
      )}

      <div className="border-t border-separator pt-4">
        <Toggle
          label="Include remote jobs"
          checked={remoteOk}
          onChange={(v) => onChange({ locationIds, remoteOk: v })}
        />
      </div>
    </div>
  );
}
