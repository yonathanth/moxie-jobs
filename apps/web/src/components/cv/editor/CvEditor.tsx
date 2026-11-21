"use client";

import { AlignLeft, Award, Briefcase, GraduationCap, Languages, UserRound, Wrench, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type { CvContent } from "@ethio/shared";
import type { IconTone } from "../../ui";
import { AddButton, AutoArea, BulletList, CheckboxField, EntryCard, Field, MonthField, SectionCard, TagInput } from "./fields";

type Exp = NonNullable<CvContent["experience"]>[number];
type Edu = NonNullable<CvContent["education"]>[number];
type Lang = NonNullable<CvContent["languages"]>[number];
type Cert = NonNullable<CvContent["certifications"]>[number];

export type SectionKey = "personal" | "summary" | "experience" | "education" | "skills" | "languages" | "certifications";

/** Where "Go to" in the score panel sends the editor. */
export interface EditorTarget {
  section: string;
  index?: number;
  field?: string;
  /** Changes on every request, so asking twice still scrolls. */
  nonce: number;
}

const SECTIONS: { key: SectionKey; title: string; icon: LucideIcon; tone: IconTone }[] = [
  { key: "personal", title: "Contact details", icon: UserRound, tone: "accent" },
  { key: "summary", title: "Summary", icon: AlignLeft, tone: "sky" },
  { key: "experience", title: "Work experience", icon: Briefcase, tone: "violet" },
  { key: "education", title: "Education", icon: GraduationCap, tone: "emerald" },
  { key: "skills", title: "Skills", icon: Wrench, tone: "accent" },
  { key: "languages", title: "Languages", icon: Languages, tone: "sky" },
  { key: "certifications", title: "Certificates & training", icon: Award, tone: "violet" },
];

const blank = (v: string | undefined) => !v || !v.trim();
const isPresent = (v: string | undefined) => /present|current|now/i.test(v ?? "");
const move = <T,>(list: T[], i: number, by: -1 | 1): T[] => {
  const next = [...list];
  const j = i + by;
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
};

/** How filled a section is (the mark beside its title). */
export function sectionStatus(c: CvContent, key: SectionKey): "done" | "partial" | "empty" {
  switch (key) {
    case "personal": {
      const p = c.personal ?? {};
      return blank(p.full_name) ? "empty" : blank(p.email) || blank(p.phone) || blank(p.title) ? "partial" : "done";
    }
    case "summary":
      return blank(c.summary) ? "empty" : "done";
    case "experience": {
      const list = c.experience ?? [];
      if (!list.length) return "empty";
      return list.some((e) => blank(e.role) || blank(e.company) || !(e.bullets ?? []).some((b) => b.trim())) ? "partial" : "done";
    }
    case "education": {
      const list = c.education ?? [];
      if (!list.length) return "empty";
      return list.some((e) => blank(e.institution) || blank(e.degree)) ? "partial" : "done";
    }
    case "skills":
      return (c.skills ?? []).length ? "done" : "empty";
    case "languages":
      return (c.languages ?? []).length ? "done" : "empty";
    case "certifications":
      return (c.certifications ?? []).length ? "done" : "empty";
  }
}

function summaryLine(c: CvContent, key: SectionKey): string | undefined {
  switch (key) {
    case "personal":
      return [c.personal?.full_name, c.personal?.title].filter(Boolean).join(" · ") || undefined;
    case "summary":
      return c.summary ? `${c.summary.split(/\s+/).length} words` : undefined;
    case "experience":
      return c.experience?.length ? `${c.experience.length} ${c.experience.length === 1 ? "role" : "roles"}` : undefined;
    case "education":
      return c.education?.length ? c.education.map((e) => e.degree || e.institution).filter(Boolean).join(", ") : undefined;
    case "skills":
      return c.skills?.length ? `${c.skills.length} skills` : undefined;
    case "languages":
      return c.languages?.map((l) => l.language).filter(Boolean).join(", ") || undefined;
    case "certifications":
      return c.certifications?.length ? `${c.certifications.length} added` : undefined;
  }
}

export function CvEditor({ content: c, onChange, target }: { content: CvContent; onChange: (next: CvContent) => void; target: EditorTarget | null }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(["personal"]));
  const [flash, setFlash] = useState<{ key: string; nonce: number } | null>(null);

  // "Go to" from the score panel: open the section, scroll to the entry or field, flash it.
  useEffect(() => {
    if (!target) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to an outside "go to"
    setOpen((s) => new Set(s).add(target.section));
    if (target.index !== undefined) setFlash({ key: `${target.section}-${target.index}`, nonce: target.nonce });
    const frame = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const entry = target.index !== undefined ? document.querySelector(`[data-entry="${target.section}-${target.index}"]`) : null;
        const field = target.field ? (entry ?? document).querySelector<HTMLElement>(`[data-field="${target.field}"] input, [data-field="${target.field}"] textarea`) : null;
        const el = field ?? entry ?? document.querySelector(`[data-section="${target.section}"]`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
        field?.focus({ preventScroll: true });
      }),
    );
    return () => cancelAnimationFrame(frame);
  }, [target]);

  const toggle = (key: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const set = (patch: Partial<CvContent>) => onChange({ ...c, ...patch });
  const setPersonal = (k: keyof CvContent["personal"], v: string) => set({ personal: { ...c.personal, [k]: v } });
  const exp = c.experience ?? [];
  const edu = c.education ?? [];
  const langs = c.languages ?? [];
  const certs = c.certifications ?? [];
  const setExp = (i: number, p: Partial<Exp>) => set({ experience: exp.map((e, j) => (j === i ? { ...e, ...p } : e)) });
  const setEdu = (i: number, p: Partial<Edu>) => set({ education: edu.map((e, j) => (j === i ? { ...e, ...p } : e)) });
  const setLang = (i: number, p: Partial<Lang>) => set({ languages: langs.map((e, j) => (j === i ? { ...e, ...p } : e)) });
  const setCert = (i: number, p: Partial<Cert>) => set({ certifications: certs.map((e, j) => (j === i ? { ...e, ...p } : e)) });
  const flashOf = (key: string) => (flash?.key === key ? flash.nonce : undefined);

  const body = (key: SectionKey) => {
    switch (key) {
      case "personal":
        return (
          <>
            <Field label="Full name" name="fullName" value={c.personal?.full_name} onChange={(v) => setPersonal("full_name", v)} placeholder="Abebe Kebede" />
            <Field label="Professional title" name="title" value={c.personal?.title} onChange={(v) => setPersonal("title", v)} placeholder="Senior Accountant" />
            <Field label="Email" name="email" type="email" value={c.personal?.email} onChange={(v) => setPersonal("email", v)} placeholder="you@email.com" />
            <Field label="Phone" name="phone" type="tel" value={c.personal?.phone} onChange={(v) => setPersonal("phone", v)} placeholder="+251 9…" />
            <Field label="Location" name="location" value={c.personal?.location} onChange={(v) => setPersonal("location", v)} placeholder="Addis Ababa, Ethiopia" />
          </>
        );
      case "summary":
        return (
          <div data-field="summary">
            <AutoArea minRows={5} value={c.summary ?? ""} onChange={(v) => set({ summary: v })} placeholder="Two or three sentences: who you are, your strongest experience, and what you're looking for." />
            <p className="mt-1.5 text-xs text-hint">Aim for 40 to 80 words.</p>
          </div>
        );
      case "experience":
        return (
          <>
            {exp.map((e, i) => (
              <EntryCard
                key={i}
                entryId={`experience-${i}`}
                flash={flashOf(`experience-${i}`)}
                title={e.role || "New role"}
                meta={[e.company, [e.start_date, e.end_date].filter(Boolean).join(" – ")].filter(Boolean).join(" · ")}
                onRemove={() => set({ experience: exp.filter((_, j) => j !== i) })}
                onMoveUp={i > 0 ? () => set({ experience: move(exp, i, -1) }) : undefined}
                onMoveDown={i < exp.length - 1 ? () => set({ experience: move(exp, i, 1) }) : undefined}
              >
                <Field label="Job title" name="role" value={e.role} onChange={(v) => setExp(i, { role: v })} placeholder="Accountant" />
                <Field label="Company" name="company" value={e.company} onChange={(v) => setExp(i, { company: v })} placeholder="Dashen Bank" />
                <Field label="Location" value={e.location} onChange={(v) => setExp(i, { location: v })} placeholder="Addis Ababa" />
                <div className="grid grid-cols-2 gap-2.5">
                  <MonthField label="Start" value={e.start_date} onChange={(v) => setExp(i, { start_date: v })} />
                  <MonthField label="End" value={isPresent(e.end_date) ? "" : e.end_date} placeholder={isPresent(e.end_date) ? "Present" : "2024-06"} disabled={isPresent(e.end_date)} onChange={(v) => setExp(i, { end_date: v })} />
                </div>
                <CheckboxField label="I currently work here" checked={isPresent(e.end_date)} onChange={(on) => setExp(i, { end_date: on ? "present" : "" })} />
                <BulletList bullets={e.bullets ?? []} onChange={(b) => setExp(i, { bullets: b })} />
              </EntryCard>
            ))}
            <AddButton label="Add a role" onClick={() => set({ experience: [...exp, { role: "", company: "", bullets: [""] }] })} />
          </>
        );
      case "education":
        return (
          <>
            {edu.map((e, i) => (
              <EntryCard
                key={i}
                entryId={`education-${i}`}
                flash={flashOf(`education-${i}`)}
                title={e.degree || e.institution || "New education"}
                meta={[e.institution, e.end_date].filter(Boolean).join(" · ")}
                onRemove={() => set({ education: edu.filter((_, j) => j !== i) })}
                onMoveUp={i > 0 ? () => set({ education: move(edu, i, -1) }) : undefined}
                onMoveDown={i < edu.length - 1 ? () => set({ education: move(edu, i, 1) }) : undefined}
              >
                <Field label="School or university" name="school" value={e.institution} onChange={(v) => setEdu(i, { institution: v })} placeholder="Addis Ababa University" />
                <Field label="Degree" value={e.degree} onChange={(v) => setEdu(i, { degree: v })} placeholder="BA" />
                <Field label="Field of study" value={e.field} onChange={(v) => setEdu(i, { field: v })} placeholder="Accounting and Finance" />
                <div className="grid grid-cols-2 gap-2.5">
                  <MonthField label="Start" value={e.start_date} onChange={(v) => setEdu(i, { start_date: v })} placeholder="2015" />
                  <MonthField label="End" value={e.end_date} onChange={(v) => setEdu(i, { end_date: v })} placeholder="2019" />
                </div>
                <Field label="Honours (optional)" value={e.honors} onChange={(v) => setEdu(i, { honors: v })} placeholder="Great distinction, CGPA 3.7" />
              </EntryCard>
            ))}
            <AddButton label="Add education" onClick={() => set({ education: [...edu, { institution: "", degree: "" }] })} />
          </>
        );
      case "skills":
        return (
          <div data-field="items">
            <TagInput items={c.skills ?? []} onChange={(s) => set({ skills: s })} placeholder="Type a skill and press Enter, e.g. IFRS" />
          </div>
        );
      case "languages":
        return (
          <>
            {langs.map((l, i) => (
              <EntryCard key={i} entryId={`languages-${i}`} flash={flashOf(`languages-${i}`)} title={l.language || "New language"} meta={l.proficiency} onRemove={() => set({ languages: langs.filter((_, j) => j !== i) })}>
                <Field label="Language" value={l.language} onChange={(v) => setLang(i, { language: v })} placeholder="Amharic" />
                <Field label="Level" value={l.proficiency} onChange={(v) => setLang(i, { proficiency: v })} placeholder="Native, Fluent, Good…" />
              </EntryCard>
            ))}
            <AddButton label="Add a language" onClick={() => set({ languages: [...langs, { language: "", proficiency: "" }] })} />
          </>
        );
      case "certifications":
        return (
          <>
            {certs.map((x, i) => (
              <EntryCard
                key={i}
                entryId={`certifications-${i}`}
                flash={flashOf(`certifications-${i}`)}
                title={x.name || "New certificate"}
                meta={[x.issuer, x.date].filter(Boolean).join(" · ")}
                onRemove={() => set({ certifications: certs.filter((_, j) => j !== i) })}
              >
                <Field label="Name" value={x.name} onChange={(v) => setCert(i, { name: v })} placeholder="Certified Public Accountant" />
                <Field label="Issued by" value={x.issuer} onChange={(v) => setCert(i, { issuer: v })} placeholder="ACCA" />
                <MonthField label="Date" value={x.date} onChange={(v) => setCert(i, { date: v })} />
              </EntryCard>
            ))}
            <AddButton label="Add a certificate" onClick={() => set({ certifications: [...certs, { name: "", issuer: "" }] })} />
          </>
        );
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {SECTIONS.map((s) => (
        <SectionCard
          key={s.key}
          id={s.key}
          title={s.title}
          subtitle={summaryLine(c, s.key)}
          icon={s.icon}
          tone={s.tone}
          status={sectionStatus(c, s.key)}
          open={open.has(s.key)}
          onToggle={() => toggle(s.key)}
        >
          {body(s.key)}
        </SectionCard>
      ))}
    </div>
  );
}

export const EDITOR_SECTION_LIST = SECTIONS;
