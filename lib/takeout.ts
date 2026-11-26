"use client";

/**
 * Reads a Google Takeout export of YouTube (takeout.google.com → "YouTube and
 * YouTube Music") in the browser: the .zip, the extracted folder, or picked
 * files. Only the small files are read; video files are skipped.
 *
 *   subscriptions/subscriptions.csv     → channels you subscribe to
 *   history/watch-history.json | .html  → what you watched (and on which channel)
 *   playlists/Liked videos.csv          → videos you liked
 */

export type TakeoutSubscription = { channelId: string; title: string };
/** One row per video: how many times it was watched and when last. */
export type TakeoutWatch = { id: string; title: string; channelId: string | null; channelName: string | null; watchedAt: string; count: number };
export type TakeoutData = { subscriptions: TakeoutSubscription[]; history: TakeoutWatch[]; liked: string[]; files: number };

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;
const WANTED = /\.(csv|json|html)$/i;
/** Text files bigger than this are skipped (watch history is usually a few MB). */
const MAX_TEXT_BYTES = 300 * 1024 * 1024;

type Entry = { path: string; text: () => Promise<string> };

/** RFC 4180 CSV: quoted fields, doubled quotes, newlines inside quotes. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim()));
}

function csvObjects(text: string, mustHave: RegExp): Record<string, string>[] {
  const rows = parseCsv(text);
  const headerAt = rows.findIndex((r) => r.some((f) => mustHave.test(f.trim())));
  if (headerAt < 0) return [];
  const header = rows[headerAt].map((h) => h.trim().toLowerCase());
  return rows.slice(headerAt + 1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}

function pick(row: Record<string, string>, ...patterns: RegExp[]): string {
  for (const p of patterns) {
    const key = Object.keys(row).find((k) => p.test(k));
    if (key && row[key]) return row[key];
  }
  return "";
}

function iso(value: string | undefined | null): string | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

const videoIdFromUrl = (url?: string | null) =>
  url?.match(/[?&]v=([A-Za-z0-9_-]{11})/)?.[1] ?? url?.match(/youtu\.be\/([A-Za-z0-9_-]{11})/)?.[1] ?? null;
const channelIdFromUrl = (url?: string | null) => url?.match(/\/channel\/(UC[A-Za-z0-9_-]{22})/)?.[1] ?? null;
const baseName = (path: string) => path.split("/").pop() ?? path;

type RawWatch = { id: string; title: string; channelId: string | null; channelName: string | null; watchedAt: string };

function parseSubscriptions(text: string): TakeoutSubscription[] {
  return csvObjects(text, /channel/i)
    .map((r) => {
      const id = pick(r, /channel id/, /^id$/) || channelIdFromUrl(pick(r, /url/)) || "";
      return { channelId: id, title: pick(r, /title/, /name/) || id };
    })
    .filter((s) => CHANNEL_ID.test(s.channelId));
}

function parseHistoryJson(text: string): RawWatch[] {
  const list = JSON.parse(text) as { title?: string; titleUrl?: string; time?: string; subtitles?: { name?: string; url?: string }[]; details?: unknown[] }[];
  if (!Array.isArray(list)) return [];
  return list.flatMap((item): RawWatch[] => {
    const id = videoIdFromUrl(item.titleUrl);
    const watchedAt = iso(item.time);
    // Ads show up in history with "details"; skip them.
    if (!id || !watchedAt || item.details) return [];
    return [
      {
        id,
        title: (item.title ?? "").replace(/^Watched /, "") || "YouTube video",
        channelId: channelIdFromUrl(item.subtitles?.[0]?.url),
        channelName: item.subtitles?.[0]?.name ?? null,
        watchedAt,
      },
    ];
  });
}

function parseHistoryHtml(text: string): RawWatch[] {
  const doc = new DOMParser().parseFromString(text, "text/html");
  const out: RawWatch[] = [];
  doc.querySelectorAll(".content-cell").forEach((cell) => {
    const links = [...cell.querySelectorAll("a")];
    const video = links.find((a) => videoIdFromUrl(a.getAttribute("href")));
    if (!video) return;
    const channel = links.find((a) => channelIdFromUrl(a.getAttribute("href")));
    const lines = (cell.textContent ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
    const watchedAt = iso(lines[lines.length - 1]?.replace(/ /g, " "));
    if (!watchedAt) return;
    out.push({
      id: videoIdFromUrl(video.getAttribute("href"))!,
      title: video.textContent?.trim() || "YouTube video",
      channelId: channelIdFromUrl(channel?.getAttribute("href")),
      channelName: channel?.textContent?.trim() ?? null,
      watchedAt,
    });
  });
  return out;
}

function parseLiked(text: string): string[] {
  return csvObjects(text, /^video id$/i)
    .map((r) => pick(r, /^video id$/))
    .filter((id) => VIDEO_ID.test(id));
}

/**
 * Reads the zip a piece at a time, so exports of any size work (Takeout zips
 * with your uploaded videos can be many GB). Only the small text files are
 * unpacked; videos stream past without being kept.
 */
