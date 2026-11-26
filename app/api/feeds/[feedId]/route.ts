import { NextResponse } from "next/server";
import { readJson, requireViewer } from "@/lib/auth";
import { deleteFeed, saveFeed } from "@/lib/customfeeds";

export async function PATCH(req: Request, ctx: RouteContext<"/api/feeds/[feedId]">): Promise<NextResponse> {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const { feedId } = await ctx.params;
  const body = await readJson(req);
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
