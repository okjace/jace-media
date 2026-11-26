import { NextResponse } from "next/server";
import { readJson, requireViewer } from "@/lib/auth";
import { createPost } from "@/lib/posts";

export async function POST(req: Request): Promise<NextResponse> {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const body = await readJson(req);
  const result = await createPost(viewer, {
    body: typeof body.body === "string" ? body.body : "",
    parentId: typeof body.parentId === "string" ? body.parentId : null,
    image: typeof body.image === "string" ? body.image : null,
  });
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result, { status: 201 });
}
