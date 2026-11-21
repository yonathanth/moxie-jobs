"use client";

import { BellOff, Ban, Crown, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { RowsSkeleton } from "@/components/skeletons";
import { PLAN_NAME, PLAN_RANK, type AdminUserDetail, type AdminUserPlanFilter, type AdminUserRow, type AdminUserStatusFilter } from "@ethio/shared";
import { AdminShell } from "@/components/admin/AdminShell";
import { useAdminUser, useAdminUsers, useGrantPlan, type UsersFilter } from "@/components/admin/hooks";
import { postedAgo } from "@/components/jobs/JobCard";
import { Badge, Button, Card, Chip, ChipGroup, ErrorText, Spinner, cx } from "@/components/ui";
import { formatBirr, formatDate } from "@/lib/plans";
import { haptic } from "@/lib/telegram";

const PLAN_CHIPS: [AdminUserPlanFilter, string][] = [
  ["all", "All plans"],
  ["free", "Free"],
  ["pro", "Pro"],
  ["career", "Career"],
  ["expired", "Expired"],
];
const STATUS_CHIPS: [AdminUserStatusFilter, string][] = [
  ["all", "Any status"],
  ["set_up", "Set up"],
  ["not_set_up", "Not set up"],
  ["paused", "Paused"],
  ["blocked", "Blocked the bot"],
];
const JOINED_CHIPS: [UsersFilter["joined"], string][] = [
  ["", "Any time"],
  ["7d", "Joined this week"],
  ["30d", "Joined this month"],
];

export default function UsersPage() {
  const [filter, setFilter] = useState<UsersFilter>({ q: "", plan: "all", status: "all", joined: "" });
  const [qInput, setQInput] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const users = useAdminUsers(filter);
  const items = users.data?.pages.flatMap((p) => p.items) ?? [];
  const total = users.data?.pages[0]?.total ?? 0;

  // Debounced search.
  useEffect(() => {
    const t = setTimeout(() => setFilter((f) => (f.q === qInput ? f : { ...f, q: qInput })), 350);
    return () => clearTimeout(t);
  }, [qInput]);

  // Infinite scroll: load the next page when the sentinel comes into view.
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && users.hasNextPage && !users.isFetchingNextPage) void users.fetchNextPage();
    });
    io.observe(el);
    return () => io.disconnect();
  }, [users]);

  return (
    <AdminShell title="Users">
      <div className="relative mt-5">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-hint-light" />
        <input
          type="search"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          placeholder="Name, @username or Telegram ID"
          className="h-11 w-full rounded-xl border border-separator bg-surface pl-10 pr-3.5 text-[15px] outline-none placeholder:text-hint-light focus:border-ink"
        />
      </div>
      <div className="mt-3 flex flex-col gap-2">
        <FilterRow options={PLAN_CHIPS} value={filter.plan} onChange={(plan) => setFilter((f) => ({ ...f, plan }))} />
        <FilterRow options={STATUS_CHIPS} value={filter.status} onChange={(status) => setFilter((f) => ({ ...f, status }))} />
        <FilterRow options={JOINED_CHIPS} value={filter.joined} onChange={(joined) => setFilter((f) => ({ ...f, joined }))} />
      </div>

      {users.isPending ? (
        <div className="mt-4"><RowsSkeleton count={6} /></div>
      ) : users.isError ? (
        <p className="mt-6 px-1 text-sm text-danger">{users.error.message}</p>
      ) : (
        <>
          <p className="mt-4 px-1 text-xs font-medium text-hint">
            {total.toLocaleString("en-US")} {total === 1 ? "user" : "users"}
          </p>
          <div className={cx("mt-2 flex flex-col gap-2 transition-opacity", users.isPlaceholderData && "opacity-60")}>
            {items.map((u) => (
              <UserRow key={u.id} u={u} onOpen={() => setOpenId(u.id)} />
            ))}
            {items.length === 0 && <Card className="text-center text-sm text-hint">No users match these filters.</Card>}
          </div>
          <div ref={sentinel} className="py-6 text-center">
            {users.isFetchingNextPage && <Spinner />}
          </div>
        </>
      )}

      {openId && <UserSheet id={openId} onClose={() => setOpenId(null)} />}
    </AdminShell>
  );
}

