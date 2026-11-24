import { CV_PACK_CONTENTS, CV_PACKS, PLAN_NAME } from "@ethio/shared";
import { getPublicJob, shortDate } from "@/lib/publicJob";
import {
  ACCENT,
  ACCENT_SOFT,
  ACCENT_STRONG,
  Chip,
  EMERALD,
  EMERALD_SOFT,
  Frame,
  Headline,
  HINT,
  Hidden,
  ICONS,
  INK,
  LINE,
  Perks,
  Sub,
  cardResponse,
  LOGO_URI,
  MOXIE_URI,
} from "@/lib/og/kit";
import { APP_NAME } from "@/lib/config";

/**
 * The pictures on the bot's messages (marketing and the main moments), one per
 * kind. Inputs are a few small query values (numbers, a plan, a date, a job id),
 * never free text, so the route can't be used to print arbitrary words on our brand.
 *
 *   /og/msg/upgrade?price=199    /og/msg/cv     /og/msg/packs?p=99,199,349
 *   /og/msg/cap?n=4&cap=10       /og/msg/premium?job=<id>
 *   /og/msg/welcome  /og/msg/setup  /og/msg/allset
 *   /og/msg/plan?plan=pro&until=2026-12-25   /og/msg/renew?plan=pro&until=…[&lapsed=1]
 */

const int = (v: string | null, min: number, max: number, fallback: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
};
const planOf = (v: string | null): "pro" | "career" => (v === "career" ? "career" : "pro");
const dateOf = (v: string | null) => (v && !Number.isNaN(Date.parse(v)) ? shortDate(new Date(v).toISOString()) : null);

