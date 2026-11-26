import { NextResponse, type NextRequest } from "next/server";
import { privateCaptions } from "@/lib/invidious";

/** A caption track for private playback (WebVTT), fetched through Invidious. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const label = req.nextUrl.searchParams.get("label") ?? "";
  const vtt = await privateCaptions(id, label);
  if (!vtt) return new NextResponse(null, { status: 404 });
  return new NextResponse(vtt, {
    headers: { "Content-Type": "text/vtt; charset=utf-8", "Cache-Control": "public, max-age=86400, s-maxage=604800" },
  });
}
