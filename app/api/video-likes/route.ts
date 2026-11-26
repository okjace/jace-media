import { NextResponse } from "next/server";
import { readJson, requireViewer } from "@/lib/auth";
import { setVideoLike } from "@/lib/jace";
import { videoVote, voteVideo } from "@/lib/library";
import { getCurrent } from "@/lib/session";

/**
 * Vote on a video: { source, id, channelId?, value: 1 (like) | -1 (dislike) | 0 (clear) }.
 * Votes teach your recommendations. On Jace videos, likes also count on Jace.
 */
async function handle(req: Request, fallback: 1 | 0): Promise<NextResponse> {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const b = await readJson(req);
  if ((b.source !== "youtube" && b.source !== "jace") || typeof b.id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(b.id)) {
    return NextResponse.json({ error: "Bad video." }, { status: 400 });
  }
  const value = b.value === 1 || b.value === -1 || b.value === 0 ? b.value : fallback;
  const before = await videoVote(viewer.sub, b.source, b.id);
  await voteVideo(viewer.sub, b.source, b.id, typeof b.channelId === "string" ? b.channelId : null, value);
  if (b.source === "jace" && (before === 1) !== (value === 1)) {
    const current = await getCurrent();
    if (current) await setVideoLike(current.token, b.id, value === 1).catch(() => {});
  }
  return NextResponse.json({ value });
}

export async function POST(req: Request) {
  return handle(req, 1);
}
export async function DELETE(req: Request) {
  return handle(req, 0);
}
