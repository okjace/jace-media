import "server-only";

/**
 * SponsorBlock (https://sponsor.ajay.app): a free, community-made list of the
 * parts of YouTube videos that are ads read by the creator ("this video is
 * sponsored by…"), self-promotion, and "like and subscribe" reminders. The
 * player skips them automatically.
 */

import type { Segment, SegmentCategory } from "./segments";

export type { Segment };

const CATEGORIES: SegmentCategory[] = ["sponsor", "selfpromo", "interaction", "intro", "outro", "preview", "music_offtopic"];

export async function sponsorSegments(videoId: string): Promise<Segment[]> {
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return [];
  const url = `https://sponsor.ajay.app/api/skipSegments?videoID=${videoId}&categories=${encodeURIComponent(JSON.stringify(CATEGORIES))}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "JaceMedia/0.1 (+https://github.com/okjace/jace-media)" },
      next: { revalidate: 1800 },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return []; // 404 means nobody marked anything in this video
    const data = (await res.json()) as { category: SegmentCategory; actionType: string; segment: [number, number] }[];
    return data
      .filter((s) => s.actionType === "skip" && CATEGORIES.includes(s.category) && s.segment[1] > s.segment[0])
      .map((s) => ({ start: s.segment[0], end: s.segment[1], category: s.category }))
      .sort((a, b) => a.start - b.start);
  } catch {
    return [];
  }
}
