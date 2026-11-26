import "server-only";
import { randomUUID } from "crypto";
import { q } from "./db";
import { notify } from "./notifications";
import { getProfiles, summary } from "./profiles";
import type { AccountSummary } from "./types";

/**
 * Going live on Jace Media.
 *
 * Two ways to get the video to viewers:
 * - Peer-to-peer (always on, free): the streamer's browser sends the video
 *   straight to each viewer. Jace Media only passes the connection messages
 *   along (through the database, so it works on Vercel). Good for small
 *   audiences; the streamer's upload speed is the limit.
 * - Cloudflare Realtime (when CF_REALTIME_APP_ID and CF_REALTIME_APP_TOKEN
 *   are set): the streamer sends once and Cloudflare sends to everyone.
 *   Cloudflare's first 1,000 GB a month are free; Jace Media counts what
 *   viewers receive and goes back to peer-to-peer at CF_MONTHLY_CAP_GB
 *   (650 by default), so it never runs past the free amount.
 */

const CF_APP = process.env.CF_REALTIME_APP_ID ?? "";
const CF_TOKEN = process.env.CF_REALTIME_APP_TOKEN ?? "";
const CF_API = `https://rtc.live.cloudflare.com/v1/apps/${CF_APP}`;
const CAP_BYTES = Number(process.env.CF_MONTHLY_CAP_GB || 650) * 1e9;
/** A stream whose streamer hasn't checked in for this long has ended. */
const STALE_MS = 45_000;
export const MAX_P2P_VIEWERS = 15;

export const cloudflareConfigured = !!(CF_APP && CF_TOKEN);

export type LiveStream = {
  id: string;
  title: string;
  description: string;
  host: AccountSummary;
  hostSub: string;
  live: boolean;
  startedAt: string;
  endedAt: string | null;
  viewers: number;
  thumbnail: string | null;
  cloudflare: boolean;
};

const month = () => new Date().toISOString().slice(0, 7);

/** Banned Jace accounts can't stream or chat. */
async function bannedAmong(subs: string[]): Promise<Set<string>> {
  if (!subs.length) return new Set();
  const rows = await q(`SELECT sub FROM profiles WHERE sub = ANY($1::text[]) AND banned = TRUE`, [subs]);
  return new Set(rows.map((r) => r.sub as string));
}

export async function cloudflareUsage(): Promise<number> {
  const rows = await q(`SELECT bytes FROM stream_usage WHERE month = $1`, [month()]);
  return Number(rows[0]?.bytes ?? 0);
}

/** Whether new viewers can use Cloudflare right now (set up, and under the monthly cap). */
export async function cloudflareAvailable(): Promise<boolean> {
  if (!cloudflareConfigured) return false;
  return (await cloudflareUsage()) < CAP_BYTES;
}

export async function addUsage(bytes: number): Promise<void> {
  if (!(bytes > 0) || bytes > 5e9) return;
  await q(
    `INSERT INTO stream_usage (month, bytes) VALUES ($1, $2) ON CONFLICT (month) DO UPDATE SET bytes = stream_usage.bytes + EXCLUDED.bytes`,
    [month(), Math.round(bytes)],
  );
}

async function toStreams(rows: Record<string, unknown>[]): Promise<LiveStream[]> {
  if (!rows.length) return [];
  const subs = [...new Set(rows.map((r) => r.sub as string))];
  const [profiles, banned] = await Promise.all([getProfiles(subs), bannedAmong(subs)]);
  const counts = await q(
    `SELECT stream_id, count(*)::int AS n FROM stream_viewers WHERE stream_id = ANY($1::text[]) AND seen_at > $2 GROUP BY stream_id`,
    [rows.map((r) => r.id), Date.now() - 40_000],
  );
  const viewers = new Map(counts.map((c) => [c.stream_id as string, Number(c.n)]));
  const now = Date.now();
  return rows.flatMap((r) => {
    const p = profiles.get(r.sub as string);
    if (!p || banned.has(r.sub as string)) return [];
    return [
      {
        id: r.id as string,
        title: r.title as string,
        description: (r.description as string) ?? "",
        host: summary(p),
        hostSub: r.sub as string,
        live: r.status === "live" && now - Number(r.last_seen) < STALE_MS,
        startedAt: new Date(Number(r.started_at)).toISOString(),
        endedAt: r.ended_at ? new Date(Number(r.ended_at)).toISOString() : null,
        viewers: viewers.get(r.id as string) ?? 0,
        thumbnail: (r.thumbnail as string) ?? null,
        cloudflare: !!r.cf_session,
      },
    ];
  });
}

export async function liveNow(limit = 30): Promise<LiveStream[]> {
  const rows = await q(`SELECT * FROM streams WHERE status = 'live' AND last_seen > $1 ORDER BY started_at DESC LIMIT $2`, [Date.now() - STALE_MS, limit]);
  return toStreams(rows);
}

