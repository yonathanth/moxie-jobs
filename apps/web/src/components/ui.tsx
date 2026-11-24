import clsx, { type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { AlertCircle, CheckCircle2, Loader2, X } from "lucide-react";
import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Portal } from "./Portal";

/** Class names where later ones win (a caller's "w-auto" overrides the component's "w-full"). */
export function cx(...classes: ClassValue[]): string {
  return twMerge(clsx(classes));
}

/* GoMoxie-style building blocks: white cards with hairline borders, near-black primary buttons, orange accents. */

export function Screen({ children, className }: { children: ReactNode; className?: string }) {
  return <main className={cx("mx-auto w-full max-w-lg px-4 pb-32 pt-5", className)}>{children}</main>;
}

export function PageHeader({ eyebrow, title, subtitle, aside }: { eyebrow?: ReactNode; title: ReactNode; subtitle?: ReactNode; aside?: ReactNode }) {
  return (
    <header className="flex items-start justify-between gap-3 px-1">
      <div className="min-w-0">
        {eyebrow && <p className="text-sm text-hint">{eyebrow}</p>}
        <h1 className="text-[26px] font-bold leading-tight tracking-tight text-text">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] text-hint">{subtitle}</p>}
      </div>
      {aside}
    </header>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("rounded-2xl border border-separator bg-surface p-4 shadow-[0_12px_32px_-24px_rgba(15,17,21,0.25)]", className)}>
      {children}
    </div>
  );
}

export function Section({
  title,
  description,
  aside,
  children,
}: {
  title?: string;
  description?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mt-5">
      {(title || aside) && (
        <div className="mb-2 flex items-baseline justify-between px-1">
          {title && <h2 className="text-[15px] font-semibold text-text">{title}</h2>}
          {aside && <span className="text-xs font-medium text-hint">{aside}</span>}
        </div>
      )}
      <Card>
        {description && <p className="mb-3 text-sm text-hint">{description}</p>}
        {children}
      </Card>
    </section>
  );
}

