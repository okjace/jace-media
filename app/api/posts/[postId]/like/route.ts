import { NextResponse } from "next/server";
import { requireViewer } from "@/lib/auth";
import { setLike } from "@/lib/posts";

async function like(ctx: RouteContext<"/api/posts/[postId]/like">, liked: boolean): Promise<NextResponse> {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const { postId } = await ctx.params;
  const result = await setLike(viewer.sub, postId, liked);
  if (!result) return NextResponse.json({ error: "That post was deleted." }, { status: 404 });
  return NextResponse.json(result);
}

export async function POST(_req: Request, ctx: RouteContext<"/api/posts/[postId]/like">) {
  return like(ctx, true);
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/posts/[postId]/like">) {
  return like(ctx, false);
}
