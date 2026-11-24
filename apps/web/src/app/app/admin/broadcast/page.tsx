"use client";

import { Send } from "lucide-react";
import { useState } from "react";
import type { BroadcastAudience, BroadcastKind } from "@ethio/shared";
import { AdminShell } from "@/components/admin/AdminShell";
import { useBroadcast, useBroadcastAudience } from "@/components/admin/hooks";
import { Button, Card, Chip, ChipGroup, ErrorText, Section, Sheet, StickyFooter, cx } from "@/components/ui";
import { haptic } from "@/lib/telegram";

/**
 * Admin → Broadcast: send one of the bot's marketing pictures by hand, to a
 * group or as a test to yourself. The scheduled ones (12:30 and 19:00) keep
 * running; what's sent here counts in their rotation.
 */

const KINDS: { id: BroadcastKind; title: string; body: string; image: string }[] = [
  { id: "upgrade", title: "Upgrade to Pro", body: "What Pro gives, with the price", image: "/og/msg/upgrade?price=199" },
  { id: "cv", title: "Make and tailor a CV", body: "First CV and first tailored CV free", image: "/og/msg/cv" },
  { id: "packs", title: "CV packs", body: "The three packs and prices", image: "/og/msg/packs?p=99,199,349" },
  { id: "setup", title: "Set up your alerts", body: "For people who haven't finished setup", image: "/og/msg/setup" },
  { id: "premium", title: "A premium job", body: "One NGO, UN, embassy or abroad job, employer hidden", image: "/og/msg/premium" },
];

const AUDIENCES: { id: BroadcastAudience; label: string }[] = [
  { id: "free", label: "Free plan" },
  { id: "paid", label: "Paid plan" },
  { id: "everyone", label: "Everyone set up" },
  { id: "no_cv", label: "Never made a CV" },
  { id: "not_set_up", label: "Not set up yet" },
];

export default function BroadcastPage() {
  const [kind, setKind] = useState<BroadcastKind>("upgrade");
  const [audience, setAudience] = useState<BroadcastAudience>("free");
  const [jobId, setJobId] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const count = useBroadcastAudience(audience);
  const send = useBroadcast();

  const job = jobId.trim().match(/[0-9a-f-]{36}/i)?.[0];
  const ready = kind !== "premium" || !!job;
  const body = { kind, audience, ...(kind === "premium" && job ? { jobId: job } : {}) };
  const n = count.data?.count ?? 0;

  const run = (test: boolean) =>
    send.mutate(
      { ...body, test },
      {
        onSuccess: (r) => {
          haptic.success();
          setConfirm(false);
          setDone(test ? "Test sent to your chat." : `Sending to ${r.count.toLocaleString("en-US")} ${r.count === 1 ? "person" : "people"}. It runs in the background.`);
        },
        onError: () => haptic.error(),
      },
    );

  return (
    <AdminShell title="Broadcast">
      <p className="mt-2 px-1 text-[13px] text-hint">
        Send a marketing picture now. The scheduled ones (12:30 and 19:00) keep running, and what you send here counts in their rotation.
      </p>

      <Section title="Message">
        <div className="flex flex-col gap-2.5">
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              onClick={() => {
                setKind(k.id);
                setDone(null);
                if (k.id === "setup") setAudience("not_set_up");
                else if (audience === "not_set_up") setAudience("free");
              }}
              className={cx(
                "flex items-center gap-3 rounded-2xl border bg-surface p-2.5 text-left transition-colors",
                kind === k.id ? "border-ink ring-1 ring-ink" : "border-separator",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- our own card pictures */}
              <img src={k.image} alt="" loading="lazy" className="aspect-[1200/630] w-28 shrink-0 rounded-lg border border-separator object-cover" />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">{k.title}</span>
                <span className="block text-[12px] text-hint">{k.body}</span>
              </span>
            </button>
          ))}
        </div>
        {kind === "premium" && (
          <Card className="mt-3">
            <label className="block text-[13px] font-semibold">Job link or id</label>
            <input
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
              placeholder="Paste a job link (…/j/<id>) or its id"
              className="mt-2 h-11 w-full rounded-xl border border-separator bg-surface px-3 text-[14px] outline-none focus:border-ink"
            />
            <p className="mt-1.5 text-[12px] text-hint">It must be an open NGO, UN/AU/embassy, international company or abroad job.</p>
          </Card>
        )}
      </Section>

      <Section title="Who gets it">
        <ChipGroup>
          {AUDIENCES.map((a) => (
            <Chip
              key={a.id}
              selected={audience === a.id}
              onClick={() => {
                setAudience(a.id);
                setDone(null);
              }}
            >
              {a.label}
            </Chip>
          ))}
        </ChipGroup>
        <p className="mt-2 px-1 text-[13px] text-hint">
          {count.isPending ? "Counting…" : `${n.toLocaleString("en-US")} ${n === 1 ? "person" : "people"}`}. People who blocked the bot or paused alerts never get it.
        </p>
      </Section>

      <StickyFooter>
        {send.error && <ErrorText>{send.error.message}</ErrorText>}
        {done && !send.error && <p className="text-center text-[13px] font-medium text-emerald">{done}</p>}
        <div className="flex gap-2">
          <Button variant="secondary" className="w-auto flex-1" disabled={!ready} loading={send.isPending && send.variables?.test} onClick={() => run(true)}>
            Test to me
          </Button>
          <Button className="w-auto flex-[2]" disabled={!ready || n === 0 || send.isPending} onClick={() => setConfirm(true)}>
            <Send className="size-4" />
            Send to {n.toLocaleString("en-US")}
          </Button>
        </div>
      </StickyFooter>

      {confirm && (
        <Sheet title="Send this now?" onClose={() => setConfirm(false)}>
          <p className="text-[15px] text-hint">
            {KINDS.find((k) => k.id === kind)?.title} goes to {n.toLocaleString("en-US")} {n === 1 ? "person" : "people"} ({AUDIENCES.find((a) => a.id === audience)?.label.toLowerCase()}). This can&apos;t be undone.
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <Button loading={send.isPending && !send.variables?.test} onClick={() => run(false)}>
              Send to {n.toLocaleString("en-US")}
            </Button>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
          </div>
        </Sheet>
      )}
    </AdminShell>
  );
}
