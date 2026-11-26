import type { JaceVideo, VideoCard } from "./types";

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];
const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "3 days ago", "last month", … */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const seconds = (Date.parse(iso) - Date.now()) / 1000;
  if (Number.isNaN(seconds)) return "";
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

export function views(n: number | null | undefined): string {
  if (n === null || n === undefined) return "";
  return `${compact.format(n)} view${n === 1 ? "" : "s"}`;
}

export function count(n: number, word: string): string {
  return `${compact.format(n)} ${word}${n === 1 ? "" : "s"}`;
}

/** ISO 8601 duration (PT1H2M3S) → "1:02:03". */
export function duration(iso: string | null | undefined): string {
  const m = iso?.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return "";
  const hours = Number(m[1] ?? 0) * 24 + Number(m[2] ?? 0);
  const minutes = Number(m[3] ?? 0);
  const seconds = Number(m[4] ?? 0);
  if (!hours && !minutes && !seconds) return "LIVE";
  const ss = String(seconds).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${ss}` : `${minutes}:${ss}`;
}

export function bytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function date(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en", { year: "numeric", month: "short", day: "numeric" });
}

export function jaceCard(v: JaceVideo): VideoCard {
  return {
    source: "jace",
    id: v.id,
    title: v.title,
    thumbnail: v.thumbnail_url,
    channelId: v.owner_id,
    channelName: v.owner_name,
    channelPicture: v.owner_picture,
    publishedAt: v.created_at,
    visibility: v.visibility,
    // Jace has no Shorts flag yet: a #shorts tag in the title or description marks one.
    short: /#shorts?\b/i.test(`${v.title} ${v.description}`),
    src: v.url,
  };
}

export function watchHref(card: Pick<VideoCard, "source" | "id" | "short">): string {
  if (card.short) return `/shorts?v=${card.source}:${encodeURIComponent(card.id)}`;
  return `/watch/${card.source}/${encodeURIComponent(card.id)}`;
}

/** Channels open where they live: Jace channels on JaceTube, YouTube channels on YouTube. */
export function channelHref(card: Pick<VideoCard, "source" | "channelId">): string {
  return card.source === "jace"
    ? `https://jacetube.vercel.app/channel/jace/${encodeURIComponent(card.channelId)}`
    : `https://www.youtube.com/channel/${encodeURIComponent(card.channelId)}`;
}
