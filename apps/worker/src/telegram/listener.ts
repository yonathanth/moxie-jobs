import { Api, type TelegramClient } from "telegram";
import { NewMessage, type NewMessageEvent } from "telegram/events";
import { EditedMessage, type EditedMessageEvent } from "telegram/events/EditedMessage";
import type { Source } from "@ethio/db";
import { Prisma } from "@ethio/db";
import { prisma } from "../db";
import { log } from "../log";
import { textHash } from "../pipeline/text";
import { messageButtons, messageLinks, messageText, type MessageLike } from "./message";

const CATCH_UP_LIMIT = 100;
const FIRST_RUN_BACKFILL = 20;
const SOURCES_REFRESH_MS = 5 * 60_000;

/**
 * Stores posts from active sources as RawPosts. Live updates give ~1 s latency;
 * a periodic per-source poll (and a catch-up on start) covers anything missed.
 */
export class Listener {
  private byChannelId = new Map<string, Source>();
  private refreshedAt = 0;
  private pollTimer: NodeJS.Timeout | null = null;
  private polling = false;

  constructor(
    private readonly client: TelegramClient,
    private readonly onStored: () => void,
    private readonly pollIntervalMs: number,
  ) {}

  async start() {
    // Loads joined channels (and their access hashes) into the client's entity cache.
    await this.client.getDialogs({ limit: 500 });
    await this.refreshSources(true);
    this.client.addEventHandler((e: NewMessageEvent) => void this.onMessage(e.message, false), new NewMessage({}));
    this.client.addEventHandler((e: EditedMessageEvent) => void this.onMessage(e.message, true), new EditedMessage({}));
    await this.pollAll();
    this.pollTimer = setInterval(() => void this.pollAll(), this.pollIntervalMs);
    log.info({ sources: this.byChannelId.size }, "listener started");
  }

  async stop() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    await this.client.disconnect();
  }

  /** Reloads the source list now (e.g. right after the admin added and the worker joined a channel). */
  async reloadSources() {
    await this.refreshSources(true);
  }

  private async refreshSources(force = false) {
    if (!force && Date.now() - this.refreshedAt < SOURCES_REFRESH_MS) return;
    const sources = await prisma.source.findMany({ where: { isActive: true, tgChannelId: { not: null } } });
    this.byChannelId = new Map(sources.map((s) => [s.tgChannelId!.toString(), s]));
    this.refreshedAt = Date.now();
  }

  private sourceOf(message: Api.Message): Source | undefined {
    const peer = message.peerId;
    if (!(peer instanceof Api.PeerChannel)) return undefined;
    return this.byChannelId.get(peer.channelId.toString());
  }

  private async onMessage(message: Api.Message, edited: boolean) {
    try {
      await this.refreshSources();
      const source = this.sourceOf(message);
      if (!source) return;
      const stored = await this.store(source, message, edited);
      if (stored) this.onStored();
    } catch (err) {
      log.error({ err: String(err) }, "failed to store live message");
    }
  }

  /** Returns true when a new or changed post was queued. */
  private async store(source: Source, message: Api.Message, edited: boolean): Promise<boolean> {
    const m = message as unknown as MessageLike;
    const text = messageText(m);
    if (!text) return false; // album parts without caption, stickers, service messages

    const data = {
      text,
      buttons: messageButtons(m) as unknown as Prisma.InputJsonValue,
      links: messageLinks(m),
      textHash: textHash(text),
      postedAt: new Date(m.date * 1000),
      editedAt: m.editDate ? new Date(m.editDate * 1000) : null,
    };
    const messageId = BigInt(m.id);

    const existing = await prisma.rawPost.findUnique({
      where: { sourceId_messageId: { sourceId: source.id, messageId } },
      select: { id: true, textHash: true },
    });
    if (existing) {
      if (!edited || existing.textHash === data.textHash) return false;
      // Meaningful edit: re-process (dedup merges into the same job; no re-notification).
      await prisma.rawPost.update({
        where: { id: existing.id },
        data: { ...data, status: "new", attempts: 0, error: null, pageText: null, pageUrl: null },
      });
      return true;
    }

    try {
      await prisma.rawPost.create({ data: { sourceId: source.id, messageId, ...data } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return false; // raced with poll
      throw err;
    }
    await prisma.source.updateMany({
      where: { id: source.id, OR: [{ lastMessageId: null }, { lastMessageId: { lt: messageId } }] },
      data: { lastMessageId: messageId },
    });
    return true;
  }

  /** Fetches posts newer than each source's cursor (startup catch-up + missed live updates). */
  private async pollAll() {
    if (this.polling) return;
    this.polling = true;
    try {
      await this.refreshSources();
      let stored = 0;
      for (const source of this.byChannelId.values()) {
        stored += await this.pollSource(source).catch((err: unknown) => {
          log.warn({ source: source.id, err: String(err) }, "poll failed");
          return 0;
        });
      }
      if (stored) {
        log.info({ stored }, "poll stored new posts");
        this.onStored();
      }
    } finally {
      this.polling = false;
    }
  }

  private async pollSource(source: Source): Promise<number> {
    const fresh = await prisma.source.findUnique({ where: { id: source.id }, select: { lastMessageId: true } });
    const entity = source.handle ?? new Api.PeerChannel({ channelId: source.tgChannelId! as never });
    // No cursor yet: start from the latest few posts, never from the channel's beginning.
    const messages = fresh?.lastMessageId
      ? await this.client.getMessages(entity, { minId: Number(fresh.lastMessageId), limit: CATCH_UP_LIMIT, reverse: true })
      : (await this.client.getMessages(entity, { limit: FIRST_RUN_BACKFILL })).reverse();
    let stored = 0;
    for (const message of messages) {
      if (message instanceof Api.Message && (await this.store(source, message, false))) stored++;
    }
    return stored;
  }
}