function FilterRow<T extends string>({ options, value, onChange }: { options: [T, string][]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
      {options.map(([v, label]) => (
        <span key={v} className="shrink-0">
          <Chip selected={value === v} onClick={() => onChange(v)}>
            {label}
          </Chip>
        </span>
      ))}
    </div>
  );
}

function PlanBadge({ u }: { u: Pick<AdminUserRow, "plan" | "expired"> }) {
  if (u.plan !== "free")
    return (
      <Badge tone="ink">
        <Crown className="size-3" />
        {PLAN_NAME[u.plan]}
      </Badge>
    );
  return u.expired ? <Badge tone="accent">Expired</Badge> : <Badge>Free</Badge>;
}

function UserRow({ u, onOpen }: { u: AdminUserRow; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="block text-left">
      <Card className="flex items-center gap-3 p-3.5 transition-colors active:bg-neutral-50">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-pill text-[15px] font-semibold text-hint">{u.name.slice(0, 1).toUpperCase()}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-[15px] font-semibold">{u.name}</p>
            {u.blocked && <Ban className="size-3.5 shrink-0 text-danger" aria-label="Blocked the bot" />}
            {u.alertsPaused && <BellOff className="size-3.5 shrink-0 text-hint" aria-label="Alerts paused" />}
          </div>
          <p className="truncate text-[12px] text-hint">
            {[u.username ? `@${u.username}` : null, u.onboarded ? `${u.alerts7d} alerts this week` : "Not set up", `joined ${postedAgo(u.createdAt).toLowerCase()}`]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <PlanBadge u={u} />
      </Card>
    </button>
  );
}

function UserSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const user = useAdminUser(id);
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center" role="dialog" aria-modal="true" aria-label="User">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className="relative flex max-h-[90dvh] w-full max-w-lg flex-col rounded-t-3xl bg-surface animate-fade-up">
        <div className="flex items-center justify-between border-b border-separator-subtle px-5 py-4">
          <h2 className="truncate text-lg font-bold tracking-tight">{user.data?.name ?? "User"}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-full bg-pill text-hint">
            <X className="size-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-4">
          {user.isPending ? (
            <RowsSkeleton count={3} />
          ) : user.isError ? (
            <ErrorText>{user.error.message}</ErrorText>
          ) : (
            <UserDetail u={user.data} />
          )}
        </div>
      </div>
    </div>
  );
}

