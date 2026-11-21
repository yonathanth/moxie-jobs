"use client";

import clsx from "clsx";
import { Globe, Plus, Send } from "lucide-react";
import { useMemo, useState } from "react";
import { RowsSkeleton } from "@/components/skeletons";
import type { AdminSourceDto } from "@ethio/shared";
import { AdminShell } from "@/components/admin/AdminShell";
import { useAdminSources, useSourceActions } from "@/components/admin/hooks";
import { postedAgo } from "@/components/jobs/JobCard";
import { Badge, Button, Card, ErrorText, Toggle } from "@/components/ui";
import { channelHandle } from "@/components/admin/channel";
import { ApiError } from "@/lib/api";
import { haptic } from "@/lib/telegram";

export default function SourcesPage() {
  const sources = useAdminSources();
  const groups = useMemo(() => {
    const all = sources.data ?? [];
    return {
      active: all.filter((s) => s.isActive && s.joined),
      joining: all.filter((s) => s.joinPending),
      off: all.filter((s) => !s.isActive),
    };
  }, [sources.data]);

  return (
    <AdminShell title="Sources" subtitle="Where jobs come from. New channels are joined by the worker, one every few minutes.">
      <AddChannel />
      {sources.isPending ? (
        <div className="mt-5"><RowsSkeleton count={6} /></div>
      ) : sources.isError ? (
        <p className="mt-6 px-1 text-sm text-danger">{sources.error.message}</p>
      ) : (
        <>
          {groups.joining.length > 0 && <Group title="Joining" items={groups.joining} />}
          <Group title="Active" items={groups.active} />
          {groups.off.length > 0 && <Group title="Off" items={groups.off} />}
        </>
      )}
    </AdminShell>
  );
}

function AddChannel() {
  const { add } = useSourceActions();
  const [handle, setHandle] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const submit = () => {
    const h = channelHandle(handle);
    if (!h) return;
    add.mutate(h, {
      onSuccess: () => {
        haptic.success();
        setDone(`@${h} added. The worker joins it within a few minutes.`);
        setHandle("");
      },
      onError: () => haptic.error(),
    });
  };
  return (
    <Card className="mt-5">
      <p className="text-[15px] font-semibold">Add a Telegram channel</p>
      <div className="mt-3 flex gap-2">
        <input
          value={handle}
          onChange={(e) => {
            setHandle(e.target.value);
            setDone(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="@channel or t.me/channel"
          autoComplete="off"
          className="h-11 min-w-0 flex-1 rounded-xl border border-separator bg-surface px-3.5 text-[15px] outline-none placeholder:text-hint-light focus:border-ink"
        />
        <Button className="w-auto px-4" loading={add.isPending} onClick={submit}>
          <Plus className="size-4" />
          Add
        </Button>
      </div>
      {add.error && (
        <div className="mt-2">
          <ErrorText>
            {add.error instanceof ApiError && add.error.issues.length ? add.error.issues.map((i) => i.message).join(". ") : add.error.message}
          </ErrorText>
        </div>
      )}
      {done && <p className="mt-2 text-[13px] text-hint">{done}</p>}
    </Card>
  );
}

function Group({ title, items }: { title: string; items: AdminSourceDto[] }) {
  return (
    <section className="mt-5">
      <h2 className="mb-2 px-1 text-[15px] font-semibold">
        {title} <span className="font-normal text-hint">({items.length})</span>
      </h2>
      <div className="flex flex-col gap-2">
        {items.map((s) => (
          <SourceRow key={s.id} s={s} />
        ))}
      </div>
    </section>
  );
}

function SourceRow({ s }: { s: AdminSourceDto }) {
  const { patch } = useSourceActions();
  const [open, setOpen] = useState(false);
  const [trust, setTrust] = useState(String(s.trust));
  const [priority, setPriority] = useState(String(s.linkPriority));
  const quiet = s.isActive && s.joined && s.posts7d === 0;

  return (
    <Card className="p-3.5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-pill text-hint">
          {s.kind === "website" ? <Globe className="size-4" /> : <Send className="size-4" />}
        </span>
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen((v) => !v)}>
          <p className="truncate text-[14px] font-semibold">{s.title}</p>
          <p className="truncate text-[12px] text-hint">
            {[s.handle ? `@${s.handle}` : s.kind, `tier ${s.tier}`, s.type].join(" · ")}
          </p>
          <p className={clsx("mt-1 text-[12px]", quiet ? "text-accent-strong" : "text-hint")}>
            {s.posts7d} posts · {s.jobs7d} new jobs this week{s.lastPostAt ? ` · last ${postedAgo(s.lastPostAt).toLowerCase()}` : ""}
          </p>
          {s.notes?.startsWith("Join failed") && <p className="mt-1 text-[12px] text-danger">{s.notes}</p>}
        </button>
        {s.joinPending ? (
          <Badge tone="accent">Joining</Badge>
        ) : (
          <div className="shrink-0">
            <Toggle
              label=""
              checked={s.isActive}
              onChange={(isActive) => {
                haptic.select();
                patch.mutate({ id: s.id, body: { isActive } });
              }}
            />
          </div>
        )}
      </div>
      {open && (
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-separator-subtle pt-3">
          <label className="text-[12px] text-hint">
            Trust (0–1)
            <input value={trust} onChange={(e) => setTrust(e.target.value)} inputMode="decimal" className="mt-1 h-9 w-full rounded-lg border border-separator px-2.5 text-[14px] text-text" />
          </label>
          <label className="text-[12px] text-hint">
            Link priority (0–100)
            <input value={priority} onChange={(e) => setPriority(e.target.value)} inputMode="numeric" className="mt-1 h-9 w-full rounded-lg border border-separator px-2.5 text-[14px] text-text" />
          </label>
          <p className="col-span-2 text-[11px] text-hint">Higher priority wins the job&apos;s link when several sources post the same job.</p>
          <div className="col-span-2">
            <Button
              className="h-9 text-sm"
              loading={patch.isPending}
              onClick={() => patch.mutate({ id: s.id, body: { trust: Math.min(1, Math.max(0, Number(trust) || 0)), linkPriority: Math.min(100, Math.max(0, Math.round(Number(priority) || 0))) } })}
            >
              Save
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
