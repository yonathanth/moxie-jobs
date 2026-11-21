"use client";

import { ArrowDown, ArrowUp, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Plus, Trash2, X, type LucideIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type TextareaHTMLAttributes } from "react";
import { cx, IconTile, type IconTone } from "../../ui";

/**
 * Editor controls, ported from GoMoxie (resume: create-flow/EditorFields.tsx)
 * and sized for phones (15px text, so iOS doesn't zoom on focus).
 */

export const inputClass =
  "w-full rounded-lg border border-neutral-300 bg-white px-3.5 py-2.5 text-[15px] text-text placeholder:text-hint-light focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/10 transition";
export const labelClass = "mb-1.5 block text-xs font-semibold text-neutral-700";

/** A one-line value that wraps instead of scrolling sideways (GoMoxie's GrowingText). */
export function GrowingText({
  value,
  onChange,
  placeholder,
  className = "",
  ...rest
}: { value: string; onChange: (value: string) => void; placeholder?: string; className?: string } & Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "onChange" | "placeholder" | "className"
>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fit = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + (el.offsetHeight - el.clientHeight)}px`;
  };
  useLayoutEffect(fit, [value]);
  return (
    <textarea
      {...rest}
      ref={ref}
      rows={1}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value.replace(/[ \t]*\r?\n[ \t]*/g, " "))}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.preventDefault();
      }}
      className={cx(inputClass, "block resize-none overflow-hidden leading-5", className)}
    />
  );
}

/** A textarea that grows with its text (summary, bullets). */
export function AutoArea({ value, onChange, placeholder, minRows = 3 }: { value: string; onChange: (v: string) => void; placeholder?: string; minRows?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={minRows}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={cx(inputClass, "block resize-none overflow-hidden leading-relaxed")}
    />
  );
}

export function Field({ label, value, onChange, placeholder, type = "text", name }: { label: string; value: string | undefined; onChange: (v: string) => void; placeholder?: string; type?: string; name?: string }) {
  return (
    <label className="block" data-field={name}>
      <span className={labelClass}>{label}</span>
      {type === "text" ? (
        <GrowingText value={value ?? ""} onChange={onChange} placeholder={placeholder} />
      ) : (
        <input type={type} value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={inputClass} />
      )}
    </label>
  );
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parseMonth(value: string): { year: number; month: number | null } | null {
  const text = value.trim();
  let m = /^(\d{4})-(\d{1,2})$/.exec(text);
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) return { year: Number(m[1]), month: Number(m[2]) - 1 };
  m = /(\d{4})/.exec(text);
  return m ? { year: Number(m[1]), month: null } : null;
}

/** Month + year (or just the year), typed or picked (GoMoxie's MonthField). */
export function MonthField({ label, value, onChange, placeholder = "2023-01", disabled = false }: { label: string; value: string | undefined; onChange: (v: string) => void; placeholder?: string; disabled?: boolean }) {
  const v = value ?? "";
  const [open, setOpen] = useState(false);
  const parsed = parseMonth(v);
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(parsed?.year ?? thisYear);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const pick = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <div className="block" ref={box}>
      <span className={labelClass}>{label}</span>
      <div className="relative">
        <input type="text" value={v} placeholder={placeholder} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={cx(inputClass, "pr-10 disabled:bg-neutral-50 disabled:text-hint-light")} />
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setYear(parseMonth(v)?.year ?? thisYear);
            setOpen((o) => !o);
          }}
          aria-label={`Pick ${label.toLowerCase()} date`}
          className={cx(
            "absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 transition-colors disabled:opacity-40",
            open ? "bg-accent-soft text-accent-strong" : "text-hint-light hover:bg-neutral-100 hover:text-text",
          )}
        >
          <CalendarDays className="size-4" />
        </button>
        {open && (
          <div role="dialog" className="absolute right-0 z-30 mt-1.5 w-64 rounded-lg border border-neutral-200 bg-white p-3 shadow-lg">
            <div className="mb-2 flex items-center justify-between">
              <button type="button" onClick={() => setYear((y) => y - 1)} className="rounded-md p-1.5 text-hint hover:bg-neutral-100" aria-label="Previous year">
                <ChevronLeft className="size-4" />
              </button>
              <span className="text-sm font-semibold tabular-nums">{year}</span>
              <button type="button" onClick={() => setYear((y) => y + 1)} disabled={year >= thisYear + 10} className="rounded-md p-1.5 text-hint hover:bg-neutral-100 disabled:opacity-30" aria-label="Next year">
                <ChevronRight className="size-4" />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {MONTH_NAMES.map((m, i) => {
                const selected = parsed?.year === year && parsed.month === i;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => pick(`${year}-${String(i + 1).padStart(2, "0")}`)}
                    className={cx("rounded-md py-2 text-xs font-semibold transition-colors", selected ? "bg-ink text-white" : "text-neutral-700 hover:bg-accent-soft hover:text-accent-strong")}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
            <div className="mt-2.5 flex items-center justify-between border-t border-neutral-100 pt-2.5">
              <button type="button" onClick={() => pick(String(year))} className={cx("text-xs font-semibold", parsed?.year === year && parsed.month === null ? "text-accent-strong" : "text-neutral-600")}>
                Just the year ({year})
              </button>
              {v && (
                <button type="button" onClick={() => pick("")} className="text-xs font-semibold text-hint-light hover:text-danger">
                  Clear
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function CheckboxField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="inline-flex cursor-pointer select-none items-center gap-2 text-sm text-neutral-700">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 rounded border-neutral-300 accent-[var(--accent)]" />
      {label}
    </label>
  );
}

/** One section of the editor: an icon tile + title row that opens and closes its fields. */
export function SectionCard({
  id,
  title,
  subtitle,
  icon: Icon,
  tone,
  open,
  onToggle,
  status,
  children,
}: {
  id: string;
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  tone: IconTone;
  open: boolean;
  onToggle: () => void;
  /** done | partial | empty: a small mark beside the title, as on GoMoxie's section chips. */
  status?: "done" | "partial" | "empty";
  children: ReactNode;
}) {
  return (
    <section data-section={id} className="scroll-mt-4 overflow-hidden rounded-2xl border border-separator bg-surface shadow-[0_1px_2px_rgba(15,17,21,0.04)]">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
        <IconTile tone={tone} size="sm">
          <Icon />
        </IconTile>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="text-[15px] font-bold tracking-tight">{title}</span>
            {status === "partial" && <span className="size-1.5 rounded-full bg-amber-500" aria-label="Missing details" />}
            {status === "empty" && <span className="rounded-full border border-dashed border-neutral-300 px-1.5 text-[10px] font-semibold text-hint">Add</span>}
          </span>
          {subtitle && <span className="block truncate text-xs text-hint">{subtitle}</span>}
        </span>
        <ChevronDown className={cx("size-4 shrink-0 text-hint-light transition-transform", open ? "" : "-rotate-90")} />
      </button>
      {open && <div className="space-y-4 border-t border-separator-subtle px-4 pb-4 pt-4">{children}</div>}
    </section>
  );
}

const iconButtonClass = "rounded-md p-1.5 text-hint-light transition-colors hover:bg-neutral-100 hover:text-text disabled:opacity-30 disabled:hover:bg-transparent";

/** One entry (a role, a degree…): collapsible, reorderable, removable (GoMoxie's EntryCard). */
export function EntryCard({
  title,
  meta,
  onRemove,
  onMoveUp,
  onMoveDown,
  entryId,
  flash,
  children,
}: {
  title: string;
  meta?: string;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  entryId?: string;
  /** Changes when "Go to" picks this entry: it opens and flashes. */
  flash?: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const [flashing, setFlashing] = useState(false);
  useEffect(() => {
    if (!flash) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to an outside "go to"
    setOpen(true);
    setFlashing(true);
    const t = setTimeout(() => setFlashing(false), 1600);
    return () => clearTimeout(t);
  }, [flash]);
  return (
    <div data-entry={entryId} className={cx("scroll-mt-4 rounded-lg border bg-white transition-colors duration-700", flashing ? "border-accent-border bg-accent-soft/30" : "border-neutral-300")}>
      <div className="flex items-center gap-1 py-2 pl-3 pr-1.5">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <ChevronDown className={cx("size-4 shrink-0 text-hint-light transition-transform", open ? "" : "-rotate-90")} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{title}</span>
            {meta && <span className="block truncate text-xs text-hint">{meta}</span>}
          </span>
        </button>
        {(onMoveUp || onMoveDown) && (
          <>
            <button type="button" onClick={onMoveUp} disabled={!onMoveUp} className={iconButtonClass} aria-label="Move up">
              <ArrowUp className="size-4" />
            </button>
            <button type="button" onClick={onMoveDown} disabled={!onMoveDown} className={iconButtonClass} aria-label="Move down">
              <ArrowDown className="size-4" />
            </button>
          </>
        )}
        <button type="button" onClick={onRemove} className={cx(iconButtonClass, "hover:bg-red-50 hover:text-red-600")} aria-label={`Remove ${title}`}>
          <Trash2 className="size-4" />
        </button>
      </div>
      {open && <div className="space-y-3.5 border-t border-neutral-200 px-3 pb-3.5 pt-3">{children}</div>}
    </div>
  );
}

/** A dashed full-width "add another" button under a list. */
export function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-neutral-300 py-3 text-sm font-semibold text-neutral-600 transition-colors hover:border-accent-border hover:bg-accent-soft/50 hover:text-accent-strong"
    >
      <Plus className="size-4" />
      {label}
    </button>
  );
}

/** Bullet points of a role, one box each. */
export function BulletList({ bullets, onChange }: { bullets: string[]; onChange: (b: string[]) => void }) {
  return (
    <div className="space-y-2.5 border-t border-neutral-200 pt-3.5" data-field="bullets">
      <span className={labelClass}>What you did and achieved</span>
      {bullets.map((b, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="mt-[18px] size-1.5 shrink-0 rounded-full bg-neutral-400" />
          <div className="flex-1">
            <AutoArea minRows={2} value={b} onChange={(v) => onChange(bullets.map((x, j) => (j === i ? v : x)))} placeholder="What you did and the result, e.g. Cut month-end closing from 10 to 6 days" />
          </div>
          <button type="button" onClick={() => onChange(bullets.filter((_, j) => j !== i))} className={cx(iconButtonClass, "mt-1.5 hover:bg-red-50 hover:text-red-600")} aria-label="Remove bullet">
            <Trash2 className="size-4" />
          </button>
        </div>
      ))}
      <AddButton label="Add a bullet point" onClick={() => onChange([...bullets, ""])} />
    </div>
  );
}

/** Tags added with Enter or comma; pasting "a, b, c" adds all three (GoMoxie's TagInput). */
export function TagInput({ items, onChange, placeholder }: { items: string[]; onChange: (items: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState("");
  const commit = (raw: string) => {
    const additions = raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s && !items.some((i) => i.toLowerCase() === s.toLowerCase()));
    if (additions.length) onChange([...items, ...additions]);
    setDraft("");
  };
  return (
    <div className="space-y-2.5">
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item) => (
            <span key={item} className="inline-flex items-center gap-1 rounded-md border border-neutral-300 bg-neutral-50 py-1 pl-2.5 pr-1 text-sm font-medium text-neutral-800">
              {item}
              <button type="button" onClick={() => onChange(items.filter((i) => i !== item))} className="rounded p-0.5 text-hint-light hover:bg-neutral-200/70 hover:text-text" aria-label={`Remove ${item}`}>
                <X className="size-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        type="text"
        value={draft}
        placeholder={placeholder}
        enterKeyHint="done"
        onChange={(e) => (e.target.value.includes(",") ? commit(e.target.value) : setDraft(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(draft);
          }
        }}
        onBlur={() => draft.trim() && commit(draft)}
        className={inputClass}
      />
    </div>
  );
}
