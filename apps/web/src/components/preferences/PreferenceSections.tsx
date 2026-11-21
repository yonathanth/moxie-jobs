"use client";

import type { PlanLimits, Preferences, TaxonomyDto } from "@ethio/shared";
import { Section, Toggle } from "../ui";
import { EducationPicker, EmploymentTypePicker, ExperiencePicker, GenderPicker } from "./ChoicePickers";
import { FieldOfStudyPicker } from "./FieldOfStudyPicker";
import { LocationPicker } from "./LocationPicker";
import { ProfessionPicker } from "./ProfessionPicker";
import { SalaryRange } from "./SalaryRange";

export type SectionGroup = "work" | "background" | "where";

interface Props {
  group: SectionGroup;
  value: Preferences;
  onChange: (patch: Partial<Preferences>) => void;
  taxonomy: TaxonomyDto;
  limits: PlanLimits;
}

/** The preference form, split in groups so onboarding can show one group per step. */
export function PreferenceSections({ group, value, onChange, taxonomy, limits }: Props) {
  // No professions or categories: the degree is how this person gets matched.
  const byDegreeOnly = value.professionIds.length + value.functionIds.length === 0;
  switch (group) {
    case "work":
      return (
        <Section
          title="Jobs you want"
          aside={`${value.professionIds.length}/${limits.maxProfessions}`}
          description="Pick your profession(s). Not sure? Follow a whole category."
        >
          <ProfessionPicker
            taxonomy={taxonomy}
            professionIds={value.professionIds}
            functionIds={value.functionIds}
            limits={limits}
            onChange={onChange}
          />
        </Section>
      );
    case "background":
      return (
        <>
          <Section title="Highest education">
            <EducationPicker value={value.educationLevel} onChange={(educationLevel) => onChange({ educationLevel })} />
          </Section>
          <Section
            title={byDegreeOnly ? "Your degree" : "Your degree (optional)"}
            aside={`${value.fieldOfStudyIds.length}/${limits.maxFieldsOfStudy}`}
            description={
              byDegreeOnly
                ? "You skipped professions, so we'll find jobs that ask for your degree. Add at least one."
                : "Helps us find jobs that ask for your degree."
            }
          >
            <FieldOfStudyPicker
              fields={taxonomy.fieldsOfStudy}
              value={value.fieldOfStudyIds}
              max={limits.maxFieldsOfStudy}
              onChange={(fieldOfStudyIds) => onChange({ fieldOfStudyIds })}
            />
          </Section>
          <Section title="Work experience">
            <ExperiencePicker value={value.experienceBand} onChange={(experienceBand) => onChange({ experienceBand })} />
          </Section>
          <Section
            title="Gender (optional)"
            description="Only used to skip jobs that are open to the other gender only. Leave empty to see everything."
          >
            <GenderPicker value={value.gender} onChange={(gender) => onChange({ gender })} />
          </Section>
        </>
      );
    case "where":
      return (
        <>
          <Section title="Where you want to work">
            <LocationPicker
              cities={taxonomy.cities}
              locationIds={value.locationIds}
              remoteOk={value.remoteOk}
              max={limits.maxLocations}
              onChange={onChange}
            />
          </Section>
          <Section title="Salary (optional)">
            <SalaryRange min={value.salaryMin} max={value.salaryMax} onChange={onChange} />
          </Section>
          <Section title="Job type" description="Leave empty for any type.">
            <EmploymentTypePicker
              value={value.employmentTypes}
              onChange={(employmentTypes) => onChange({ employmentTypes })}
            />
          </Section>
          <Section>
            <Toggle
              label="Also send me jobs abroad"
              description="Overseas jobs (e.g. Gulf countries). Never pay anyone to get a job abroad."
              checked={value.overseasOk}
              onChange={(overseasOk) => onChange({ overseasOk })}
            />
          </Section>
        </>
      );
  }
}
