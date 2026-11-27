"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Script from "next/script";
import { useState } from "react";
import { BottomNav } from "../BottomNav";
import { PaywallProvider } from "../paywall";
import { UpgradeNudges } from "../UpgradeNudges";
import { AlertsGate } from "./AlertsGate";
import { Prefetch } from "./Prefetch";
import { SessionGate } from "./session";
import { prepareWebApp } from "@/lib/telegram";

/** Loads Telegram's WebApp script, then signs in and renders the Mini App. */
export function MiniAppProvider({ children }: { children: React.ReactNode }) {
  const [scriptDone, setScriptDone] = useState(false);
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: false } },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="afterInteractive"
        onReady={() => {
          prepareWebApp();
          setScriptDone(true);
        }}
        // Outside Telegram (or if the script is blocked) we still continue; SessionGate handles it.
        onError={() => setScriptDone(true)}
      />
      <SessionGate scriptReady={scriptDone}>
        <PaywallProvider>
          {children}
          <BottomNav />
          <Prefetch />
          <UpgradeNudges />
          <AlertsGate />
        </PaywallProvider>
      </SessionGate>
    </QueryClientProvider>
  );
}
