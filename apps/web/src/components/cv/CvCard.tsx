"use client";

import { useQuery } from "@tanstack/react-query";
import { Lock, Target } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { CvSummaryDto } from "@ethio/shared";
import { postedAgo } from "../jobs/JobCard";
import { useSession } from "../miniapp/session";
import { cx } from "../ui";
import { useCvTemplates } from "./hooks";
import { api } from "@/lib/api";

/** A4 at 96 dpi: the width and first-page height the templates are drawn at. */
const PAGE_W = 794;
const PAGE_H = 1123;

/**
 * A saved CV as a card, like GoMoxie's dashboard: its real first page under a
 * frosted strip with the title. Fast: the template's small cached picture shows
 * at once (softly blurred), then the CV's own render fades in over it. The
 * render is fetched only once the card is near the screen, and cached until
 * the CV changes (updatedAt).
 */
export function CvCard({ cv }: { cv: CvSummaryDto }) {
  const { token } = useSession();
  const templates = useCvTemplates();
  const box = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [scale, setScale] = useState(0.2);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / PAGE_W));
    ro.observe(el);
    const io = new IntersectionObserver(([e]) => e?.isIntersecting && setVisible(true), { rootMargin: "300px" });
    io.observe(el);
    return () => {
      ro.disconnect();
      io.disconnect();
    };
  }, []);

  const preview = useQuery({
    queryKey: ["cv", cv.id, "thumb", cv.updatedAt],
    queryFn: () => api.cv.preview(token, cv.id),
    enabled: visible,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    retry: false,
  });
  const templatePic = templates.data?.find((t) => t.id === cv.templateId)?.previewUrl;
  const subtitle = cv.kind === "tailored" ? `Tailored${cv.jobTitle ? ` for ${cv.jobTitle}` : ""}` : cv.flow === "improve" ? "Improved CV" : "Base CV";

  return (
    <Link href={`/app/cvs/${cv.id}`} className="group block">
      <div
        ref={box}
        className="relative aspect-[1/1.414] overflow-hidden rounded-2xl border border-separator bg-white shadow-[0_14px_32px_-20px_rgba(15,17,21,0.4)] transition-transform group-active:scale-[0.98]"
      >
        {/* Instantly: the template's look, blurred (it's sample content). */}
        {templatePic ? (
          // eslint-disable-next-line @next/next/no-img-element -- GoMoxie's cached template picture
          <img src={templatePic} alt="" aria-hidden className="absolute inset-0 size-full scale-105 object-cover object-top opacity-70 blur-[3px]" />
        ) : (
          <div className="skeleton absolute inset-0 rounded-none" />
        )}
        {/* Then: the CV itself. */}
        {preview.data && (
          <iframe
            title={`${cv.title} preview`}
            srcDoc={thumbHtml(preview.data.html)}
            sandbox="allow-same-origin"
            scrolling="no"
            tabIndex={-1}
            onLoad={() => setLoaded(true)}
            className={cx("pointer-events-none absolute left-0 top-0 origin-top-left border-0 bg-white transition-opacity duration-300", loaded ? "opacity-100" : "opacity-0")}
            style={{ width: PAGE_W, height: PAGE_H, transform: `scale(${scale})` }}
          />
        )}
        {cv.locked && (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-ink/85 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">
            <Lock className="size-3" />
            Locked
          </span>
        )}
        {/* Frosted title strip, as on GoMoxie. */}
        <div className="absolute inset-x-0 bottom-0 border-t border-white/60 bg-white/80 px-3 pb-2.5 pt-2 backdrop-blur-md">
          <p className="truncate text-[13px] font-semibold">{cv.title}</p>
          <p className="flex items-center gap-1 truncate text-[11px] text-hint">
            {cv.kind === "tailored" && <Target className="size-3 shrink-0 text-violet-500" />}
            <span className="truncate">
              {subtitle} · {postedAgo(cv.updatedAt).toLowerCase()}
            </span>
          </p>
        </div>
      </div>
    </Link>
  );
}

/** Placeholder grid while the list loads. */
export function CvCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton aspect-[1/1.414] rounded-2xl" />
      ))}
    </div>
  );
}

/** The page alone, white, no scrollbars: the preview HTML is made for a scrolling screen view (GoMoxie's body.preview: a grey desk with 24px padding, page shadow, scrollbars). */
const THUMB_CSS =
  "<style>html,body,body.preview{overflow:hidden!important;background:#fff!important;margin:0!important;padding:0!important;scrollbar-width:none!important}body.preview .page{margin:0!important;box-shadow:none!important}::-webkit-scrollbar{display:none!important}</style>";
function thumbHtml(html: string): string {
  return html.includes("</head>") ? html.replace("</head>", `${THUMB_CSS}</head>`) : THUMB_CSS + html;
}
