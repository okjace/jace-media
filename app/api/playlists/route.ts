import { NextResponse, type NextRequest } from "next/server";
import { readJson, requireViewer } from "@/lib/auth";
import { createPlaylist, listPlaylists, playlistsWith } from "@/lib/playlists";

/** Your playlists (Watch Later first). With ?source=&id=, also which ones have that video. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const source = req.nextUrl.searchParams.get("source");
  const id = req.nextUrl.searchParams.get("id");
  const [playlists, has] = await Promise.all([listPlaylists(viewer.sub), source && id ? playlistsWith(viewer.sub, source, id) : Promise.resolve([])]);
  return NextResponse.json({ playlists, has });
}

export async function POST(req: Request): Promise<NextResponse> {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const { name } = await readJson(req);
  const result = await createPlaylist(viewer.sub, typeof name === "string" ? name : "");
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json({ playlist: result }, { status: 201 });
}
