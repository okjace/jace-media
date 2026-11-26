import { NextResponse } from "next/server";
import { requireViewer } from "@/lib/auth";
import { deletePost } from "@/lib/posts";

export async function DELETE(_req: Request, ctx: RouteContext<"/api/posts/[postId]">): Promise<NextResponse> {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const { postId } = await ctx.params;
  if (!(await deletePost(viewer, postId))) return NextResponse.json({ error: "You can't delete that post." }, { status: 403 });
  return NextResponse.json({ ok: true });
}
