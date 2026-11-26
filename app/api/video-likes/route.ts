import { NextResponse } from "next/server";
import { readJson, requireViewer } from "@/lib/auth";
import { likeVideos, unlikeVideo } from "@/lib/library";

async function handle(req: Request, on: boolean): Promise<NextResponse> {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const b = await readJson(req);
  if ((b.source !== "youtube" && b.source !== "jace") || typeof b.id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(b.id)) {
    return NextResponse.json({ error: "Bad video." }, { status: 400 });
  }
  if (on) await likeVideos(viewer.sub, b.source, [{ id: b.id, channelId: typeof b.channelId === "string" ? b.channelId : null }]);
  else await unlikeVideo(viewer.sub, b.source, b.id);
  return NextResponse.json({ liked: on });
}

export async function POST(req: Request) {
  return handle(req, true);
}
export async function DELETE(req: Request) {
  return handle(req, false);
}
