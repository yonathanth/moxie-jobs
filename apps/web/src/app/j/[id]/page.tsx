import { BellRing, Briefcase, Clock, FileText, GraduationCap, MapPin, Radar, Send, Wallet } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { PublicJobDto } from "@ethio/shared";
import { APP_NAME, BOT_URL, botJobLink } from "@/lib/config";
import { getPublicJob, jobHeadline, shortDate } from "@/lib/publicJob";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const job = await getPublicJob((await params).id);
  if (!job) return { title: "Job not found", robots: { index: false } };
  const facts = [job.location, job.jobType, job.deadline && !job.closed ? `Apply by ${shortDate(job.deadline)}` : null].filter(Boolean).join(" · ");
  const description = `${facts ? `${facts}. ` : ""}See the details and apply on Telegram. ${APP_NAME} sends you jobs like this the moment they're posted, free.`;
  const title = job.closed ? `${jobHeadline(job)} (closed)` : `Hiring: ${jobHeadline(job)}`;
  return {
    title,
    description,
    openGraph: { title, description, type: "website", siteName: APP_NAME },
    twitter: { card: "summary_large_image", title, description },
  };
}

/** What a shared job link opens: the job at a glance, then one clear way in (the bot). */
export default async function SharedJobPage({ params }: Props) {
  const job = await getPublicJob((await params).id);
  if (!job) notFound();

  const applyHref = botJobLink(job.id);
  const facts = factsOf(job);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 pb-10 pt-6">
      <header className="flex items-center gap-2 px-1">
        <span className="grid size-8 place-items-center rounded-lg border border-accent-mid bg-linear-to-b from-accent-mid to-accent text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]">
          <Briefcase className="size-4" />
        </span>
        <span className="text-[15px] font-bold tracking-tight">{APP_NAME}</span>
      </header>

      <article className="relative mt-5 overflow-hidden rounded-3xl border border-separator bg-surface p-5 shadow-[0_20px_48px_-32px_rgba(15,17,21,0.35)]">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(120%_100%_at_0%_0%,var(--accent-soft)_0%,transparent_70%)]" />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-2">
            {job.closed ? (
              <span className="rounded-full bg-pill px-2.5 py-1 text-[12px] font-semibold text-hint">Closed</span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-[12px] font-semibold text-accent-strong">
                <span className="size-1.5 rounded-full bg-accent" />
                Hiring now
              </span>
            )}
            {job.employerLabel && <span className="rounded-full border border-separator px-2.5 py-1 text-[12px] font-medium text-hint">{job.employerLabel}</span>}
          </div>
          <h1 className="mt-3 text-[26px] font-bold leading-tight tracking-tight">{job.title}</h1>
          {job.company && <p className="mt-1 text-[16px] text-hint">{job.company}</p>}

          {facts.length > 0 && (
            <dl className="mt-5 grid grid-cols-2 gap-2">
              {facts.map(({ icon: Icon, label, value, urgent }) => (
                <div key={label} className="rounded-2xl border border-separator-subtle bg-bg px-3 py-2.5">
                  <dt className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-hint-light">
                    <Icon className="size-3" />
                    {label}
                  </dt>
                  <dd className={urgent ? "mt-0.5 text-[14px] font-semibold text-accent-strong" : "mt-0.5 text-[14px] font-semibold"}>{value}</dd>
                </div>
              ))}
            </dl>
          )}

          {job.teaser && <p className="mt-5 text-[15px] leading-relaxed text-text/85">{job.teaser}</p>}
          {job.skills.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {job.skills.map((s) => (
                <span key={s} className="rounded-full bg-pill px-2.5 py-1 text-[12px] font-medium text-hint">
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>
      </article>

      <a
        href={applyHref}
        className="mt-5 inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-ink text-[16px] font-semibold text-white shadow-[0_12px_28px_-14px_rgba(15,17,21,0.6)] transition-colors hover:bg-ink-hover"
      >
        <Send className="size-4" />
        {job.closed ? "See similar open jobs" : "See full details and apply"}
      </a>
      <p className="mt-2 text-center text-[13px] text-hint">Opens in Telegram. Free, no sign-up form.</p>

      <section className="mt-8 rounded-3xl border border-accent-border bg-[linear-gradient(140deg,var(--accent-soft)_0%,#fffaf6_55%,#ffffff_100%)] p-5">
        <h2 className="text-[18px] font-bold leading-snug tracking-tight">Never miss a job like this again</h2>
        <ul className="mt-4 flex flex-col gap-3">
          <Perk icon={BellRing} title="Matched to you, instantly" body="Tell us your field once. We message you the moment a fitting job is posted." />
          <Perk icon={Radar} title="Every source in one place" body="Ethiopia's job channels and websites, checked around the clock." />
          <Perk icon={FileText} title="A CV for every application" body="Tailor your CV to any job in a tap. Your first one is free." />
        </ul>
        <a
          href={`${BOT_URL}?start=src_share`}
          className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-xl bg-accent text-[15px] font-semibold text-white transition-colors hover:bg-accent-strong"
        >
          Get free job alerts
        </a>
      </section>
    </main>
  );
}

function Perk({ icon: Icon, title, body }: { icon: typeof BellRing; title: string; body: string }) {
  return (
    <li className="flex gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-accent-border bg-surface text-accent-strong">
        <Icon className="size-4" />
      </span>
      <div>
        <p className="text-[14px] font-semibold">{title}</p>
        <p className="text-[13px] leading-snug text-hint">{body}</p>
      </div>
    </li>
  );
}

function factsOf(job: PublicJobDto) {
  const days = job.deadline ? Math.ceil((new Date(job.deadline).getTime() - Date.now()) / 86_400_000) : null;
  const facts: { icon: typeof MapPin; label: string; value: string; urgent?: boolean }[] = [];
  if (job.location) facts.push({ icon: MapPin, label: "Location", value: job.location });
  if (job.deadline && !job.closed && days !== null)
    facts.push({ icon: Clock, label: "Apply by", value: `${shortDate(job.deadline)}${days <= 3 ? ` · ${days <= 0 ? "today" : `${days}d left`}` : ""}`, urgent: days <= 3 });
  if (job.jobType) facts.push({ icon: Briefcase, label: "Job type", value: job.jobType });
  if (job.experience) facts.push({ icon: GraduationCap, label: "Experience", value: job.experience });
  if (job.salary) facts.push({ icon: Wallet, label: "Salary", value: job.salary });
  return facts.slice(0, 4);
}
