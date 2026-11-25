import { START_APP_ROUTES } from "@ethio/shared";
/** Minimal typings for the parts of Telegram's WebApp API we use. */
export interface TelegramWebApp {
  initData: string;
  initDataUnsafe: { start_param?: string; user?: { id: number; first_name?: string; allows_write_to_pm?: boolean } };
  /** Bot API 6.9+: asks the user to let the bot message them (needed if they opened the app without starting the chat). */
  requestWriteAccess?(callback?: (granted: boolean) => void): void;
  colorScheme: "light" | "dark";
  platform: string;
  ready(): void;
  expand(): void;
  close(): void;
  openTelegramLink(url: string): void;
  /** Bot API 8.0+: sends a message the bot prepared (savePreparedInlineMessage) to a chat the user picks. */
  shareMessage?(msgId: string, callback?: (sent: boolean) => void): void;
  isVersionAtLeast?(version: string): boolean;
  /** Opens a link in the in-app or external browser (payments must not open inside the Mini App). */
  openLink(url: string, options?: { try_instant_view?: boolean }): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  setBottomBarColor?(color: string): void;
  disableVerticalSwipes?(): void;
  BackButton: {
    show(): void;
    hide(): void;
    onClick(cb: () => void): void;
    offClick(cb: () => void): void;
  };
  HapticFeedback?: {
    selectionChanged(): void;
    notificationOccurred(type: "error" | "success" | "warning"): void;
    impactOccurred(style: "light" | "medium" | "heavy" | "rigid" | "soft"): void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

/** The WebApp object when running inside Telegram with real initData, else null. */
export function getWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  const wa = window.Telegram?.WebApp;
  return wa && wa.initData ? wa : null;
}

export const haptic = {
  select: () => getWebApp()?.HapticFeedback?.selectionChanged(),
  success: () => getWebApp()?.HapticFeedback?.notificationOccurred("success"),
  error: () => getWebApp()?.HapticFeedback?.notificationOccurred("error"),
};

/** Opens a link outside the Mini App: Telegram links in Telegram, others in the browser. */
export function openExternal(url: string) {
  const wa = getWebApp();
  if (wa && /^https:\/\/t\.me\//i.test(url)) wa.openTelegramLink(url);
  else if (wa) wa.openLink(url);
  else window.open(url, "_blank", "noopener");
}

/**
 * Telegram's signed launch data, available before telegram-web-app.js loads: Telegram puts it in
 * the URL hash (#tgWebAppData=…), and the script keeps a copy in sessionStorage after navigation.
 * Reading it here lets sign-in start without waiting for the script.
 */
export function readInitData(): string | null {
  if (typeof window === "undefined") return null;
  const fromScript = window.Telegram?.WebApp?.initData;
  if (fromScript) return fromScript;
  try {
    const hash = new URLSearchParams(window.location.hash.slice(1)).get("tgWebAppData");
    if (hash) return hash;
    const saved = JSON.parse(sessionStorage.getItem("__telegram__initParams") ?? "null") as { tgWebAppData?: string } | null;
    return saved?.tgWebAppData || null;
  } catch {
    return null;
  }
}

/** Where a startapp link points: job_<id> → that job's page. Null for anything else. */
export function startRoute(): string | null {
  if (typeof window === "undefined") return null;
  let param: string | null = window.Telegram?.WebApp?.initDataUnsafe?.start_param ?? null;
  try {
    param ??= new URLSearchParams(window.location.search).get("tgWebAppStartParam");
    const initData = readInitData();
    if (!param && initData) param = new URLSearchParams(initData).get("start_param");
  } catch {}
  const job = /^job_([0-9a-f-]{36})$/i.exec(param ?? "");
  if (job) return `/app/jobs/${job[1]}`;
  return param && param in START_APP_ROUTES ? START_APP_ROUTES[param as keyof typeof START_APP_ROUTES] : null;
}

/** The Telegram user id inside initData (unverified: only used to pick a cached session). */
export function initDataUserId(initData: string): number | null {
  try {
    const user = JSON.parse(new URLSearchParams(initData).get("user") ?? "null") as { id?: number } | null;
    return typeof user?.id === "number" ? user.id : null;
  } catch {
    return null;
  }
}

/** Once the script is in: tell Telegram we're ready, go full height, match our colours. */
export function prepareWebApp() {
  const wa = getWebApp();
  if (!wa) return;
  wa.ready();
  wa.expand();
  wa.disableVerticalSwipes?.();
  wa.setHeaderColor?.("#fdfdfd");
  wa.setBackgroundColor?.("#fdfdfd");
  wa.setBottomBarColor?.("#fdfdfd");
}

/**
 * People who open the Mini App straight from a link (share links, the bot's Open button) never pressed
 * Start, and Telegram won't let the bot message them: every alert would fail. If Telegram says the bot
 * can't write to them yet, ask once ("Allow Meklit Jobs to message you?"). Not again for a week if they decline.
 */
export function askToAllowMessages(): void {
  const wa = getWebApp();
  if (!wa?.requestWriteAccess || !wa.isVersionAtLeast?.("6.9")) return;
  if (wa.initDataUnsafe.user?.allows_write_to_pm) return;
  try {
    const at = Number(localStorage.getItem("wa:asked") ?? 0);
    if (Date.now() - at < 7 * 24 * 3_600_000) return;
    localStorage.setItem("wa:asked", String(Date.now()));
  } catch {}
  wa.requestWriteAccess();
}
