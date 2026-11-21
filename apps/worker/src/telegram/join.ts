import { Api, type TelegramClient } from "telegram";
import { prisma } from "../db";
import { log } from "../log";

/**
 * Joins a source's channel with the listener account, mutes and archives it
 * (updates still reach the listener), and sets the cursor so the listener
 * backfills ~`backfill` recent posts. Used by the `sources` script and by
 * JoinWatcher (channels added from the admin). Returns the channel title.
 */
export async function joinChannel(client: TelegramClient, sourceId: string, backfill = 20): Promise<string> {
  const source = await prisma.source.findUniqueOrThrow({ where: { id: sourceId } });
  if (!source.handle) throw new Error(`${sourceId} has no handle`);
  const entity = await client.getEntity(source.handle);
  if (!(entity instanceof Api.Channel) || !entity.broadcast) throw new Error(`@${source.handle} is not a channel`);
  await client.invoke(new Api.channels.JoinChannel({ channel: entity }));
  try {
    const peer = await client.getInputEntity(entity);
    await client.invoke(
      new Api.account.UpdateNotifySettings({
        peer: new Api.InputNotifyPeer({ peer }),
        settings: new Api.InputPeerNotifySettings({ muteUntil: 2147483647 }),
      }),
    );
    await client.invoke(new Api.folders.EditPeerFolders({ folderPeers: [new Api.InputFolderPeer({ peer, folderId: 1 })] }));
  } catch (err) {
    log.warn({ source: sourceId, error: String(err) }, "joined, but could not mute/archive");
  }
  const [latest] = await client.getMessages(entity, { limit: 1 });
  const cursor = latest ? BigInt(Math.max(0, latest.id - backfill)) : null;
  await prisma.source.update({
    where: { id: sourceId },
    data: {
      tgChannelId: BigInt(entity.id.toString()),
      isActive: true,
      lastMessageId: source.lastMessageId ?? cursor,
      // Channels added from the admin start with "@handle" as title: use the real one.
      ...(source.title.startsWith("@") ? { title: entity.title } : {}),
    },
  });
  return entity.title;
}
