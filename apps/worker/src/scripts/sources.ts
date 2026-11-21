/**
 * Source management until the admin pages exist.
 *
 *   pnpm --filter @ethio/worker sources list
 *   pnpm --filter @ethio/worker sources search <key>          # find the channel by its title
 *   pnpm --filter @ethio/worker sources set-handle <key> <handle>
 *   pnpm --filter @ethio/worker sources join <key> [backfill=20]
 *   pnpm --filter @ethio/worker sources join-tier1 [max=5]     # joins up to 5, spaced 60–120 s apart
 *   pnpm --filter @ethio/worker sources pause <key> | resume <key>
 *
 * Joining is slow on purpose: many joins in a short time get user accounts restricted.
 */
import { Api, type TelegramClient } from "telegram";
import { prisma } from "../db";
import { connectListener } from "../telegram/client";
import { joinChannel } from "../telegram/join";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function list() {
  const sources = await prisma.source.findMany({ orderBy: [{ tier: "asc" }, { linkPriority: "desc" }] });
  console.table(
    sources.map((s) => ({
      key: s.id,
      tier: s.tier,
      handle: s.handle ?? "?",
      active: s.isActive,
      joined: s.tgChannelId ? "yes" : "",
      cursor: s.lastMessageId?.toString() ?? "",
      type: s.type,
      format: s.format,
    })),
  );
}

async function search(client: TelegramClient, key: string) {
  const source = await prisma.source.findUniqueOrThrow({ where: { id: key } });
  const found = await client.invoke(new Api.contacts.Search({ q: source.title.replace(/[^\p{L}\p{N} .]/gu, " ").trim(), limit: 10 }));
  const channels = found.chats.filter((c): c is Api.Channel => c instanceof Api.Channel && !!c.broadcast);
  console.log(`Candidates for "${source.title}":`);
  console.table(channels.map((c) => ({ handle: c.username ?? "(private)", title: c.title, subscribers: c.participantsCount ?? "?" })));
  console.log(`Confirm with: sources set-handle ${key} <handle>`);
}

async function setHandle(key: string, handle: string) {
  await prisma.source.update({ where: { id: key }, data: { handle: handle.replace(/^@/, "") } });
  console.log(`${key} → @${handle.replace(/^@/, "")}`);
}

async function join(client: TelegramClient, key: string, backfill = 20) {
  const title = await joinChannel(client, key, backfill);
  console.log(`Joined ${key} (${title}); listening, backfilling ~${backfill} recent posts.`);
}

async function joinTier1(client: TelegramClient, max = 5) {
  const pending = await prisma.source.findMany({
    where: { tier: 1, handle: { not: null }, tgChannelId: null },
    orderBy: { linkPriority: "desc" },
    take: max,
  });
  if (!pending.length) return console.log("Nothing to join: every tier-1 source with a handle is joined.");
  for (const [i, s] of pending.entries()) {
    await join(client, s.id);
    if (i < pending.length - 1) {
      const wait = 60_000 + Math.floor(Math.random() * 60_000);
      console.log(`Waiting ${Math.round(wait / 1000)} s before the next join…`);
      await sleep(wait);
    }
  }
}

/** Activates every source whose channel the account already joined (e.g. joined by hand in the app). */
async function sync(client: TelegramClient, backfill = 10) {
  const dialogs = await client.getDialogs({ limit: 1000 });
  const joined = new Map<string, Api.Channel>();
  for (const d of dialogs) {
    if (d.entity instanceof Api.Channel && d.entity.username) joined.set(d.entity.username.toLowerCase(), d.entity);
  }
  const sources = await prisma.source.findMany({ where: { handle: { not: null }, tgChannelId: null } });
  let activated = 0;
  for (const s of sources) {
    const channel = joined.get(s.handle!.toLowerCase());
    if (!channel) continue;
    const [latest] = await client.getMessages(channel, { limit: 1 });
    await prisma.source.update({
      where: { id: s.id },
      data: {
        tgChannelId: BigInt(channel.id.toString()),
        isActive: true,
        lastMessageId: latest ? BigInt(Math.max(0, latest.id - backfill)) : null,
      },
    });
    console.log(`Activated ${s.id} (@${s.handle})`);
    activated++;
  }
  console.log(activated ? `${activated} source(s) activated. The running worker picks them up within 5 minutes.` : "No newly joined source channels found.");
}

async function main() {
  const [command, arg1, arg2] = process.argv.slice(2);
  const needsTelegram = ["search", "join", "join-tier1", "sync"].includes(command ?? "");
  const client = needsTelegram ? await connectListener() : null;
  try {
    switch (command) {
      case "list":
        await list();
        break;
      case "search":
        await search(client!, arg1!);
        break;
      case "set-handle":
        await setHandle(arg1!, arg2!);
        break;
      case "join":
        await join(client!, arg1!, arg2 ? Number(arg2) : 20);
        break;
      case "join-tier1":
        await joinTier1(client!, arg1 ? Number(arg1) : 5);
        break;
      case "sync":
        await sync(client!, arg1 ? Number(arg1) : 10);
        break;
      case "pause":
      case "resume":
        await prisma.source.update({ where: { id: arg1! }, data: { isActive: command === "resume" } });
        console.log(`${arg1} ${command === "resume" ? "resumed" : "paused"}`);
        break;
      default:
        console.log("Commands: list | search <key> | set-handle <key> <handle> | join <key> [backfill] | join-tier1 [max] | pause <key> | resume <key>");
    }
  } finally {
    await client?.disconnect();
    await prisma.$disconnect();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
