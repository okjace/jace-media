import { NextResponse } from "next/server";
import { readJson, requireViewer } from "@/lib/auth";
import { hide, unhideAll } from "@/lib/library";

/** "Not interested" (kind video) or "Don't recommend channel" (kind channel). */
export async function POST(req: Request): Promise<NextResponse> {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const { kind, ref } = await readJson(req);
  if ((kind !== "video" && kind !== "channel") || typeof ref !== "string" || ref.length > 200) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  await hide(viewer.sub, kind, ref);
  return NextResponse.json({ ok: true });
}

/** Brings back everything hidden. */
export async function DELETE(): Promise<NextResponse> {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  await unhideAll(viewer.sub);
  return NextResponse.json({ ok: true });
}
