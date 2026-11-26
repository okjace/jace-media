import { NextResponse } from "next/server";
import { readJson, requireViewer } from "@/lib/auth";
import { deletePlaylist, renamePlaylist } from "@/lib/playlists";

export async function PATCH(req: Request, ctx: RouteContext<"/api/playlists/[playlistId]">): Promise<NextResponse> {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const { playlistId } = await ctx.params;
  const { name } = await readJson(req);
  if (!(await renamePlaylist(viewer.sub, playlistId, typeof name === "string" ? name : ""))) {
    return NextResponse.json({ error: "Couldn't rename that playlist." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/playlists/[playlistId]">): Promise<NextResponse> {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  await deletePlaylist(viewer.sub, (await ctx.params).playlistId);
  return NextResponse.json({ ok: true });
}
