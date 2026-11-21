"use client";

import { useEffect, useRef, useState } from "react";
import { PaperSkeleton } from "../skeletons";

/** A4 width the templates are designed for (CSS px at 96 dpi). */
const PAGE_WIDTH = 794;

/**
 * The CV exactly as the PDF renders it (GoMoxie's template HTML), scaled to
 * fit the screen. Sandboxed: no scripts run. Unpaid CVs get a watermark.
 */
export function CvPreview({ html, watermark, loading }: { html: string | null; watermark?: boolean; loading?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [scale, setScale] = useState(0.45);
  const [height, setHeight] = useState(1123);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / PAGE_WIDTH));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const measure = () => {
    const doc = frame.current?.contentDocument;
    if (doc?.body) setHeight(Math.max(1123, doc.documentElement.scrollHeight));
  };

  return (
    <div ref={box} className="relative w-full overflow-hidden rounded-xl border border-separator bg-white shadow-[0_18px_44px_-26px_rgba(15,17,21,0.35)]" style={{ height: height * scale }}>
      {html ? (
        <iframe
          ref={frame}
          title="CV preview"
          srcDoc={html}
          sandbox="allow-same-origin"
          onLoad={measure}
          className="pointer-events-none absolute left-0 top-0 origin-top-left border-0 bg-white"
          style={{ width: PAGE_WIDTH, height, transform: `scale(${scale})` }}
        />
      ) : null}
      {watermark && html && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center overflow-hidden">
          <span className="-rotate-30 select-none whitespace-nowrap text-[42px] font-black tracking-[0.3em] text-black/[0.07]">PREVIEW</span>
        </div>
      )}
      {/* Updating: a thin shimmer along the top; the old page stays readable underneath. */}
      {loading && html && <div className="skeleton absolute inset-x-0 top-0 h-1 rounded-none" />}
      {!html && (
        <div className="absolute inset-0">
          <PaperSkeleton />
        </div>
      )}
    </div>
  );
}
