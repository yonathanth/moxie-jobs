/** "@name", "name", "t.me/name", "https://t.me/name/123?x" → "name". Pure. */
export function channelHandle(input: string): string {
  return input
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?(t|telegram)\.me\//i, "")
    .replace(/^@/, "")
    .split(/[/?#\s]/)[0]!;
}
