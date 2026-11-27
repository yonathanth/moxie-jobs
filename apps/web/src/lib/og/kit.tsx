import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import sharp from "sharp";
import { APP_NAME } from "@/lib/config";
import { MOXIE_HAPPY_SVG } from "./moxie-happy";

/**
 * Building blocks for the pictures the bot sends (and link previews): 1200×630,
 * the Gursha Jobs look (warm white, near-black type, orange accent, GoMoxie's
 * logo). next/og (satori) draws them; every div with several children is flex.
 */

export const SIZE = { width: 1200, height: 630 };
export const INK = "#0f1115";
export const HINT = "#6b7280";
export const LINE = "#e6e8eb";
export const ACCENT = "#ff5e1f";
export const ACCENT_STRONG = "#e2470b";
export const ACCENT_SOFT = "#fff2eb";
export const EMERALD = "#059669";
export const EMERALD_SOFT = "#ecfdf5";

const svgUri = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

/** GoMoxie's logo (Moxie's still mark). */
export const LOGO_URI = svgUri(readFileSync(join(process.cwd(), "src/lib/og/logo.svg"), "utf8"));
export const MOXIE_URI = svgUri(MOXIE_HAPPY_SVG);

/** Small line icons as images (satori can't use lucide). */
const icon = (path: string, color: string, size = 28, stroke = 2.4) =>
  svgUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`,
  );
export const ICONS = {
  check: (c = EMERALD) => icon(`<path d="M20 6 9 17l-5-5"/>`, c),
  lock: (c = ACCENT_STRONG) => icon(`<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>`, c),
  crown: (c = ACCENT) =>
    icon(`<path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/>`, c, 40, 2),
  bell: (c = ACCENT_STRONG) => icon(`<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>`, c),
  file: (c = ACCENT_STRONG) => icon(`<rect x="5" y="2.5" width="14" height="19" rx="2.5"/><path d="M9 8h6"/><path d="M9 12h6"/><path d="M9 16h4"/>`, c),
  clock: (c = ACCENT_STRONG) => icon(`<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>`, c),
};

async function fonts() {
  const [regular, bold] = await Promise.all([
    readFile(join(process.cwd(), "src/assets/Geist-Regular.ttf")),
    readFile(join(process.cwd(), "src/assets/Geist-Bold.ttf")),
  ]);
  return [
    { name: "Geist", data: regular, weight: 400 as const, style: "normal" as const },
    { name: "Geist", data: bold, weight: 700 as const, style: "normal" as const },
  ];
}

/** Renders a card and returns it as a JPEG response (small, and what Telegram photo messages want). */
export async function cardResponse(
  node: React.ReactElement,
  /** Draw at `size`, then optionally resize to `out` (e.g. 1280×720 → BotFather's 640×360). */
  opts: { size?: { width: number; height: number }; out?: { width: number; height: number }; png?: boolean } = {},
): Promise<Response> {
  const drawn = Buffer.from(await new ImageResponse(node, { ...(opts.size ?? SIZE), fonts: await fonts() }).arrayBuffer());
  let img = sharp(drawn);
  if (opts.out) img = img.resize(opts.out.width, opts.out.height);
  const body = opts.png ? await img.png().toBuffer() : await img.jpeg({ quality: 90 }).toBuffer();
  return new Response(new Uint8Array(body), {
    headers: { "Content-Type": opts.png ? "image/png" : "image/jpeg", "Cache-Control": "public, max-age=3600, s-maxage=3600" },
  });
}

/** The frame every card shares: logo and name, an optional badge, the content, an optional footer. */
export function Frame({
  badge,
  children,
  footer,
  moxie,
}: {
  badge?: { text: string; tone?: "accent" | "emerald" | "ink" };
  children: React.ReactNode;
  /** Bottom row: a quiet note on the left, the dark call to action on the right. */
  footer?: { note?: React.ReactNode; cta?: string };
  /** Moxie, small, peeking in at the bottom right. Used sparingly (welcome, plan, all set). */
  moxie?: boolean;
}) {
  const tone = badge?.tone ?? "accent";
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "56px 64px",
        background: `radial-gradient(90% 80% at 0% 0%, ${ACCENT_SOFT} 0%, #fdfdfd 62%)`,
        fontFamily: "Geist",
        color: INK,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- next/og draws plain <img> */}
          <img src={LOGO_URI} width={54} height={54} alt="" />
          <div style={{ fontSize: 30, fontWeight: 700 }}>{APP_NAME}</div>
        </div>
        {badge && (
          <div
            style={{
              display: "flex",
              padding: "10px 22px",
              borderRadius: 999,
              fontSize: 24,
              fontWeight: 700,
              background: tone === "emerald" ? EMERALD_SOFT : tone === "ink" ? INK : ACCENT_SOFT,
              color: tone === "emerald" ? EMERALD : tone === "ink" ? "white" : ACCENT_STRONG,
            }}
          >
            {badge.text}
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }}>{children}</div>
      {footer ? (
        <div style={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between" }}>
          {footer.note ? <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 26, color: HINT }}>{footer.note}</div> : <div style={{ display: "flex" }} />}
          {footer.cta ? <Cta>{footer.cta}</Cta> : <div style={{ display: "flex" }} />}
        </div>
      ) : (
        <div style={{ display: "flex" }} />
      )}
      {moxie && (
        // eslint-disable-next-line @next/next/no-img-element -- next/og draws plain <img>
        <img src={MOXIE_URI} width={270} height={270} alt="" style={{ position: "absolute", right: 40, bottom: 6 }} />
      )}
    </div>
  );
}

export function Headline({ children, size = 64, max = 900 }: { children: React.ReactNode; size?: number; max?: number }) {
  return <div style={{ display: "flex", fontSize: size, fontWeight: 700, lineHeight: 1.08, letterSpacing: -1.5, maxWidth: max }}>{children}</div>;
}

export function Sub({ children, max = 860 }: { children: React.ReactNode; max?: number }) {
  return <div style={{ display: "flex", marginTop: 18, fontSize: 30, lineHeight: 1.3, color: HINT, maxWidth: max }}>{children}</div>;
}

/** A row of checked perks. */
export function Perks({ items }: { items: string[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 30 }}>
      {items.map((p) => (
        <div key={p} style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 30 }}>
          <div style={{ display: "flex", width: 40, height: 40, borderRadius: 999, background: EMERALD_SOFT, alignItems: "center", justifyContent: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- next/og */}
            <img src={ICONS.check()} width={24} height={24} alt="" />
          </div>
          {p}
        </div>
      ))}
    </div>
  );
}

export function Chip({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", padding: "10px 20px", borderRadius: 14, border: `2px solid ${LINE}`, background: "white", fontSize: 26, color: INK }}>{children}</div>
  );
}

/** The dark call to action at the bottom right (it's a picture; the real button is under it). */
export function Cta({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", marginLeft: "auto", padding: "16px 30px", borderRadius: 16, background: INK, color: "white", fontSize: 28, fontWeight: 700 }}>{children}</div>;
}

export function FootNote({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", fontSize: 26, color: HINT }}>{children}</div>;
}

/** A blurred-out bar standing in for hidden text (the employer on a locked job). */
export function Hidden({ width }: { width: number }) {
  return <div style={{ display: "flex", width, height: 30, borderRadius: 10, background: "linear-gradient(90deg, #e5e7eb, #f3f4f6, #e5e7eb)" }} />;
}
