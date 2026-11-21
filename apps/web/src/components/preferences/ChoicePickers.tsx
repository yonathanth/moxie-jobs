"use client";

import {
  EDUCATION_LEVELS,
  EMPLOYMENT_TYPES,
  EXPERIENCE_BANDS,
  GENDERS,
  type EducationLevel,
  type EmploymentType,
  type ExperienceBand,
  type Gender,
} from "@ethio/shared";
import { haptic } from "@/lib/telegram";
import { Chip, ChipGroup } from "../ui";
import { toggle } from "./state";

/** Single choice; tapping the selected chip clears it. */
function SingleChoice<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { id: T; label: string }[];
  value: T | null;
  onChange: (v: T | null) => void;
}) {
  return (
    <ChipGroup>
      {options.map((o) => (
        <Chip
          key={o.id}
          selected={value === o.id}
          onClick={() => {
            haptic.select();
            onChange(value === o.id ? null : o.id);
          }}
        >
          {o.label}
        </Chip>
      ))}
    </ChipGroup>
  );
}

export function EducationPicker(props: { value: EducationLevel | null; onChange: (v: EducationLevel | null) => void }) {
  // "No formal requirement" is a job attribute; people pick their own level.
  return <SingleChoice options={EDUCATION_LEVELS.filter((e) => e.id !== "none")} {...props} />;
}

export function ExperiencePicker(props: { value: ExperienceBand | null; onChange: (v: ExperienceBand | null) => void }) {
  return <SingleChoice options={EXPERIENCE_BANDS} {...props} />;
}

export function GenderPicker(props: { value: Gender | null; onChange: (v: Gender | null) => void }) {
  return <SingleChoice options={GENDERS} {...props} />;
}

export function EmploymentTypePicker({
  value,
  onChange,
}: {
  value: EmploymentType[];
  onChange: (v: EmploymentType[]) => void;
}) {
  return (
    <ChipGroup>
      {EMPLOYMENT_TYPES.map((t) => (
        <Chip
          key={t.id}
          selected={value.includes(t.id)}
          onClick={() => {
            haptic.select();
            onChange(toggle(value, t.id));
          }}
        >
          {t.label}
        </Chip>
      ))}
    </ChipGroup>
  );
}
