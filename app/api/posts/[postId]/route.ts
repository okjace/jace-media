import { NextResponse } from "next/server";
import { readJson, requireViewer } from "@/lib/auth";
import { deletePost, editPost } from "@/lib/posts";

export async function DELETE(_req: Request, ctx: RouteContext<"/api/posts/[postId]">): Promise<NextResponse> {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const { postId } = await ctx.params;
  if (!(await deletePost(viewer, postId))) return NextResponse.json({ error: "You can't delete that post." }, { status: 403 });
  return NextResponse.json({ ok: true });
}

/** Edit your own post: { body }. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/posts/[postId]">): Promise<NextResponse> {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const { body } = await readJson(req);
  const result = await editPost(viewer, (await ctx.params).postId, typeof body === "string" ? body : "");
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}