export async function getStream(id: string): Promise<LiveStream | null> {
  const rows = await q(`SELECT * FROM streams WHERE id = $1`, [id]);
  return (await toStreams(rows))[0] ?? null;
}

export async function startStream(host: { sub: string; muted: boolean }, title: string, description: string): Promise<{ id: string } | { error: string }> {
  if (host.muted) return { error: "Your Jace account is muted, so you can't go live right now." };
  const t = title.trim().slice(0, 120);
  if (!t) return { error: "Give your stream a title." };
  const now = Date.now();
  // One stream at a time: starting a new one ends any old one.
  await q(`UPDATE streams SET status = 'ended', ended_at = $2 WHERE sub = $1 AND status = 'live'`, [host.sub, now]);
  const id = randomUUID();
  await q(`INSERT INTO streams (id, sub, title, description, status, started_at, last_seen) VALUES ($1, $2, $3, $4, 'live', $5, $5)`, [
    id,
    host.sub,
    t,
    description.trim().slice(0, 2000),
    now,
  ]);
  // Tell the people who follow you on Jace Media.
  const followers = await q(`SELECT sub FROM subscriptions WHERE kind = 'jace' AND ref = $1 LIMIT 5000`, [host.sub]);
  await Promise.all(followers.map((f) => notify(f.sub as string, "live", host.sub, id).catch(() => {})));
  return { id };
}

async function ownStream(sub: string, id: string): Promise<boolean> {
  const rows = await q(`SELECT 1 FROM streams WHERE id = $1 AND sub = $2`, [id, sub]);
  return rows.length > 0;
}

export async function heartbeat(sub: string, id: string, patch: { thumbnail?: string; title?: string }): Promise<boolean> {
  if (!(await ownStream(sub, id))) return false;
  await q(
    `UPDATE streams SET last_seen = $2, thumbnail = COALESCE($3, thumbnail), title = COALESCE($4, title) WHERE id = $1 AND status = 'live'`,
    [id, Date.now(), patch.thumbnail ?? null, patch.title?.trim().slice(0, 120) || null],
  );
  // Old connection messages aren't needed once answered.
  await q(`DELETE FROM stream_signals WHERE stream_id = $1 AND created_at < $2`, [id, Date.now() - 120_000]);
  return true;
}

export async function endStream(sub: string, id: string): Promise<boolean> {
  if (!(await ownStream(sub, id))) return false;
  await q(`UPDATE streams SET status = 'ended', ended_at = $2 WHERE id = $1`, [id, Date.now()]);
  await q(`DELETE FROM stream_signals WHERE stream_id = $1`, [id]);
  return true;
}

/** A viewer checking in. Returns whether they should keep using Cloudflare. */
export async function watching(id: string, peer: string, sub: string | null, cfBytes: number): Promise<{ cloudflareOk: boolean }> {
  await q(
    `INSERT INTO stream_viewers (stream_id, peer, sub, seen_at) VALUES ($1, $2, $3, $4)
     ON CONFLICT (stream_id, peer) DO UPDATE SET seen_at = EXCLUDED.seen_at, sub = EXCLUDED.sub`,
    [id, peer.slice(0, 64), sub, Date.now()],
  );
  if (cfBytes > 0) await addUsage(cfBytes);
  return { cloudflareOk: await cloudflareAvailable() };
}

// ---------- Peer-to-peer connection messages ----------

export async function postSignal(id: string, peer: string, toHost: boolean, kind: string, payload: string): Promise<void> {
  if (payload.length > 200_000) throw new Error("Too big.");
  await q(`INSERT INTO stream_signals (stream_id, peer, to_host, kind, payload, created_at) VALUES ($1, $2, $3, $4, $5, $6)`, [
    id,
    peer.slice(0, 64),
    toHost,
    kind.slice(0, 16),
    payload,
    Date.now(),
  ]);
}

export async function readSignals(id: string, opts: { host: true; after: number } | { host: false; peer: string; after: number }) {
  const rows = opts.host
    ? await q(`SELECT id, peer, kind, payload FROM stream_signals WHERE stream_id = $1 AND to_host = TRUE AND id > $2 ORDER BY id LIMIT 50`, [id, opts.after])
    : await q(`SELECT id, peer, kind, payload FROM stream_signals WHERE stream_id = $1 AND to_host = FALSE AND peer = $2 AND id > $3 ORDER BY id LIMIT 50`, [
        id,
        opts.peer,
        opts.after,
      ]);
  return rows.map((r) => ({ id: Number(r.id), peer: r.peer as string, kind: r.kind as string, payload: r.payload as string }));
}

export async function isHost(sub: string, id: string): Promise<boolean> {
  return ownStream(sub, id);
}

// ---------- Chat ----------

