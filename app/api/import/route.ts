import { NextResponse } from "next/server";
import { readJson, requireViewer } from "@/lib/auth";
import { likeVideos, recordWatches, subscribe, type HistoryInput } from "@/lib/library";

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;

/**
 * Takes one chunk of a YouTube (Google Takeout) import, already read in the
 * browser: subscriptions, watch history, and liked videos. The browser sends
 * big imports in several chunks.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const b = await readJson(req);
  let subs = 0;
  let history = 0;
  let liked = 0;

  if (Array.isArray(b.subscriptions)) {
    for (const s of b.subscriptions.slice(0, 2000) as { channelId?: unknown; title?: unknown }[]) {
      if (typeof s?.channelId !== "string" || !CHANNEL_ID.test(s.channelId)) continue;
      await subscribe(viewer.sub, { kind: "youtube", ref: s.channelId, name: typeof s.title === "string" ? s.title : s.channelId, picture: null });
      subs++;
    }
  }
  if (Array.isArray(b.history)) {
    const entries: HistoryInput[] = [];
    for (const h of b.history.slice(0, 2000) as Record<string, unknown>[]) {
      if (typeof h?.id !== "string" || !VIDEO_ID.test(h.id)) continue;
      const at = typeof h.watchedAt === "string" ? Date.parse(h.watchedAt) : NaN;
      entries.push({
        source: "youtube",
        id: h.id,
        title: typeof h.title === "string" ? h.title : "YouTube video",
        channelId: typeof h.channelId === "string" && CHANNEL_ID.test(h.channelId) ? h.channelId : null,
        channelName: typeof h.channelName === "string" ? h.channelName : null,
        watchedAt: Number.isNaN(at) ? Date.now() : Math.min(at, Date.now()),
        count: typeof h.count === "number" ? h.count : 1,
      });
    }
    history = await recordWatches(viewer.sub, entries, { imported: true });
  }
  if (Array.isArray(b.liked)) {
    const ids = (b.liked.slice(0, 5000) as unknown[]).filter((id): id is string => typeof id === "string" && VIDEO_ID.test(id));
    await likeVideos(viewer.sub, "youtube", ids.map((id) => ({ id })));
    liked = ids.length;
  }
  return NextResponse.json({ subs, history, liked });
}
