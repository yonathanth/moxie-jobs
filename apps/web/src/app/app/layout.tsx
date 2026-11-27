import type { Metadata } from "next";
import { MiniAppProvider } from "@/components/miniapp/MiniAppProvider";

export const metadata: Metadata = {
  title: "Gursha Jobs",
  robots: { index: false, follow: false },
};

export default function MiniAppLayout({ children }: { children: React.ReactNode }) {
  return <MiniAppProvider>{children}</MiniAppProvider>;
}