async function unzip(file: File): Promise<Entry[]> {
  const { Unzip, UnzipInflate, strFromU8 } = await import("fflate");
  const entries: Entry[] = [];
  const pending: Promise<void>[] = [];
  const zip = new Unzip();
  zip.register(UnzipInflate);
  zip.onfile = (f) => {
    if (!WANTED.test(f.name) || (f.originalSize ?? 0) > MAX_TEXT_BYTES) return;
    const chunks: Uint8Array[] = [];
    pending.push(
      new Promise((resolve, reject) => {
        f.ondata = (err, data, final) => {
          if (err) return reject(err);
          chunks.push(data);
          if (!final) return;
          const all = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
          let at = 0;
          for (const c of chunks) {
            all.set(c, at);
            at += c.length;
          }
          entries.push({ path: f.name, text: async () => strFromU8(all) });
          resolve();
        };
      }),
    );
    f.start();
  };
  const reader = file.stream().getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      zip.push(new Uint8Array(0), true);
      break;
    }
    zip.push(value);
  }
  await Promise.all(pending);
  return entries;
}

export async function readTakeout(input: File[]): Promise<TakeoutData> {
  const entries: Entry[] = [];
  for (const file of input) {
    if (/\.zip$/i.test(file.name)) entries.push(...(await unzip(file)));
    else if (WANTED.test(file.name)) {
      entries.push({ path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name, text: () => file.text() });
    }
  }

  const subscriptions: TakeoutSubscription[] = [];
  const raw: RawWatch[] = [];
  const liked: string[] = [];
  let files = 0;
  for (const e of entries) {
    const path = e.path.toLowerCase();
    const name = baseName(path);
    try {
      if (name === "subscriptions.csv") subscriptions.push(...parseSubscriptions(await e.text()));
      else if (name === "watch-history.json") raw.push(...parseHistoryJson(await e.text()));
      else if (name === "watch-history.html") raw.push(...parseHistoryHtml(await e.text()));
      else if (path.endsWith(".csv") && /liked/.test(name)) liked.push(...parseLiked(await e.text()));
      else continue;
      files++;
    } catch {
      // A file we couldn't read; skip it.
    }
  }

  // History names channels without ids when it's the HTML version; subscriptions fill some in.
  const idByName = new Map(subscriptions.map((s) => [s.title.toLowerCase(), s.channelId]));
  const byVideo = new Map<string, TakeoutWatch>();
  for (const w of raw) {
    const channelId = w.channelId ?? (w.channelName ? (idByName.get(w.channelName.toLowerCase()) ?? null) : null);
    const seen = byVideo.get(w.id);
    if (!seen) byVideo.set(w.id, { ...w, channelId, count: 1 });
    else {
      seen.count++;
      if (w.watchedAt > seen.watchedAt) seen.watchedAt = w.watchedAt;
      seen.channelId ??= channelId;
    }
  }
  const history = [...byVideo.values()].sort((a, b) => b.watchedAt.localeCompare(a.watchedAt)).slice(0, 5000);
  const seenSubs = new Set<string>();
  return {
    subscriptions: subscriptions.filter((s) => !seenSubs.has(s.channelId) && seenSubs.add(s.channelId)),
    history,
    liked: [...new Set(liked)],
    files,
  };
}
