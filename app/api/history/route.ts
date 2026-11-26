import { NextResponse } from "next/server";
import { readJson, requireViewer } from "@/lib/auth";
import { clearHistory, recordWatches } from "@/lib/library";

/** Records that the signed-in person watched a video (used for recommendations). */
export async function POST(req: Request): Promise<NextResponse> {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const b = await readJson(req);
  if ((b.source !== "youtube" && b.source !== "jace") || typeof b.id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(b.id)) {
    return NextResponse.json({ error: "Bad video." }, { status: 400 });
  }
  await recordWatches(viewer.sub, [
    {
      source: b.source,
      id: b.id,
      title: typeof b.title === "string" ? b.title : "Video",
      channelId: typeof b.channelId === "string" ? b.channelId : null,
      channelName: typeof b.channelName === "string" ? b.channelName : null,
      thumbnail: typeof b.thumbnail === "string" && /^(\/api\/yt-thumb\/|https:\/\/)/.test(b.thumbnail) ? b.thumbnail : null,
    },
  ]);
  return NextResponse.json({ ok: true });
}

/** Clears watch history. */
export async function DELETE(): Promise<NextResponse> {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  await clearHistory(viewer.sub);
  return NextResponse.json({ ok: true });
}
