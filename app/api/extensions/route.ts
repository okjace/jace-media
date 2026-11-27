import { NextResponse } from "next/server";
import { readJson } from "@/lib/auth";
import { parseExtensions } from "@/lib/extensions";
import { getExtensions, saveExtensions } from "@/lib/prefs";

/** Saves which extensions are on. */
export async function PUT(req: Request): Promise<NextResponse> {
  const body = await readJson(req);
  // { merge: true, ...changes }: change only those settings (the apps send one at a time).
  const extensions = parseExtensions(body.merge ? { ...(await getExtensions()), ...body } : body);
  const res = NextResponse.json({ ok: true, extensions });
  await saveExtensions(res, extensions);
  return res;
}
