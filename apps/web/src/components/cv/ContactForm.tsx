"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import type { CvContact } from "@ethio/shared";
import { ApiError } from "@/lib/api";
import { useSaveCvContact } from "../miniapp/hooks";
import { useSession } from "../miniapp/session";
import { Button, ErrorText, StickyFooter } from "../ui";

/** Name from Telegram as a starting point ("Dev" is the local dev login, not a name). */
function telegramName(first: string | null, last: string | null): string {
  const n = [first, last].filter(Boolean).join(" ");
  return n === "Dev" ? "" : n;
}

/** Country codes people here are most likely to need; Ethiopia first (the default). */
const DIAL_CODES = [
  { code: "+251", country: "ET" },
  { code: "+254", country: "KE" },
  { code: "+252", country: "SO" },
  { code: "+253", country: "DJ" },
  { code: "+249", country: "SD" },
  { code: "+211", country: "SS" },
  { code: "+256", country: "UG" },
  { code: "+971", country: "AE" },
  { code: "+966", country: "SA" },
  { code: "+974", country: "QA" },
  { code: "+44", country: "GB" },
  { code: "+1", country: "US" },
] as const;

/** "+251 911 234 567" → { code: "+251", local: "911 234 567" }. Unknown codes keep the whole number local. */
function splitPhone(phone: string | null): { code: string; local: string } {
  if (!phone) return { code: "+251", local: "" };
  const known = DIAL_CODES.find((d) => phone.replace(/\s/g, "").startsWith(d.code));
  if (known) return { code: known.code, local: phone.replace(/\s/g, "").slice(known.code.length).replace(/^0/, "") };
  return { code: "+251", local: phone.replace(/^0/, "") };
}

/**
 * Personal details printed on every CV. Used once in the CV flow (first CV) and in Profile → CV details.
 * `sticky` puts the button in the bottom bar (full pages); otherwise it sits under the fields (sheets).
 */
export function ContactForm({ submitLabel, onSaved, sticky }: { submitLabel: string; onSaved?: (c: CvContact) => void; sticky?: boolean }) {
  const { me } = useSession();
  const save = useSaveCvContact();
  const c = me.cvContact;
  const initialPhone = splitPhone(c?.phone ?? null);
  const [name, setName] = useState(c?.name ?? telegramName(me.firstName, me.lastName));
  const [dial, setDial] = useState(initialPhone.code);
  const [phone, setPhone] = useState(initialPhone.local);
  const [email, setEmail] = useState(c?.email ?? "");
  const [location, setLocation] = useState(c?.location ?? "Addis Ababa, Ethiopia");

  const submit = () => {
    const local = phone.replace(/[^\d]/g, "").replace(/^0/, "");
    const body: CvContact = {
      name: name.trim(),
      email: email.trim() || null,
      phone: local ? `${dial} ${local}` : null,
      location: location.trim() || null,
    };
    save.mutate(body, { onSuccess: () => onSaved?.(body) });
  };

  const error = save.error && (
    <ErrorText>{save.error instanceof ApiError && save.error.issues.length ? save.error.issues.map((i) => i.message).join(". ") : save.error.message}</ErrorText>
  );
  const button = (
    <Button loading={save.isPending} disabled={name.trim().length < 2} onClick={submit}>
      {submitLabel}
    </Button>
  );

  return (
    <div className="grid gap-3.5">
      <Field label="Full name" value={name} onChange={setName} placeholder="e.g. Abebe Kebede" autoComplete="name" />

      <label className="block text-[12px] font-medium text-hint">
        Phone
        <div className="mt-1 flex h-11 overflow-hidden rounded-xl border border-separator bg-surface focus-within:border-ink">
          <span className="relative flex shrink-0 items-center border-r border-separator bg-neutral-50">
            <select
              aria-label="Country code"
              value={dial}
              onChange={(e) => setDial(e.target.value)}
              className="h-full appearance-none bg-transparent pl-3 pr-7 text-[15px] font-medium text-text outline-none"
            >
              {DIAL_CODES.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.country} {d.code}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 size-3.5 text-hint" />
          </span>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="911 234 567"
            className="min-w-0 flex-1 bg-transparent px-3 text-[15px] text-text outline-none placeholder:text-hint-light"
          />
        </div>
      </label>

      <div className="grid grid-cols-1 gap-3.5 min-[400px]:grid-cols-2">
        <Field label="Email" value={email} onChange={setEmail} placeholder="you@email.com" type="email" autoComplete="email" />
        <Field label="City" value={location} onChange={setLocation} placeholder="Addis Ababa" autoComplete="address-level2" />
      </div>

      {sticky ? (
        <StickyFooter>
          {error}
          {button}
        </StickyFooter>
      ) : (
        <>
          {error}
          <div className="mt-1">{button}</div>
        </>
      )}
    </div>
  );
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <label className="block text-[12px] font-medium text-hint">
      {label}
      <input
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 h-11 w-full rounded-xl border border-separator bg-surface px-3.5 text-[15px] text-text outline-none placeholder:text-hint-light focus:border-ink"
      />
    </label>
  );
}

/** One line summary: "Abebe Kebede · +251… · abebe@…". */
export function contactLine(c: CvContact): string {
  return [c.name, c.phone, c.email, c.location].filter(Boolean).join(" · ");
}