export async function chat(id: string, after: number) {
  const rows = await q(`SELECT id, sub, body, created_at FROM stream_chat WHERE stream_id = $1 AND created_at > $2 ORDER BY created_at DESC LIMIT 100`, [id, after]);
  const subs = [...new Set(rows.map((r) => r.sub as string))];
  const [profiles, banned] = await Promise.all([getProfiles(subs), bannedAmong(subs)]);
  return rows
    .reverse()
    .flatMap((r) => {
      const p = profiles.get(r.sub as string);
      if (!p || banned.has(r.sub as string)) return [];
      return [{ id: r.id as string, author: summary(p), body: r.body as string, at: Number(r.created_at) }];
    });
}

export async function sendChat(id: string, author: { sub: string; muted: boolean }, body: string): Promise<{ ok: true } | { error: string }> {
  if (author.muted) return { error: "Your Jace account is muted." };
  const text = body.trim().slice(0, 300);
  if (!text) return { error: "Say something first." };
  if (id.startsWith("yt-")) {
    // Jace Media's chat for a YouTube live stream.
    if (!/^yt-[\w-]{11}$/.test(id)) return { error: "Unknown stream." };
  } else {
    const live = await q(`SELECT 1 FROM streams WHERE id = $1 AND status = 'live'`, [id]);
    if (!live.length) return { error: "This stream has ended." };
  }
  await q(`INSERT INTO stream_chat (id, stream_id, sub, body, created_at) VALUES ($1, $2, $3, $4, $5)`, [randomUUID(), id, author.sub, text, Date.now()]);
  return { ok: true };
}

// ---------- Cloudflare Realtime ----------

type SessionDescription = { type: "offer" | "answer"; sdp: string };

async function cf<T>(path: string, init: { method: string; body?: unknown }): Promise<T> {
  const res = await fetch(`${CF_API}${path}`, {
    method: init.method,
    headers: { Authorization: `Bearer ${CF_TOKEN}`, "Content-Type": "application/json" },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await res.json().catch(() => ({}))) as T & { errorCode?: string; errorDescription?: string };
  if (!res.ok || data.errorCode) throw new Error(data.errorDescription || `Cloudflare said ${res.status}.`);
  return data;
}

/** The streamer sends their tracks to Cloudflare once. */
export async function cfPublish(sub: string, id: string, offer: SessionDescription, tracks: { mid: string; trackName: string }[]): Promise<SessionDescription> {
  if (!(await ownStream(sub, id))) throw new Error("Not your stream.");
  const { sessionId } = await cf<{ sessionId: string }>("/sessions/new", { method: "POST" });
  const res = await cf<{ sessionDescription: SessionDescription }>(`/sessions/${sessionId}/tracks/new`, {
    method: "POST",
    body: { sessionDescription: offer, tracks: tracks.map((t) => ({ location: "local", mid: t.mid, trackName: t.trackName })) },
  });
  await q(`UPDATE streams SET cf_session = $2, cf_tracks = $3 WHERE id = $1`, [id, sessionId, JSON.stringify(tracks.map((t) => t.trackName))]);
  return res.sessionDescription;
}

/** A viewer asks Cloudflare for the stream; Cloudflare offers it and the viewer answers (cfAnswer). */
export async function cfSubscribe(id: string): Promise<{ sessionId: string; offer: SessionDescription }> {
  const rows = await q(`SELECT cf_session, cf_tracks FROM streams WHERE id = $1 AND status = 'live'`, [id]);
  const host = rows[0];
  if (!host?.cf_session) throw new Error("This stream isn't on Cloudflare.");
  const names = JSON.parse(host.cf_tracks as string) as string[];
  const { sessionId } = await cf<{ sessionId: string }>("/sessions/new", { method: "POST" });
  const res = await cf<{ sessionDescription: SessionDescription }>(`/sessions/${sessionId}/tracks/new`, {
    method: "POST",
    body: { tracks: names.map((trackName) => ({ location: "remote", sessionId: host.cf_session, trackName })) },
  });
  return { sessionId, offer: res.sessionDescription };
}

export async function cfAnswer(sessionId: string, answer: SessionDescription): Promise<void> {
  if (!/^[\w-]{8,128}$/.test(sessionId)) throw new Error("Bad session.");
  await cf(`/sessions/${sessionId}/renegotiate`, { method: "PUT", body: { sessionDescription: answer } });
}

/** STUN always; Cloudflare's TURN relay too when CF_TURN_KEY_ID and CF_TURN_KEY_TOKEN are set (helps strict networks). */
export async function iceServers(): Promise<RTCIceServer[]> {
  const list: RTCIceServer[] = [{ urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] }];
  const keyId = process.env.CF_TURN_KEY_ID;
  const keyToken = process.env.CF_TURN_KEY_TOKEN;
  if (keyId && keyToken) {
    try {
      const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`, {
        method: "POST",
        headers: { Authorization: `Bearer ${keyToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ttl: 86_400 }),
        signal: AbortSignal.timeout(5_000),
      });
      const data = (await res.json()) as { iceServers?: RTCIceServer | RTCIceServer[] };
      if (data.iceServers) list.push(...(Array.isArray(data.iceServers) ? data.iceServers : [data.iceServers]));
    } catch {}
  }
  return list;
}
