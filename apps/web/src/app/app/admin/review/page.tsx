"use client";

import clsx from "clsx";
import { Check, ChevronDown, ExternalLink, X } from "lucide-react";
import { useState } from "react";
import { JobCardsSkeleton } from "@/components/skeletons";
import type { ReviewJobDto, TaxonomyDto } from "@ethio/shared";
import { AdminShell } from "@/components/admin/AdminShell";
import { useReviewAction, useReviewQueue } from "@/components/admin/hooks";
import { postedAgo } from "@/components/jobs/JobCard";
import { useTaxonomy } from "@/components/miniapp/hooks";
import { Badge, Button, Card, ErrorText } from "@/components/ui";
import { formatDate } from "@/lib/plans";
import { haptic, openExternal } from "@/lib/telegram";

export default function ReviewPage() {
  const queue = useReviewQueue();
  const taxonomy = useTaxonomy();
  const items = queue.data?.pages.flatMap((p) => p.items) ?? [];
  const total = queue.data?.pages[0]?.total ?? 0;

  return (
    <AdminShell
      title="Review queue"
      subtitle="Approve to publish (matching users get an alert if it's under 48 hours old), or reject to hide it."
    >
      {queue.isPending || taxonomy.isPending ? (
        <div className="mt-5"><JobCardsSkeleton count={3} /></div>
      ) : queue.isError ? (
        <p className="mt-6 px-1 text-sm text-danger">{queue.error.message}</p>
      ) : items.length === 0 ? (
        <Card className="mt-5 text-center">
          <p className="font-semibold">Nothing to review</p>
          <p className="mt-1 text-sm text-hint">Held jobs show up here as they come in.</p>
        </Card>
      ) : (
        <>
          <p className="mt-4 px-1 text-xs font-medium text-hint">{total} waiting</p>
          <div className="mt-2 flex flex-col gap-3">
            {items.map((job) => (
              <ReviewCard key={job.id} job={job} taxonomy={taxonomy.data!} />
            ))}
          </div>
          {queue.hasNextPage && (
            <div className="mt-4">
              <Button variant="secondary" loading={queue.isFetchingNextPage} onClick={() => void queue.fetchNextPage()}>
                Load more
              </Button>
            </div>
          )}
        </>
      )}
    </AdminShell>
  );
}

function ReviewCard({ job, taxonomy }: { job: ReviewJobDto; taxonomy: TaxonomyDto }) {
  const action = useReviewAction();
  const [showPost, setShowPost] = useState(false);
  const [functionId, setFunctionId] = useState("");
  const [professionId, setProfessionId] = useState("");
  const professions = taxonomy.functions.find((f) => f.id === functionId)?.professions ?? [];
  const needsClass = job.unclassified && !functionId;

  const act = (kind: "approve" | "reject") => {
    haptic.select();
    action.mutate(
      { id: job.id, action: kind, ...(kind === "approve" && job.unclassified ? (professionId ? { professionId } : { functionId }) : {}) },
      { onSuccess: () => haptic.success(), onError: () => haptic.error() },
    );
  };

  return (
    <Card>
      <div className="flex flex-wrap gap-1.5">
        {job.reasons.map((r) => (
          <Badge key={r} tone={r === "Couldn't classify" ? "neutral" : "accent"}>
            {r}
          </Badge>
        ))}
        <span className="ml-auto text-xs text-hint-light">{postedAgo(job.firstSeenAt)}</span>
      </div>
      <h2 className="mt-2 text-[16px] font-semibold leading-snug">{job.title}</h2>
      <p className="text-[13px] text-hint">
        {[job.company ?? "Employer not stated", job.employerLabel, job.location, job.deadline ? `closes ${formatDate(job.deadline)}` : null]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <p className="mt-2 text-[14px] leading-relaxed">{job.summary}</p>

      {job.postText && (
        <div className="mt-3">
          <button type="button" onClick={() => setShowPost((v) => !v)} className="inline-flex items-center gap-1 text-[13px] font-semibold text-accent-strong">
            {showPost ? "Hide" : "Show"} the original post
            <ChevronDown className={clsx("size-4 transition-transform", showPost && "rotate-180")} />
          </button>
          {showPost && (
            <pre className="mt-2 max-h-80 overflow-y-auto whitespace-pre-wrap rounded-xl bg-pill p-3 font-sans text-[13px] leading-relaxed text-text">{job.postText}</pre>
          )}
        </div>
      )}
      {job.sourceUrl && (
        <button type="button" onClick={() => openExternal(job.sourceUrl!)} className="mt-2 inline-flex items-center gap-1 text-[13px] text-hint">
          {job.sourceTitle ?? "Source"}
          <ExternalLink className="size-3.5" />
        </button>
      )}

      {job.unclassified && (
        <div className="mt-3 grid gap-2 rounded-xl border border-separator-subtle p-3">
          <p className="text-[13px] font-medium">Who should get this job?</p>
          <select
            value={functionId}
            onChange={(e) => {
              setFunctionId(e.target.value);
              setProfessionId("");
            }}
            className="h-10 rounded-lg border border-separator bg-surface px-2.5 text-[14px]"
          >
            <option value="">Pick a category…</option>
            {taxonomy.functions.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          {functionId && (
            <select value={professionId} onChange={(e) => setProfessionId(e.target.value)} className="h-10 rounded-lg border border-separator bg-surface px-2.5 text-[14px]">
              <option value="">Any profession in this category</option>
              {professions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {action.error && (
        <div className="mt-2">
          <ErrorText>{action.error.message}</ErrorText>
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <Button variant="secondary" className="h-10 w-auto flex-1 text-sm" disabled={action.isPending} onClick={() => act("reject")}>
          <X className="size-4" />
          Reject
        </Button>
        <Button className="h-10 w-auto flex-1 text-sm" loading={action.isPending && action.variables?.action === "approve"} disabled={action.isPending || needsClass} onClick={() => act("approve")}>
          <Check className="size-4" />
          Approve
        </Button>
      </div>
    </Card>
  );
}
