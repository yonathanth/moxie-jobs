"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { ScreenSkeleton } from "../skeletons";
import type { MeDto } from "@ethio/shared";
import { api, ApiError } from "@/lib/api";
import { BOT_URL, DEV_AUTH, DEV_TELEGRAM_ID } from "@/lib/config";
import { getWebApp } from "@/lib/telegram";
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

type State =
  | { status: "loading" }
  | { status: "outside-telegram" }
  | { status: "error"; message: string }
  | { status: "ready"; token: string; me: MeDto };

/** Signs the user in with Telegram initData (or dev login) before rendering the Mini App. */
export function SessionGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>({ status: "loading" });

  const signIn = useCallback(async () => {
    setState({ status: "loading" });
    const wa = getWebApp();
    if (wa) {
      wa.ready();
      wa.expand();
      wa.disableVerticalSwipes?.();
      // Match the GoMoxie page colour so Telegram's chrome blends in.
      wa.setHeaderColor?.("#fdfdfd");
      wa.setBackgroundColor?.("#fdfdfd");
      wa.setBottomBarColor?.("#fdfdfd");
    }
    try {
      const res = wa ? await api.loginTelegram(wa.initData) : DEV_AUTH ? await api.loginDev(DEV_TELEGRAM_ID) : null;
      if (!res) return setState({ status: "outside-telegram" });
      setState({ status: "ready", token: res.accessToken, me: res.me });
    } catch (err) {
      const message =
        err instanceof ApiError && err.status === 401
          ? "Your Telegram session expired. Close and reopen the app."
          : err instanceof Error
            ? err.message
            : "Something went wrong.";
      setState({ status: "error", message });
    }
  }, []);

  useEffect(() => {
    void signIn();
  }, [signIn]);

  const setMe = useCallback(
    (me: MeDto) => setState((s) => (s.status === "ready" ? { ...s, me } : s)),
    [],
  );

  switch (state.status) {
    case "loading":
      return (
        <ScreenSkeleton variant="jobs" />
      );
    case "outside-telegram":
      return (
        <CenteredMessage title="Open this in Telegram" body="GoMoxie Jobs runs inside Telegram. Open the bot to continue.">
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
          <Button onClick={() => void signIn()}>Try again</Button>
        </CenteredMessage>
      );
    case "ready":
      return (
        <SessionContext.Provider value={{ token: state.token, me: state.me, setMe }}>{children}</SessionContext.Provider>
      );
  }
}
