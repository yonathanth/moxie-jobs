"use client";

import { ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useBackButton } from "../miniapp/hooks";
import { useSession } from "../miniapp/session";
import { Button, CenteredMessage, PageHeader, Screen } from "../ui";

/** Frame for admin pages: admins only, Telegram back button to the admin home (or the app). */
export function AdminShell({ title, subtitle, back = "/app/admin", children }: { title: string; subtitle?: string; back?: string; children: ReactNode }) {
  const router = useRouter();
  const { me } = useSession();
  useBackButton(() => router.push(back));

  if (!me.isAdmin) {
    return (
      <CenteredMessage icon={<ShieldAlert className="size-10 text-hint-light" />} title="Admins only" body="This part of the app is for the Meklit Jobs team.">
        <Button onClick={() => router.push("/app")}>Back to my jobs</Button>
      </CenteredMessage>
    );
  }
  return (
    <Screen className="animate-fade-up">
      <PageHeader eyebrow="Admin" title={title} subtitle={subtitle} />
      {children}
    </Screen>
  );
}
