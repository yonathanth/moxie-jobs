"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { RouteSkeleton, ScreenSkeleton, skeletonFor } from "../skeletons";
import { DEFAULT_PLAN_LIMITS, type MeDto } from "@ethio/shared";
import { api, ApiError } from "@/lib/api";
import { BOT_URL, DEV_AUTH, DEV_TELEGRAM_ID } from "@/lib/config";
import { initDataUserId, readInitData, startRoute } from "@/lib/telegram";
import { Button, CenteredMessage } from "../ui";

interface Session {
  token: string;
  me: MeDto;
  setMe: (me: MeDto) => void;
}

const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession must be used inside <SessionGate>");
  return session;
}

/** The start param is acted on once per launch (not again when they come back to Profile). */
let startHandled = false;

type State =
  | { status: "loading" }
  | { status: "outside-telegram" }
  | { status: "error"; message: string }
  | { status: "ready"; token: string; me: MeDto };

const CACHE_KEY = "mj:session";
/** Tokens live 24 h; a cached session is reused for 20 h, then a fresh sign-in is awaited. */
const CACHE_MAX_AGE_MS = 20 * 3_600_000;

interface CachedSession {
  uid: number;
  token: string;
  me: MeDto;
  at: number;
}

function loadCached(uid: number | null): CachedSession | null {
  if (uid === null) return null;
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null") as CachedSession | null;
    return c && c.uid === uid && Date.now() - c.at < CACHE_MAX_AGE_MS ? c : null;
  } catch {
    return null;
  }
}

function saveCached(uid: number | null, token: string, me: MeDto) {
  if (uid === null) return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ uid, token, me, at: Date.now() } satisfies CachedSession));
  } catch {}
}

/**
 * Signs the user in with Telegram initData (or dev login) before rendering the Mini App.
 * Fast path: initData is read from the URL before Telegram's script loads, and a session cached
 * on this device (same Telegram user) renders at once while a fresh sign-in runs in the background.
 */
export function SessionGate({ scriptReady, children }: { scriptReady: boolean; children: React.ReactNode }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const started = useRef(false);

  const signIn = useCallback(async (initData: string | null) => {
    const uid = initData ? initDataUserId(initData) : null;
    const cached = loadCached(uid);
    setState(cached ? { status: "ready", token: cached.token, me: cached.me } : { status: "loading" });
    try {
      const res = initData ? await api.loginTelegram(initData) : DEV_AUTH ? await api.loginDev(DEV_TELEGRAM_ID) : null;
      if (!res) {
        if (!cached) setState({ status: "outside-telegram" });
        return;
      }
      saveCached(uid, res.accessToken, res.me);
      setState({ status: "ready", token: res.accessToken, me: res.me });
    } catch (err) {
      if (cached) return; // keep the cached session; it's still valid
      const message =
        err instanceof ApiError && err.status === 401
          ? "Your Telegram session expired. Close and reopen the app."
          : err instanceof Error
            ? err.message
            : "Something went wrong.";
      setState({ status: "error", message });
    }
  }, []);

  // Start as soon as there's initData (usually right away, from the URL); otherwise wait for the script.
  useEffect(() => {
    if (started.current) return;
    const initData = readInitData();
    if (initData || scriptReady) {
      started.current = true;
      void signIn(initData);
    }
  }, [scriptReady, signIn]);

  const setMe = useCallback(
    (me: MeDto) =>
      setState((s) => {
        if (s.status !== "ready") return s;
        const initData = readInitData();
        if (initData) saveCached(initDataUserId(initData), s.token, me);
        return { ...s, me };
      }),
    [],
  );

  // A startapp link (shared job) opens the Mini App at its home; go to that job once, on launch.
  const router = useRouter();
  const pathname = usePathname();
  // Used once: cleared after the first redirect, so coming back to /app later (Profile) stays on Profile.
  const [startTarget, setStartTarget] = useState(() => (startHandled ? null : startRoute()));
  const goStart = !!startTarget && startTarget !== "/app" && (pathname === "/app" || pathname === "/app/");
  useEffect(() => {
    if (state.status !== "ready" || !startTarget) return;
    startHandled = true;
    if (goStart) router.replace(startTarget);
    setStartTarget(null);
  }, [state.status, startTarget, goStart, router]);

  switch (state.status) {
    case "loading":
      return goStart ? <ScreenSkeleton variant={skeletonFor((startTarget ?? "").split("?")[0] ?? "")} /> : <RouteSkeleton />;
    case "outside-telegram":
      return (
        <CenteredMessage title="Open this in Telegram" body="Gursha Jobs runs inside Telegram. Open the bot to continue.">
          <a
            href={BOT_URL}
            className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-ink px-5 font-semibold text-white"
          >
            Open @{BOT_URL.split("/").pop()}
          </a>
        </CenteredMessage>
      );
    case "error":
      return (
        <CenteredMessage title="Couldn't sign you in" body={state.message}>
          <Button onClick={() => void signIn(readInitData())}>Try again</Button>
        </CenteredMessage>
      );
    case "ready":
      if (goStart && !startHandled) return <ScreenSkeleton variant={skeletonFor((startTarget ?? "").split("?")[0] ?? "")} />;
      return (
        <SessionContext.Provider value={{ token: state.token, me: devView(state.me), setMe }}>{children}</SessionContext.Provider>
      );
  }
}

/**
 * Local development only: see the Mini App as a free user (upgrade pop-ups, the
 * Today card) without touching the database (which local dev shares with
 * production). Open /app?as=free&sent=10&waiting=4 once; it sticks for the tab.
 * /app?as=me goes back. Display only: the API still uses the real plan.
 */
function devView(me: MeDto): MeDto {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") return me;
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.get("as") === "me") sessionStorage.removeItem("dev:as");
    else if (q.get("as") === "free") sessionStorage.setItem("dev:as", JSON.stringify({ sent: Number(q.get("sent") ?? 0), waiting: Number(q.get("waiting") ?? 0), locked: Number(q.get("locked") ?? 0) }));
    const raw = sessionStorage.getItem("dev:as");
    if (!raw) return me;
    const v = JSON.parse(raw) as { sent: number; waiting: number; locked: number };
    return {
      ...me,
      plan: "free",
      planExpiresAt: null,
      effectivePlan: "free",
      beta: false,
      limits: DEFAULT_PLAN_LIMITS.free,
      stats: { ...me.stats, sentToday: v.sent, waitingToday: v.waiting, lockedThisWeek: v.locked },
    };
  } catch {
    return me;
  }
}