export async function GET(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const q = new URL(req.url).searchParams;

  switch (kind) {
    case "upgrade": {
      const price = int(q.get("price"), 1, 100_000, 199);
      return cardResponse(
        <Frame badge={{ text: "Pro" }} moxie footer={{ note: `Pro from ${price} Br a month` }}>
          <Headline>Every job that fits you, the moment it&apos;s posted</Headline>
          <Perks items={["No daily limit on job alerts", "NGO, UN, embassy and jobs abroad", "New and tailored CVs every month"]} />
        </Frame>,
      );
    }

    case "cv":
      return cardResponse(
        <Frame footer={{ note: "Your first CV and first tailored CV are free", cta: "Make my CV" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <Headline size={60} max={620}>A CV made for every job you apply to</Headline>
              <Sub max={600}>Make your CV in minutes, then tailor it to any job in one tap.</Sub>
            </div>
            <CvSheet />
          </div>
        </Frame>,
      );

    case "packs": {
      const prices = (q.get("p") ?? "").split(",").map((x) => int(x, 1, 100_000, 0));
      return cardResponse(
        <Frame footer={{ note: "Credits never expire", cta: "See CV packs" }}>
          <Headline size={56} max={1080}>More CVs, whenever you need them</Headline>
          <div style={{ display: "flex", gap: 20, marginTop: 34 }}>
            {CV_PACKS.map((id, i) => {
              const p = CV_PACK_CONTENTS[id];
              const best = i === 1;
              return (
                <div
                  key={id}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    width: 330,
                    padding: "24px 26px",
                    borderRadius: 22,
                    border: `2px solid ${best ? ACCENT : LINE}`,
                    background: best ? ACCENT_SOFT : "white",
                  }}
                >
                  <div style={{ display: "flex", fontSize: 30, fontWeight: 700 }}>{p.name}</div>
                  <div style={{ display: "flex", marginTop: 8, fontSize: 24, color: HINT }}>{`${p.newCvs} new · ${p.tailored} tailored`}</div>
                  <div style={{ display: "flex", marginTop: 18, fontSize: 40, fontWeight: 700, color: best ? ACCENT_STRONG : INK }}>
                    {prices[i] ? `${prices[i]} Br` : ""}
                  </div>
                </div>
              );
            })}
          </div>
        </Frame>,
      );
    }

    case "cap": {
      const n = int(q.get("n"), 1, 999, 3);
      const cap = int(q.get("cap"), 1, 999, 10);
      return cardResponse(
        <Frame badge={{ text: "Today" }} footer={{ note: "Pro sends every match, with no daily limit", cta: "Get Pro" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <Headline size={62} max={560}>{`${n} more ${n === 1 ? "job" : "jobs"} matched you`}</Headline>
              <Sub max={540}>{`You've had your ${cap} free alerts today. The rest are waiting in your feed.`}</Sub>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {[0, 1, 2].map((i) => (
                <LockedRow key={i} faded={i > 0} />
              ))}
            </div>
          </div>
        </Frame>,
      );
    }

    case "premium": {
      const job = await getPublicJob(q.get("job") ?? "");
      const title = job?.title ?? "A premium job matched you";
      const facts = job ? [job.location, job.deadline && !job.closed ? `Apply by ${shortDate(job.deadline)}` : null].filter((x): x is string => !!x) : [];
      return cardResponse(
        <Frame
          badge={{ text: "Premium match" }}
          footer={{
            note: (
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- next/og */}
                <img src={ICONS.lock()} width={26} height={26} alt="" />
                Pro shows the employer and how to apply
              </div>
            ),
            cta: "Unlock with Pro",
          }}
        >
          <Headline size={title.length > 50 ? 54 : 64}>{title}</Headline>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 22 }}>
            {job?.employerLabel && (
              <div style={{ display: "flex", padding: "8px 18px", borderRadius: 999, background: ACCENT_SOFT, color: ACCENT_STRONG, fontSize: 26, fontWeight: 700 }}>
                {job.employerLabel}
              </div>
            )}
            <Hidden width={320} />
          </div>
          {facts.length > 0 && (
            <div style={{ display: "flex", gap: 14, marginTop: 28 }}>
              {facts.map((f) => (
                <Chip key={f}>{f}</Chip>
              ))}
            </div>
          )}
        </Frame>,
      );
    }

    case "welcome":
      return cardResponse(
        <Frame moxie>
          <Headline size={66} max={820}>Jobs that fit you, the moment they&apos;re posted</Headline>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 34, maxWidth: 720 }}>
            <Chip>Matched to you</Chip>
            <Chip>Every source in one place</Chip>
            <Chip>A CV for every job</Chip>
          </div>
        </Frame>,
      );

    case "setup":
      return cardResponse(
        <Frame footer={{ note: "It takes less than a minute", cta: "Set up my alerts" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <Headline size={60} max={560}>Your job alerts are less than a minute away</Headline>
              <Sub max={540}>Tell us the jobs you want. We send every match the moment it&apos;s posted.</Sub>
            </div>
            <SampleAlert />
          </div>
        </Frame>,
      );

    case "allset":
      return cardResponse(
        <Frame badge={{ text: "All set", tone: "emerald" }} moxie>
          <Headline size={68} max={760}>You&apos;re all set</Headline>
          <Sub max={720}>Your first matching jobs are on their way. New ones arrive the moment they&apos;re posted.</Sub>
        </Frame>,
      );

    case "plan": {
      const plan = planOf(q.get("plan"));
      const until = dateOf(q.get("until"));
      return cardResponse(
        <Frame moxie>
          {/* eslint-disable-next-line @next/next/no-img-element -- next/og */}
          <img src={ICONS.crown()} width={64} height={64} alt="" />
          <Headline size={70} max={760}>{`You're on ${PLAN_NAME[plan]}`}</Headline>
          {until && <Sub>{`Active until ${until}`}</Sub>}
          <Perks items={["Every match, no daily limit", "NGO, UN, embassy and jobs abroad"]} />
        </Frame>,
      );
    }

    case "renew": {
      const plan = planOf(q.get("plan"));
      const until = dateOf(q.get("until"));
      const lapsed = q.get("lapsed") === "1";
      return cardResponse(
        <Frame badge={{ text: lapsed ? "Ended" : "Ending soon" }} footer={{ note: "New time is added to what you have left", cta: `Renew ${PLAN_NAME[plan]}` }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- next/og */}
          <img src={ICONS.clock()} width={56} height={56} alt="" />
          <Headline size={64} max={900}>{lapsed ? `Your ${PLAN_NAME[plan]} has ended` : `Your ${PLAN_NAME[plan]} ends ${until ? `on ${until}` : "soon"}`}</Headline>
          <Sub>{lapsed ? "Premium jobs and unlimited alerts are paused until you renew." : "Renew to keep every alert and premium job coming."}</Sub>
        </Frame>,
      );
    }

    // BotFather: the picture above the description, before /start (640×360).
    case "intro":
      return cardResponse(
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "0 80px",
            background: `radial-gradient(85% 90% at 0% 0%, ${ACCENT_SOFT} 0%, #fdfdfd 65%)`,
            fontFamily: "Geist",
            color: INK,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- next/og */}
            <img src={LOGO_URI} width={64} height={64} alt="" />
            <div style={{ display: "flex", fontSize: 40, fontWeight: 700 }}>{APP_NAME}</div>
          </div>
          <div style={{ display: "flex", marginTop: 34, fontSize: 76, fontWeight: 700, lineHeight: 1.06, letterSpacing: -2, maxWidth: 760 }}>
            Jobs that fit you, the moment they&apos;re posted
          </div>
          <div style={{ display: "flex", marginTop: 26, fontSize: 34, color: HINT, maxWidth: 720 }}>Plus a CV made for every job you apply to.</div>
          {/* eslint-disable-next-line @next/next/no-img-element -- next/og */}
          <img src={MOXIE_URI} width={420} height={420} alt="" style={{ position: "absolute", right: 40, bottom: 40 }} />
        </div>,
        { size: { width: 1280, height: 720 }, out: { width: 640, height: 360 } },
      );

    // The bot's profile photo (Telegram shows it as a circle).
    case "avatar":
      return cardResponse(
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: `radial-gradient(circle at 50% 40%, #ffffff 0%, ${ACCENT_SOFT} 70%)`,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- next/og */}
          <img src={MOXIE_URI} width={470} height={470} alt="" style={{ marginTop: 10 }} />
        </div>,
        { size: { width: 640, height: 640 }, png: true },
      );
  }
  return new Response("Not found", { status: 404 });
}

