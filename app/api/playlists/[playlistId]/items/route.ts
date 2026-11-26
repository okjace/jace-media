import { NextResponse } from "next/server";
import { readJson, requireViewer } from "@/lib/auth";
import { addToPlaylist, removeFromPlaylist } from "@/lib/playlists";
import { parseVideo } from "@/lib/videoInput";

/** Add a video: { video }. The playlist id "watch-later" means Watch Later. */
export async function POST(req: Request, ctx: RouteContext<"/api/playlists/[playlistId]/items">): Promise<NextResponse> {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const video = parseVideo((await readJson(req)).video);
  if (!video) return NextResponse.json({ error: "Bad video." }, { status: 400 });
  if (!(await addToPlaylist(viewer.sub, (await ctx.params).playlistId, video))) return NextResponse.json({ error: "No such playlist." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

/** Remove a video: { source, id }. */
export async function DELETE(req: Request, ctx: RouteContext<"/api/playlists/[playlistId]/items">): Promise<NextResponse> {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const { source, id } = await readJson(req);
  if (typeof source !== "string" || typeof id !== "string") return NextResponse.json({ error: "Bad request." }, { status: 400 });
  await removeFromPlaylist(viewer.sub, (await ctx.params).playlistId, source, id);
  return NextResponse.json({ ok: true });
}
