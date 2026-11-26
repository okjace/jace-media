import { NextResponse } from "next/server";
import { readJson } from "@/lib/auth";
import { parseExtensions } from "@/lib/extensions";
import { getExtensions, markSetupDone, saveExtensions, saveServices } from "@/lib/prefs";
import { DEFAULT_SERVICES, isService } from "@/lib/services";
import { UNAVAILABLE_SERVICES } from "@/lib/live";

/** Finishes (or skips) the first-run setup: { services?, rating? }. */
export async function POST(req: Request): Promise<NextResponse> {
  const body = await readJson(req);
  const picked = Array.isArray(body.services) ? body.services.filter(isService).filter((s) => !UNAVAILABLE_SERVICES.includes(s)) : [];
  const res = NextResponse.json({ ok: true });
  await saveServices(res, picked.length ? picked : DEFAULT_SERVICES);
  if (body.rating === "kids" || body.rating === "teen" || body.rating === "all") {
    await saveExtensions(res, parseExtensions({ ...(await getExtensions()), rating: body.rating }));
  }
  markSetupDone(res);
  return res;
}
