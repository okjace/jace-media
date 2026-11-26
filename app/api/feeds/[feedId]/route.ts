import { NextResponse } from "next/server";
import { readJson, requireViewer } from "@/lib/auth";
import { copySharedFeed, deleteFeed, saveFeed, setShared } from "@/lib/customfeeds";

export async function PATCH(req: Request, ctx: RouteContext<"/api/feeds/[feedId]">): Promise<NextResponse> {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const { feedId } = await ctx.params;
  const body = await readJson(req);
  // { shared: true | false } turns the share link on or off.
  if (typeof body.shared === "boolean" && body.name === undefined) {
    return (await setShared(viewer.sub, feedId, body.shared)) ? NextResponse.json({ ok: true, shared: body.shared }) : NextResponse.json({ error: "Not your feed." }, { status: 404 });
  }
  const result = await saveFeed(viewer.sub, { id: feedId, name: body.name, rules: body.rules });
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json({ feed: result });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/feeds/[feedId]">): Promise<NextResponse> {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const { feedId } = await ctx.params;
  await deleteFeed(viewer.sub, feedId);
  return NextResponse.json({ ok: true });
}

/** Saves a copy of someone's shared feed to your feeds. */
export async function POST(_req: Request, ctx: RouteContext<"/api/feeds/[feedId]">): Promise<NextResponse> {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const { feedId } = await ctx.params;
  const result = await copySharedFeed(viewer.sub, feedId);
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json({ feed: result }, { status: 201 });
}
