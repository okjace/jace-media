import { NextResponse } from "next/server";
import { readJson, requireViewer } from "@/lib/auth";
import { createPost } from "@/lib/posts";
import { resolvePost } from "@/lib/resolvePost";

/**
 * Posts on Jace Media: { body, parentId?, image?, quote?: { network, id }, poll?: { options, days } }.
 * A quote with no body is a repost.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const body = await readJson(req);

  let quote = null;
  if (body.quote && typeof body.quote === "object") {
    const ref = body.quote as Record<string, unknown>;
    quote = await resolvePost(ref.network, ref.id, viewer);
    if (!quote) return NextResponse.json({ error: "That post can't be found anymore." }, { status: 404 });
  }
  const pollIn = body.poll && typeof body.poll === "object" ? (body.poll as Record<string, unknown>) : null;
  const poll = pollIn && Array.isArray(pollIn.options) ? { options: pollIn.options.filter((o): o is string => typeof o === "string"), days: Number(pollIn.days) || 1 } : null;

  const result = await createPost(viewer, {
    body: typeof body.body === "string" ? body.body : "",
    parentId: typeof body.parentId === "string" ? body.parentId : null,
    image: typeof body.image === "string" ? body.image : null,
    quote,
    poll,
  });
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result, { status: 201 });
}
