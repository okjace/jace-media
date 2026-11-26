import "server-only";

/**
 * Private playback: YouTube videos played through your own Invidious server
 * (INVIDIOUS_URL, see docs/PRIVATE-PLAYBACK.md). Invidious fetches the video
 * from YouTube and passes it on, so the viewer's browser never talks to
 * YouTube: YouTube only ever sees the Invidious server. Videos then play in
 * Jace Media's own player, with no YouTube player and no YouTube ads.
 */

const BASE = (process.env.INVIDIOUS_URL || "").replace(/\/$/, "");

export const invidiousConfigured = /^https:\/\//.test(BASE);

export type PrivateSource = { url: string; type: string; quality: string; height: number };
export type PrivateCaption = { label: string; lang: string; url: string };
export type PrivateVideo = { sources: PrivateSource[]; captions: PrivateCaption[]; live: boolean };

type InvidiousVideo = {
  formatStreams?: { url: string; type: string; quality?: string; resolution?: string; container?: string }[];
  captions?: { label: string; language_code?: string; languageCode?: string; url: string }[];
  liveNow?: boolean;
};

const absolute = (url: string) => (url.startsWith("http") ? url : `${BASE}${url.startsWith("/") ? "" : "/"}${url}`);

/** The video's playable streams (sound and picture together) and captions, best quality first. Null if Invidious can't play it. */
export async function privateVideo(id: string): Promise<PrivateVideo | null> {
  if (!invidiousConfigured || !/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
  try {
    const res = await fetch(`${BASE}/api/v1/videos/${id}?local=true&fields=formatStreams,captions,liveNow`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as InvidiousVideo;
    const sources = (data.formatStreams ?? [])
      .filter((f) => f.url && /^video\//.test(f.type))
      .map((f) => {
        const height = Number((f.resolution ?? f.quality ?? "").match(/(\d{3,4})p/)?.[1] ?? 0);
        // local=true: the stream comes through Invidious too, not from YouTube.
        return { url: absolute(f.url), type: f.type.split(";")[0], quality: f.quality ?? `${height}p`, height };
      })
      .sort((a, b) => b.height - a.height);
    if (sources.length === 0 && !data.liveNow) return null;
    const captions = (data.captions ?? []).map((c) => ({
      label: c.label,
      lang: c.language_code ?? c.languageCode ?? "en",
      // Through Jace Media's server, so the browser can show them (and never asks YouTube).
      url: `/api/private/captions?id=${id}&label=${encodeURIComponent(c.label)}`,
    }));
    return { sources, captions, live: !!data.liveNow };
  } catch {
    return null;
  }
}

/** A caption track as WebVTT. */
export async function privateCaptions(id: string, label: string): Promise<string | null> {
  if (!invidiousConfigured || !/^[A-Za-z0-9_-]{11}$/.test(id) || label.length > 100) return null;
  try {
    const res = await fetch(`${BASE}/api/v1/captions/${id}?label=${encodeURIComponent(label)}`, {
      next: { revalidate: 86_400 },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text.startsWith("WEBVTT") ? text : null;
  } catch {
    return null;
  }
}
