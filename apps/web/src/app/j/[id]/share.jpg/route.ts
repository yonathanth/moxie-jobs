import sharp from "sharp";
import renderJobCard from "../opengraph-image";

/** The job card image as JPEG: Telegram photo messages (the Mini App's Share) only take JPEG. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const png = Buffer.from(await (await renderJobCard({ params })).arrayBuffer());
  const jpeg = await sharp(png).jpeg({ quality: 88 }).toBuffer();
  return new Response(new Uint8Array(jpeg), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=600, s-maxage=3600" },
  });
}
