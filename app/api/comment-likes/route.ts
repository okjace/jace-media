import { NextResponse } from "next/server";
import { readJson, requireViewer } from "@/lib/auth";
import { COMMENT_KEY, setCommentLike } from "@/lib/commentlikes";

/** Like or unlike a comment: { key: "yt:<id>" | "jace:<id>" | "ext:<id>", like: boolean }. */
export async function POST(req: Request): Promise<NextResponse> {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const { key, like } = await readJson(req);
  if (typeof key !== "string" || !COMMENT_KEY.test(key)) return NextResponse.json({ error: "Bad comment." }, { status: 400 });
  return NextResponse.json(await setCommentLike(viewer.sub, key, like !== false));
}
