import "server-only";
import { randomUUID } from "crypto";
import { q } from "./db";
import { toProfile } from "./profiles";

/** Notifications: replies, likes, reposts, quotes, and new followers on Jace Media. */

export type NotificationKind = "reply" | "like" | "repost" | "quote" | "follow";

export type Notification = {
  id: string;
  kind: NotificationKind;
  actor: { name: string; handle: string; picture: string | null };
  postId: string | null;
  postText: string | null;
  read: boolean;
  createdAt: string;
};

/** Records one. Never notifies you about yourself; a repeated like or follow doesn't pile up. */
export async function notify(recipient: string, kind: NotificationKind, actor: string, postId: string | null): Promise<void> {
  if (!recipient || recipient === actor) return;
  try {
    if (kind === "like" || kind === "follow" || kind === "repost") {
      const seen = await q(`SELECT 1 FROM notifications WHERE sub = $1 AND kind = $2 AND actor_sub = $3 AND post_id IS NOT DISTINCT FROM $4`, [
        recipient,
        kind,
        actor,
        postId,
      ]);
      if (seen[0]) return;
    }
    await q(`INSERT INTO notifications (id, sub, kind, actor_sub, post_id, created_at) VALUES ($1, $2, $3, $4, $5, $6)`, [
      randomUUID(),
      recipient,
      kind,
      actor,
      postId,
      Date.now(),
    ]);
  } catch (err) {
    console.error("Couldn't save a notification:", err);
  }
}

export async function unreadCount(sub: string): Promise<number> {
  const rows = await q(`SELECT count(*)::int AS n FROM notifications WHERE sub = $1 AND read = FALSE`, [sub]);
  return Number(rows[0]?.n ?? 0);
}

export async function listNotifications(sub: string, limit = 50): Promise<Notification[]> {
  const rows = await q(
    `SELECT n.id, n.kind, n.post_id, n.read, n.created_at, p.body AS post_text, pr.*
     FROM notifications n JOIN profiles pr ON pr.sub = n.actor_sub LEFT JOIN posts p ON p.id = n.post_id
     WHERE n.sub = $1 AND pr.banned = FALSE ORDER BY n.created_at DESC LIMIT $2`,
    [sub, limit],
  );
  return rows.map((r) => {
    const a = toProfile(r);
    return {
      id: r.id as string,
      kind: r.kind as NotificationKind,
      actor: { name: a.name, handle: a.handle, picture: a.picture },
      postId: (r.post_id as string) ?? null,
      postText: (r.post_text as string) ?? null,
      read: !!r.read,
      createdAt: new Date(Number(r.created_at)).toISOString(),
    };
  });
}

export async function markAllRead(sub: string): Promise<void> {
  await q(`UPDATE notifications SET read = TRUE WHERE sub = $1 AND read = FALSE`, [sub]);
}
