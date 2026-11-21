import type { Metadata } from "next";
import { MiniAppProvider } from "@/components/miniapp/MiniAppProvider";

export const metadata: Metadata = {
  title: "GoMoxie Jobs",
  robots: { index: false, follow: false },
};

export default function MiniAppLayout({ children }: { children: React.ReactNode }) {
  return <MiniAppProvider>{children}</MiniAppProvider>;
}