/** A CV sheet with a "tailored" stamp, for the CV card. */
function CvSheet() {
  return (
    <div style={{ display: "flex", position: "relative", width: 300, height: 380, marginRight: 20 }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: 280,
          height: 370,
          padding: 26,
          borderRadius: 18,
          border: `2px solid ${LINE}`,
          background: "white",
          boxShadow: "0 24px 48px -24px rgba(15,17,21,0.35)",
          transform: "rotate(-3deg)",
        }}
      >
        <div style={{ display: "flex", width: 150, height: 18, borderRadius: 6, background: INK }} />
        <div style={{ display: "flex", width: 110, height: 12, borderRadius: 6, background: "#d1d5db", marginTop: 10 }} />
        {[200, 220, 180, 210, 160, 200, 140].map((w, i) => (
          <div key={i} style={{ display: "flex", width: w, height: 10, borderRadius: 5, background: i % 3 === 0 ? "#cbd5e1" : "#e5e7eb", marginTop: i % 3 === 0 ? 24 : 10 }} />
        ))}
      </div>
      <div
        style={{
          position: "absolute",
          right: -10,
          bottom: 30,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 16px",
          borderRadius: 999,
          background: EMERALD,
          color: "white",
          fontSize: 22,
          fontWeight: 700,
        }}
      >
        Made for this job
      </div>
    </div>
  );
}

/** One locked job row (the cap card). */
function LockedRow({ faded }: { faded?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        width: 420,
        padding: "18px 22px",
        borderRadius: 18,
        border: `2px solid ${LINE}`,
        background: "white",
        opacity: faded ? 0.6 : 1,
      }}
    >
      <div style={{ display: "flex", width: 46, height: 46, borderRadius: 12, background: ACCENT_SOFT, alignItems: "center", justifyContent: "center" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- next/og */}
        <img src={ICONS.bell()} width={24} height={24} alt="" />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", width: 230, height: 16, borderRadius: 6, background: "#d1d5db" }} />
        <div style={{ display: "flex", width: 150, height: 12, borderRadius: 6, background: "#e5e7eb" }} />
      </div>
    </div>
  );
}

/** A sample alert (the setup card): what they'll get. */
function SampleAlert() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: 440,
        padding: "26px 28px",
        borderRadius: 22,
        border: `2px solid ${LINE}`,
        background: "white",
        boxShadow: "0 24px 48px -24px rgba(15,17,21,0.3)",
      }}
    >
      <div style={{ display: "flex", alignSelf: "flex-start", padding: "6px 14px", borderRadius: 999, background: EMERALD_SOFT, color: EMERALD, fontSize: 20, fontWeight: 700 }}>
        Matches you
      </div>
      <div style={{ display: "flex", marginTop: 14, fontSize: 32, fontWeight: 700 }}>Senior Accountant</div>
      <div style={{ display: "flex", marginTop: 6, fontSize: 24, color: HINT }}>Addis Ababa · Full-time</div>
      <div style={{ display: "flex", marginTop: 16, fontSize: 22, color: ACCENT }}>Posted 2 minutes ago</div>
    </div>
  );
}
