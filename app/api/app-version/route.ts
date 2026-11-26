import { NextResponse } from "next/server";
import { appReleases } from "@/lib/appReleases";

/** The newest app for each platform, for the apps' update checks. */
export async function GET(): Promise<NextResponse> {
  const r = await appReleases();
  const pick = (f: typeof r.android) => (f ? { version: f.version, versionCode: f.versionCode, url: f.url, notes: f.notes } : null);
  return NextResponse.json(
    { android: pick(r.android), ios: pick(r.ios), webos: pick(r.webos), releases: r.page },
    { headers: { "Cache-Control": "public, max-age=300, s-maxage=600" } },
  );
}
