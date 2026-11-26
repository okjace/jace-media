import "server-only";
import { randomUUID } from "crypto";
import { q } from "./db";
import type { VideoCard } from "./types";

/** Playlists and Watch Later. Watch Later is made the first time it's needed. */

export type Playlist = { id: string; name: string; kind: "watch_later" | "playlist"; count: number; thumbnail: string | null };
export const MAX_PLAYLISTS = 50;

export async function watchLaterId(sub: string): Promise<string> {
  const rows = await q(`SELECT id FROM playlists WHERE sub = $1 AND kind = 'watch_later'`, [sub]);
  if (rows[0]) return rows[0].id as string;
  const id = randomUUID();
  await q(`INSERT INTO playlists (id, sub, name, kind, created_at) VALUES ($1, $2, 'Watch Later', 'watch_later', $3)`, [id, sub, Date.now()]);
  return id;
}

export async function listPlaylists(sub: string): Promise<Playlist[]> {
  await watchLaterId(sub);
  const rows = await q(
    `SELECT p.id, p.name, p.kind, count(i.video_id)::int AS n,
       (SELECT thumbnail FROM playlist_items WHERE playlist_id = p.id ORDER BY added_at DESC LIMIT 1) AS thumb
     FROM playlists p LEFT JOIN playlist_items i ON i.playlist_id = p.id
     WHERE p.sub = $1 GROUP BY p.id ORDER BY (p.kind = 'watch_later') DESC, p.created_at`,
    [sub],
  );
  return rows.map((r) => ({ id: r.id as string, name: r.name as string, kind: r.kind as Playlist["kind"], count: Number(r.n), thumbnail: (r.thumb as string) ?? null }));
}

export async function getPlaylist(sub: string, id: string): Promise<{ playlist: Playlist; videos: VideoCard[] } | null> {
  const realId = id === "watch-later" ? await watchLaterId(sub) : id;
  const p = await q(`SELECT id, name, kind FROM playlists WHERE id = $1 AND sub = $2`, [realId, sub]);
  if (!p[0]) return null;
  const items = await q(`SELECT * FROM playlist_items WHERE playlist_id = $1 ORDER BY added_at DESC LIMIT 500`, [realId]);
  const videos = items.map(
    (r): VideoCard => ({
      source: r.source as "youtube" | "jace",
      id: r.video_id as string,
      title: r.title as string,
      thumbnail: (r.thumbnail as string) ?? null,
      channelId: (r.channel_id as string) ?? "",
      channelName: (r.channel_name as string) ?? "",
      publishedAt: null,
      short: !!r.short,
    }),
  );
  return { playlist: { id: realId, name: p[0].name as string, kind: p[0].kind as Playlist["kind"], count: videos.length, thumbnail: videos[0]?.thumbnail ?? null }, videos };
}

export async function createPlaylist(sub: string, name: string): Promise<Playlist | { error: string }> {
  const n = name.replace(/\s+/g, " ").trim().slice(0, 60);
  if (!n) return { error: "Name your playlist." };
  const count = await q(`SELECT count(*)::int AS n FROM playlists WHERE sub = $1`, [sub]);
  if (Number(count[0]?.n) >= MAX_PLAYLISTS) return { error: `You can have up to ${MAX_PLAYLISTS} playlists.` };
  const id = randomUUID();
  await q(`INSERT INTO playlists (id, sub, name, kind, created_at) VALUES ($1, $2, $3, 'playlist', $4)`, [id, sub, n, Date.now()]);
  return { id, name: n, kind: "playlist", count: 0, thumbnail: null };
}

export async function renamePlaylist(sub: string, id: string, name: string): Promise<boolean> {
  const n = name.replace(/\s+/g, " ").trim().slice(0, 60);
  if (!n) return false;
  return (await q(`UPDATE playlists SET name = $3 WHERE id = $1 AND sub = $2 AND kind = 'playlist' RETURNING id`, [id, sub, n])).length > 0;
}

export async function deletePlaylist(sub: string, id: string): Promise<void> {
  await q(`DELETE FROM playlists WHERE id = $1 AND sub = $2 AND kind = 'playlist'`, [id, sub]);
}

export async function addToPlaylist(sub: string, id: string, v: VideoCard): Promise<boolean> {
  const realId = id === "watch-later" ? await watchLaterId(sub) : id;
  const owns = await q(`SELECT 1 FROM playlists WHERE id = $1 AND sub = $2`, [realId, sub]);
  if (!owns[0]) return false;
  await q(
    `INSERT INTO playlist_items (playlist_id, source, video_id, title, channel_id, channel_name, thumbnail, short, added_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (playlist_id, source, video_id) DO NOTHING`,
    [realId, v.source, v.id, v.title.slice(0, 200), v.channelId || null, v.channelName?.slice(0, 120) || null, v.thumbnail, !!v.short, Date.now()],
  );
  return true;
}

export async function removeFromPlaylist(sub: string, id: string, source: string, videoId: string): Promise<void> {
  const realId = id === "watch-later" ? await watchLaterId(sub) : id;
  await q(`DELETE FROM playlist_items WHERE playlist_id = $1 AND source = $2 AND video_id = $3 AND playlist_id IN (SELECT id FROM playlists WHERE sub = $4)`, [
    realId,
    source,
    videoId,
    sub,
  ]);
}

/** Which of your playlists already have this video. */
export async function playlistsWith(sub: string, source: string, videoId: string): Promise<string[]> {
  const rows = await q(
    `SELECT i.playlist_id FROM playlist_items i JOIN playlists p ON p.id = i.playlist_id WHERE p.sub = $1 AND i.source = $2 AND i.video_id = $3`,
    [sub, source, videoId],
  );
  return rows.map((r) => r.playlist_id as string);
}

/** Videos you started and didn't finish, newest first. */
export async function continueWatching(sub: string, limit = 12): Promise<(VideoCard & { progress: number })[]> {
  const rows = await q(
    `SELECT source, video_id, title, channel_id, channel_name, thumbnail, position, duration FROM watch_history
     WHERE sub = $1 AND position > 20 AND duration > 60 AND position < duration * 0.92
     ORDER BY watched_at DESC LIMIT $2`,
    [sub, limit],
  );
  return rows.map((r) => ({
    source: r.source as "youtube" | "jace",
    id: r.video_id as string,
    title: r.title as string,
    thumbnail: (r.thumbnail as string) ?? (r.source === "youtube" ? `/api/yt-thumb/${r.video_id}` : null),
    channelId: (r.channel_id as string) ?? "",
    channelName: (r.channel_name as string) ?? "",
    publishedAt: null,
    progress: Math.min(1, Number(r.position) / Number(r.duration)),
  }));
}

export async function saveProgress(sub: string, source: string, videoId: string, position: number, duration: number): Promise<void> {
  await q(`UPDATE watch_history SET position = $4, duration = $5, watched_at = $6 WHERE sub = $1 AND source = $2 AND video_id = $3`, [
    sub,
    source,
    videoId,
    position,
    duration,
    Date.now(),
  ]);
}
