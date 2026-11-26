import { NextResponse } from "next/server";
import { readJson, requireViewer } from "@/lib/auth";
import { RESET_PARTS, resetLibrary, type ResetPart } from "@/lib/library";
import { getExtensions, saveExtensions } from "@/lib/prefs";

/** Resets parts of your library: { parts: ["history", "likes", ...] }. */
export async function POST(req: Request): Promise<NextResponse> {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const { parts } = await readJson(req);
  const chosen = Array.isArray(parts) ? RESET_PARTS.filter((p) => parts.includes(p)) : [];
  if (!chosen.length) return NextResponse.json({ error: "Pick something to reset." }, { status: 400 });
  await resetLibrary(viewer.sub, chosen as ResetPart[]);
  const res = NextResponse.json({ ok: true, reset: chosen });
  // A deleted feed can't stay your Home.
  if (chosen.includes("feeds")) {
    const ext = await getExtensions();
    if (ext.homeFeed) await saveExtensions(res, { ...ext, homeFeed: null });
  }
  return res;
}
