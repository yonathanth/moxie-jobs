import { MOXIE_SVG } from "./moxie-art.generated";

/**
 * Moxie for Meklit Jobs' pictures: glasses on, a folder of CVs in her small
 * claw, a big happy smile, looking straight at you. Made from GoMoxie's
 * resting artwork (moxie-art.generated.ts, which has every prop hidden) by
 * showing and hiding its parts, so it stays in step with her real drawing.
 */

const show = (svg: string, part: string) => {
  const re = new RegExp(`(data-part="${part}"[^>]*?) style="opacity:0"`);
  if (!re.test(svg)) throw new Error(`Moxie part not found: ${part}`);
  return svg.replace(re, "$1");
};
const hide = (svg: string, part: string) => svg.replace(`data-part="${part}"`, `data-part="${part}" style="opacity:0"`);

/** Moves the circles inside a part (her pupils and their glints) by dx, dy. */
const shift = (svg: string, part: string, dx: number, dy: number) => {
  const start = svg.indexOf(`data-part="${part}"`);
  const end = svg.indexOf("</g>", start);
  if (start < 0 || end < 0) throw new Error(`Moxie part not found: ${part}`);
  const moved = svg
    .slice(start, end)
    .replace(/cx="([\d.]+)" cy="([\d.]+)"/g, (_m, x: string, y: string) => `cx="${Number(x) + dx}" cy="${Number(y) + dy}"`);
  return svg.slice(0, start) + moved + svg.slice(end);
};

function build(): string {
  let svg = MOXIE_SVG;
  for (const p of ["glassesL", "glassesR", "glassesBridge", "hugFiles", "mouthLaugh"]) svg = show(svg, p);
  for (const p of ["smallClaw", "mouthSmile"]) svg = hide(svg, p);
  // At rest her pupils look a little down-right; centred, she looks right at you.
  for (const side of ["L", "R"]) {
    svg = shift(svg, `pupil${side}`, -6, -1);
    svg = shift(svg, `glint${side}`, -6, -1);
  }
  return svg;
}

export const MOXIE_HAPPY_SVG = build();
