/** The job alert card lives in @ethio/shared (the admin preview renders it too). */
export { buildCard, detailsCallback, MORE_JOBS_CALLBACK, type Card, type CardJob, type InlineButton } from "@ethio/shared";

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
