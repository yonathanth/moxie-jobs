"use client";

import { RowsSkeleton } from "@/components/skeletons";
import { ChevronRight, CreditCard, Inbox, Radio, SlidersHorizontal, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useAdminOverview } from "@/components/admin/hooks";
import { AdminShell } from "@/components/admin/AdminShell";
import { Badge, Card, IconTile } from "@/components/ui";
import { formatBirr } from "@/lib/plans";

export default function AdminHome() {
  const o = useAdminOverview();
  return (
    <AdminShell title="Overview" back="/app">
      {o.isPending ? (
        <div className="mt-5"><RowsSkeleton /></div>
      ) : o.isError ? (
        <p className="mt-6 px-1 text-sm text-danger">{o.error.message}</p>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Stat label="Users" value={o.data.users.total} sub={`${o.data.users.onboarded} set up · +${o.data.users.newThisWeek} this week`} />
            <Stat label="Paying" value={o.data.users.paid} sub={`${formatBirr(o.data.revenue30d)} in 30 days`} />
            <Stat label="Open jobs" value={o.data.jobs.active} sub={`${o.data.jobs.newToday} new today`} />
            <Stat label="Alerts today" value={o.data.alertsToday} sub={o.data.beta ? "Beta: everyone is Pro" : "Beta is off"} />
          </div>

          <div className="mt-5 flex flex-col gap-3">
            <NavCard href="/app/admin/users" icon={Users} title="Users" body={`${o.data.users.total} people · ${o.data.users.paid} paying`} />
            <NavCard
              href="/app/admin/review"
              icon={Inbox}
              title="Review queue"
              body="Jobs held back as suspicious or unclassified"
              badge={o.data.jobs.review ? `${o.data.jobs.review} waiting` : null}
            />
            <NavCard
              href="/app/admin/sources"
              icon={Radio}
              title="Sources"
              body={`${o.data.sources.active} active channels and sites`}
              badge={o.data.sources.joinPending ? `${o.data.sources.joinPending} joining` : null}
            />
            <NavCard href="/app/admin/plans" icon={CreditCard} title="Prices & limits" body="What each plan costs and includes" />
            <NavCard href="/app/admin/settings" icon={SlidersHorizontal} title="Settings" body="Beta, unpaid jobs, alert timing" />
          </div>
        </>
      )}
    </AdminShell>
  );
}

function Stat({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <Card className="p-3.5">
      <p className="text-xs font-medium text-hint">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight">{value.toLocaleString("en-US")}</p>
      <p className="mt-0.5 truncate text-[11px] text-hint">{sub}</p>
    </Card>
  );
}

function NavCard({ href, icon: Icon, title, body, badge }: { href: string; icon: LucideIcon; title: string; body: string; badge?: string | null }) {
  return (
    <Link href={href}>
      <Card className="flex items-center gap-3 transition-colors active:bg-neutral-50">
        <IconTile tone="neutral">
          <Icon className="size-5" />
        </IconTile>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-[15px] font-semibold">{title}</p>
            {badge && <Badge tone="accent">{badge}</Badge>}
          </div>
          <p className="text-[13px] text-hint">{body}</p>
        </div>
        <ChevronRight className="size-4 text-hint-light" />
      </Card>
    </Link>
  );
}