export function Chip({
  selected,
  disabled,
  muted,
  inactive,
  onClick,
  children,
  onRemove,
}: {
  /** Selected but beyond the plan's limit (not used for matching). */
  inactive?: boolean;
  selected?: boolean;
  disabled?: boolean;
  /** Looks unavailable but stays tappable (e.g. to open a paywall). */
  muted?: boolean;
  onClick?: () => void;
  children: ReactNode;
  onRemove?: () => void;
}) {
  if (onRemove) {
    return (
      <span
        className={cx(
          "inline-flex items-center gap-1 rounded-full py-1.5 pl-3 pr-1.5 text-sm font-medium",
          inactive ? "border border-dashed border-neutral-300 bg-pill text-hint" : "bg-ink text-white",
        )}
        title={inactive ? "Not active on your plan" : undefined}
      >
        {children}
        {inactive && <span className="text-[11px] font-semibold uppercase tracking-wide text-hint-light">inactive</span>}
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove"
          className={cx(
            "grid size-5 place-items-center rounded-full transition-colors",
            inactive ? "bg-neutral-200 hover:bg-neutral-300" : "bg-white/15 hover:bg-white/25",
          )}
        >
          <X className="size-3" strokeWidth={2.5} />
        </button>
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={cx(
        "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
        selected ? "border-ink bg-ink text-white" : "border-separator bg-surface text-text hover:border-neutral-300",
        (disabled || muted) && !selected && "opacity-40",
      )}
    >
      {children}
    </button>
  );
}

export function ChipGroup({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

export function Button({
  variant = "primary",
  loading,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "accent" | "ghost"; loading?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      disabled={disabled || loading}
      className={cx(
        "inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl px-5 text-[15px] font-semibold transition-colors disabled:opacity-50",
        variant === "primary" && "bg-ink text-white hover:bg-ink-hover",
        variant === "accent" && "bg-accent text-white hover:bg-accent-strong",
        variant === "secondary" && "border border-separator bg-surface text-text hover:border-neutral-300 hover:bg-neutral-50",
        variant === "ghost" && "text-hint hover:text-text",
        className,
      )}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

/** Small pill label ("Pro", "Current plan", "Beta"). */
export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "accent" | "emerald" | "ink"; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        tone === "neutral" && "bg-pill text-hint",
        tone === "accent" && "bg-accent-soft text-accent-strong",
        tone === "emerald" && "bg-emerald-soft text-emerald-700",
        tone === "ink" && "bg-ink text-white",
      )}
    >
      {children}
    </span>
  );
}

// Quiet icon tiles: one neutral square for every tone, only the icon carries the colour.
const ICON_TONES = {
  accent: "text-accent-strong",
  sky: "text-sky-600",
  violet: "text-violet-600",
  emerald: "text-emerald-600",
  neutral: "text-neutral-500",
} as const;
export type IconTone = keyof typeof ICON_TONES;

/** Icon in a small neutral tile (hairline border, faint fill); the tone colours the icon. */
export function IconTile({ children, tone = "accent", size = "md" }: { children: ReactNode; tone?: IconTone; size?: "sm" | "md" }) {
  return (
    <span
      className={cx(
        "grid shrink-0 place-items-center border border-separator bg-neutral-50",
        size === "sm" ? "size-9 rounded-lg [&_svg]:size-4" : "size-10 rounded-xl [&_svg]:size-[18px]",
        ICON_TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

/** A shimmering placeholder block while content loads. */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cx("skeleton block rounded-md", className)} />;
}

/** Bottom action bar, always pinned to the screen bottom (portalled, see Portal). Pages keep pb-32+ so content clears it. */
export function StickyFooter({ children }: { children: ReactNode }) {
  return (
    <Portal>
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-separator bg-bg/90 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-lg flex-col gap-2">{children}</div>
      </div>
    </Portal>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      enterKeyHint="search"
      className="h-11 w-full rounded-xl border border-separator bg-surface px-3.5 text-[15px] outline-none transition-colors placeholder:text-hint-light focus:border-ink"
    />
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4">
      <span>
        <span className="block text-[15px] font-medium">{label}</span>
        {description && <span className="mt-0.5 block text-[13px] text-hint">{description}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className={cx(
          "relative h-7 w-12 shrink-0 rounded-full transition-colors after:absolute after:top-0.5 after:size-6 after:rounded-full after:bg-white after:shadow after:transition-all peer-focus-visible:ring-2 peer-focus-visible:ring-accent",
          checked ? "bg-ink after:left-[22px]" : "bg-separator after:left-0.5",
        )}
      />
    </label>
  );
}

/** For actions in progress (a button, "waiting for payment"). Page and list loads use skeletons. */
export function Spinner({ size = "md", light }: { size?: "xs" | "md"; light?: boolean }) {
  return <Loader2 role="status" aria-label="Loading" className={cx("animate-spin", size === "xs" ? "size-3.5" : "size-7", light ? "text-white" : "text-hint-light")} />;
}

export function CenteredMessage({ title, body, icon, children }: { title?: string; body?: string; icon?: ReactNode; children?: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-3 px-6 text-center animate-fade-up">
      {icon}
      {title && <h1 className="text-xl font-bold tracking-tight">{title}</h1>}
      {body && <p className="text-[15px] text-hint">{body}</p>}
      {children && <div className="mt-2 w-full">{children}</div>}
    </main>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return <p className="text-sm text-danger">{children}</p>;
}

/** A bottom sheet over the page (score details, template picker, user details). */
export function Sheet({ title, onClose, children, footer }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  return (
    <Portal>
    <div className="fixed inset-0 z-40 flex items-end justify-center" role="dialog" aria-modal="true">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/40 animate-[fade-in_0.2s_ease-out]" />
      <div className="relative flex max-h-[88dvh] w-full max-w-lg flex-col rounded-t-3xl bg-surface shadow-2xl animate-[sheet-up_0.24s_ease-out]">
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-separator" />
        <div className="flex items-center justify-between px-5 pb-3 pt-2">
          <h2 className="min-w-0 truncate text-lg font-bold tracking-tight">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-full bg-pill text-hint">
            <X className="size-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(20px,env(safe-area-inset-bottom))]">{children}</div>
        {footer && <div className="border-t border-separator px-5 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">{footer}</div>}
      </div>
    </div>
    </Portal>
  );
}

/** A quiet confirmation pill above the bottom bar ("Preferences saved"). Shown while `message` is set. */
export function Toast({ message, tone = "success" }: { message: string | null; tone?: "success" | "error" }) {
  if (!message) return null;
  return (
    <Portal>
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(96px+env(safe-area-inset-bottom))] z-50 flex justify-center px-4" role="status" aria-live="polite">
        <div
          className={cx(
            "inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-[14px] font-medium shadow-[0_12px_32px_-12px_rgba(15,17,21,0.45)] animate-[toast-in_0.25s_ease-out]",
            tone === "success" ? "bg-ink text-white" : "bg-danger text-white",
          )}
        >
          {tone === "success" ? <CheckCircle2 className="size-4 text-emerald-400" /> : <AlertCircle className="size-4" />}
          {message}
        </div>
      </div>
    </Portal>
  );
}

/** Shows a toast message for a couple of seconds. */
export function useToast(ms = 2400): [{ message: string | null; tone: "success" | "error" }, (message: string, tone?: "success" | "error") => void] {
  const [state, setState] = useState<{ message: string | null; tone: "success" | "error"; at: number }>({ message: null, tone: "success", at: 0 });
  useEffect(() => {
    if (!state.message) return;
    const t = setTimeout(() => setState((s) => ({ ...s, message: null })), ms);
    return () => clearTimeout(t);
  }, [state.at, state.message, ms]);
  return [state, (message, tone = "success") => setState({ message, tone, at: Date.now() })];
}
