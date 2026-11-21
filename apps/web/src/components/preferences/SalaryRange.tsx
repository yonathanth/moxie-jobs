"use client";

import { useState } from "react";

/** Digits only → number, or null when empty. */
export function parseBirr(text: string): number | null {
  const digits = text.replace(/[^\d]/g, "");
  if (!digits) return null;
  return Math.min(Number(digits), 10_000_000);
}

export function formatBirrInput(n: number | null): string {
  return n === null ? "" : n.toLocaleString("en-US");
}

/** Optional expected monthly salary (ETB). Both ends optional; only the minimum filters jobs. */
export function SalaryRange({
  min,
  max,
  onChange,
}: {
  min: number | null;
  max: number | null;
  onChange: (next: { salaryMin: number | null; salaryMax: number | null }) => void;
}) {
  // Local text so typing "12,5" doesn't jump; the number is what's saved.
  const [minText, setMinText] = useState(formatBirrInput(min));
  const [maxText, setMaxText] = useState(formatBirrInput(max));
  const invalid = min !== null && max !== null && min > max;

  const field = (
    label: string,
    text: string,
    setText: (v: string) => void,
    apply: (n: number | null) => void,
  ) => (
    <label className="flex-1">
      <span className="mb-1.5 block text-xs font-medium text-hint">{label}</span>
      <span className="relative block">
        <input
          inputMode="numeric"
          autoComplete="off"
          value={text}
          placeholder="Any"
          onChange={(e) => {
            const n = parseBirr(e.target.value);
            setText(e.target.value.replace(/[^\d,]/g, ""));
            apply(n);
          }}
          onBlur={() => setText(formatBirrInput(parseBirr(text)))}
          className="h-11 w-full rounded-xl border border-separator bg-surface pl-3.5 pr-12 text-[15px] outline-none transition-colors placeholder:text-hint-light focus:border-ink"
        />
        <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-hint">Br</span>
      </span>
    </label>
  );

  return (
    <div>
      <div className="flex items-end gap-2">
        {field("From", minText, setMinText, (n) => onChange({ salaryMin: n, salaryMax: max }))}
        <span className="pb-3 text-hint">–</span>
        {field("To", maxText, setMaxText, (n) => onChange({ salaryMin: min, salaryMax: n }))}
      </div>
      {invalid ? (
        <p className="mt-2 text-xs text-danger">&quot;From&quot; can&apos;t be higher than &quot;To&quot;.</p>
      ) : (
        <p className="mt-2 text-xs text-hint">
          Per month, in birr. Most posts don&apos;t state pay, so we only skip jobs that state less than your &quot;From&quot;.
        </p>
      )}
    </div>
  );
}
