import { NextResponse } from "next/server";
import { readJson } from "@/lib/auth";
import { JaceError, JaceUnauthorized, addVideoComment } from "@/lib/jace";
import { getCurrent } from "@/lib/session";

/** Comment on a Jace video: { network: "jace", postId: <video id>, body }. Saved on Jace. */
export async function POST(req: Request): Promise<NextResponse> {
  const current = await getCurrent();
  if (!current) return NextResponse.json({ error: "Sign in with Jace first." }, { status: 401 });
  const { postId, body } = await readJson(req);
  const text = typeof body === "string" ? body.trim() : "";
  if (typeof postId !== "string" || !text) return NextResponse.json({ error: "Write something first." }, { status: 400 });
  if (text.length > 1000) return NextResponse.json({ error: "Comments can be up to 1000 characters." }, { status: 400 });
  try {
    await addVideoComment(current.token, postId, text);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    if (err instanceof JaceUnauthorized) return NextResponse.json({ error: "Your Jace sign-in expired. Sign in again." }, { status: 401 });
    if (err instanceof JaceError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Jace isn't answering. Try again soon." }, { status: 503 });
  }
}
