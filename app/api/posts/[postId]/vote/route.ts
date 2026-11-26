import { NextResponse } from "next/server";
import { readJson, requireViewer } from "@/lib/auth";
import { vote } from "@/lib/posts";

/** Vote in a poll: { option } (0-based). */
export async function POST(req: Request, ctx: RouteContext<"/api/posts/[postId]/vote">): Promise<NextResponse> {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const { option } = await readJson(req);
  const result = await vote(viewer.sub, (await ctx.params).postId, Number(option));
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json({ poll: result });
}