function UserDetail({ u }: { u: AdminUserDetail }) {
  const rows: [string, string][] = [
    ["Telegram", `${u.username ? `@${u.username} · ` : ""}${u.telegramId}`],
    ["Joined", `${formatDate(u.createdAt)}${u.startParam ? ` · via "${u.startParam}"` : ""}`],
    ["Last seen", u.lastSeenAt ? postedAgo(u.lastSeenAt) : "Never"],
    ["Status", [u.onboarded ? "Set up" : "Not set up", u.alertsPaused ? "alerts paused" : null, u.blocked ? "blocked the bot" : null].filter(Boolean).join(", ")],
    ["Alerts", `${u.stats.alertsTotal} sent (${u.alerts7d} this week) · ${u.stats.clicksTotal} apply clicks · ${u.stats.lockedTotal} premium held back`],
  ];
  const prefs: [string, string[] | string | null][] = u.preferences
    ? [
        ["Professions", u.preferences.professions],
        ["Categories", u.preferences.categories],
        ["Degrees", u.preferences.degrees],
        ["Cities", u.preferences.cities.length ? u.preferences.cities : "Anywhere in Ethiopia"],
        ["Experience", u.preferences.experience],
        ["Salary", u.preferences.salary],
      ]
    : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <PlanBadge u={u} />
        {u.planExpiresAt && <span className="text-[13px] text-hint">until {formatDate(u.planExpiresAt)}</span>}
      </div>

      <dl className="flex flex-col divide-y divide-separator-subtle">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-3 py-2">
            <dt className="w-24 shrink-0 text-[13px] text-hint">{k}</dt>
            <dd className="min-w-0 flex-1 text-[14px]">{v}</dd>
          </div>
        ))}
      </dl>

      {prefs.length > 0 && (
        <section>
          <h3 className="mb-1 text-[13px] font-semibold text-hint">Preferences</h3>
          <dl className="flex flex-col divide-y divide-separator-subtle">
            {prefs.map(([k, v]) => (
              <div key={k} className="flex gap-3 py-2">
                <dt className="w-24 shrink-0 text-[13px] text-hint">{k}</dt>
                <dd className="min-w-0 flex-1 text-[14px]">{Array.isArray(v) ? v.join(", ") || "—" : (v ?? "—")}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <PlanActions u={u} />

      <section>
        <h3 className="mb-1 text-[13px] font-semibold text-hint">Payments &amp; plan changes</h3>
        {u.payments.length === 0 ? (
          <p className="text-[14px] text-hint">None yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-separator-subtle">
            {u.payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2 text-[14px]">
                {p.byAdmin ? (
                  <span className="min-w-0">
                    {p.status === "removed" ? `${PLAN_NAME[p.plan as "pro"] ?? p.plan} removed` : `${PLAN_NAME[p.plan as "pro"] ?? p.plan} given · ${p.period}`}
                    <span className="block text-[12px] text-hint">by {p.byAdmin}</span>
                  </span>
                ) : (
                  <span>
                    {PLAN_NAME[p.plan as "pro"] ?? p.plan} · {p.period} · {formatBirr(p.amount)}
                  </span>
                )}
                <span className="shrink-0 text-[12px] text-hint">
                  {p.byAdmin ? "admin" : p.status} · {formatDate(p.paidAt ?? p.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PlanActions({ u }: { u: AdminUserDetail }) {
  const grant = useGrantPlan(u.id);
  const [plan, setPlan] = useState<"pro" | "career">(u.plan === "career" ? "career" : "pro");
  const [days, setDays] = useState("30");
  const n = Math.min(366, Math.max(0, Number(days.replace(/\D/g, "")) || 0));
  // Giving a lower plan than the active one replaces it now: they lose the rest of the better plan.
  const downgrade = u.plan !== "free" && PLAN_RANK[plan] < PLAN_RANK[u.plan];

  return (
    <Card className="bg-pill/40">
      <h3 className="text-[14px] font-semibold">Give or extend a plan</h3>
      <p className="mt-0.5 text-[12px] text-hint">For support or compensation. The same plan is extended from its end; a different one starts now. They get the usual &ldquo;plan is active&rdquo; message.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ChipGroup>
          {(["pro", "career"] as const).map((p) => (
            <Chip key={p} selected={plan === p} onClick={() => setPlan(p)}>
              {PLAN_NAME[p]}
            </Chip>
          ))}
        </ChipGroup>
        <label className="flex items-center gap-2 text-[13px] text-hint">
          for
          <input inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} className="h-9 w-16 rounded-lg border border-separator bg-surface px-2 text-center text-[14px] text-text" />
          days
        </label>
      </div>
      {downgrade && u.planExpiresAt && (
        <p className="mt-3 rounded-xl border border-accent-border bg-accent-soft px-3 py-2 text-[13px] text-accent-strong">
          They have {PLAN_NAME[u.plan]} until {formatDate(u.planExpiresAt)}. Giving {PLAN_NAME[plan]} replaces it now, and they lose the rest of their{" "}
          {PLAN_NAME[u.plan]} time.
        </p>
      )}
      {grant.error && (
        <div className="mt-2">
          <ErrorText>{grant.error.message}</ErrorText>
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <Button
          className="h-10 flex-[2] text-sm"
          loading={grant.isPending && grant.variables?.plan !== "free"}
          disabled={n < 1 || grant.isPending}
          onClick={() => {
            if (downgrade && !window.confirm(`Replace ${u.name}'s ${PLAN_NAME[u.plan]} with ${PLAN_NAME[plan]} for ${n} days, starting now?`)) return;
            grant.mutate({ plan, days: n }, { onSuccess: () => haptic.success() });
          }}
        >
          {downgrade ? "Replace with" : "Give"} {PLAN_NAME[plan]} · {n} days
        </Button>
        {u.plan !== "free" && (
          <Button
            variant="secondary"
            className="h-10 flex-1 text-sm"
            loading={grant.isPending && grant.variables?.plan === "free"}
            disabled={grant.isPending}
            onClick={() => {
              if (window.confirm(`Remove ${PLAN_NAME[u.plan]} from ${u.name}? They go back to Free now.`)) grant.mutate({ plan: "free" });
            }}
          >
            Remove plan
          </Button>
        )}
      </div>
    </Card>
  );
}
