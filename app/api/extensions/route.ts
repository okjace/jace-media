import { NextResponse } from "next/server";
import { readJson } from "@/lib/auth";
import { parseExtensions } from "@/lib/extensions";
import { saveExtensions } from "@/lib/prefs";

/** Saves which extensions are on. */
export async function PUT(req: Request): Promise<NextResponse> {
  const extensions = parseExtensions(await readJson(req));
  const res = NextResponse.json({ ok: true, extensions });
  await saveExtensions(res, extensions);
  return res;
}
