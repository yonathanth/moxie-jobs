/** Minimal typings for the parts of Telegram's WebApp API we use. */
export interface TelegramWebApp {
  initData: string;
  initDataUnsafe: { start_param?: string; user?: { id: number; first_name?: string } };
  colorScheme: "light" | "dark";
  platform: string;
  ready(): void;
  expand(): void;
  close(): void;
  openTelegramLink(url: string): void;
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
