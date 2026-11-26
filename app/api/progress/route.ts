import { NextResponse } from "next/server";
import { readJson, requireViewer } from "@/lib/auth";
import { saveProgress } from "@/lib/playlists";

/** Where you are in a video, for Continue watching on every device. */
export async function POST(req: Request): Promise<NextResponse> {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const { source, id, position, duration } = await readJson(req);
  if ((source !== "youtube" && source !== "jace") || typeof id !== "string" || typeof position !== "number" || typeof duration !== "number") {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  if (!Number.isFinite(position) || !Number.isFinite(duration) || position < 0 || duration <= 0) return NextResponse.json({ ok: false });
  await saveProgress(viewer.sub, source, id, position, duration);
  return NextResponse.json({ ok: true });
}
