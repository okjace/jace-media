import { NextResponse } from "next/server";
import { readJson } from "@/lib/auth";
import { saveServices } from "@/lib/prefs";
import { isService } from "@/lib/services";

/** Saves which services to show. */
export async function PUT(req: Request): Promise<NextResponse> {
  const body = await readJson(req);
  const services = Array.isArray(body.services) ? body.services.filter(isService) : [];
  if (services.length === 0) return NextResponse.json({ error: "Pick at least one service." }, { status: 400 });
  const res = NextResponse.json({ ok: true, services });
  await saveServices(res, services);
  return res;
}
