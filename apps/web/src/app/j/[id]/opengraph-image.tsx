import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { APP_NAME } from "@/lib/config";
import { getPublicJob, shortDate } from "@/lib/publicJob";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Job preview";

const INK = "#0f1115";
const HINT = "#6b7280";
const ACCENT = "#ff5e1f";
const ACCENT_STRONG = "#e2470b";
const ACCENT_SOFT = "#fff2eb";

/** The card people see in a chat when a job link is shared. */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const [job, regular, bold] = await Promise.all([
    getPublicJob((await params).id),
    readFile(join(process.cwd(), "src/assets/Geist-Regular.ttf")),
    readFile(join(process.cwd(), "src/assets/Geist-Bold.ttf")),
  ]);
  const title = job?.title ?? "Jobs in Ethiopia that fit you";
  const who = job ? (job.company ?? job.employerLabel) : null;
  const facts = job
    ? [job.location, job.jobType, job.deadline && !job.closed ? `Apply by ${shortDate(job.deadline)}` : null].filter((x): x is string => !!x)
    : [];
  const titleSize = title.length > 70 ? 52 : title.length > 40 ? 62 : 72;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: `radial-gradient(90% 80% at 0% 0%, ${ACCENT_SOFT} 0%, #fdfdfd 60%)`,
          fontFamily: "Geist",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 14,
                background: `linear-gradient(180deg, #ff7a2e, ${ACCENT})`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                fontSize: 30,
                fontWeight: 800,
              }}
            >
              M
            </div>
            <div style={{ fontSize: 30, fontWeight: 700, color: INK }}>{APP_NAME}</div>
          </div>
          {job && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 22px",
                borderRadius: 999,
                background: job.closed ? "#f3f4f6" : ACCENT_SOFT,
                color: job.closed ? HINT : ACCENT_STRONG,
                fontSize: 26,
                fontWeight: 700,
              }}
            >
              {!job.closed && <div style={{ width: 12, height: 12, borderRadius: 999, background: ACCENT }} />}
              {job.closed ? "Closed" : "Hiring now"}
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: titleSize, fontWeight: 800, color: INK, lineHeight: 1.1, letterSpacing: -1.5 }}>{title}</div>
          {who && <div style={{ marginTop: 18, fontSize: 36, color: HINT }}>{who}</div>}
          {facts.length > 0 && (
            <div style={{ display: "flex", gap: 14, marginTop: 30 }}>
              {facts.map((f) => (
                <div key={f} style={{ display: "flex", padding: "10px 20px", borderRadius: 14, border: "2px solid #e6e8eb", background: "white", fontSize: 26, color: INK }}>
                  {f}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 26, color: HINT }}>Jobs matched to you, sent on Telegram</div>
          <div style={{ display: "flex", padding: "16px 30px", borderRadius: 16, background: INK, color: "white", fontSize: 28, fontWeight: 700 }}>
            {job?.closed ? "See similar jobs" : "Apply on Telegram"}
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Geist", data: regular, weight: 400, style: "normal" },
        { name: "Geist", data: bold, weight: 700, style: "normal" },
      ],
    },
  );
}
