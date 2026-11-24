import { BOT_URL } from "@/lib/config";

/** Public landing page (placeholder until the public job board ships). */
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4 py-12">
      <p className="text-sm font-semibold tracking-wide text-accent">Meklit Jobs</p>
      <h1 className="mt-2 text-3xl font-bold leading-tight">Jobs in Ethiopia that fit you, sent straight to Telegram.</h1>
      <p className="mt-4 text-hint">
        We collect new vacancies from Ethiopia&apos;s job channels and websites around the clock and send you only the ones
        that match your profession, experience and city.
      </p>
      <a
        href={BOT_URL}
        className="mt-8 inline-flex h-12 items-center justify-center rounded-xl bg-ink px-6 font-semibold text-white"
      >
        Open in Telegram
      </a>
    </main>
  );
}
