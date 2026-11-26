import { NextResponse } from "next/server";
import { privateVideo } from "@/lib/invidious";

/** Streams and captions for private playback of a YouTube video (404 when it can't be played privately). */
export async function GET(_req: Request, ctx: RouteContext<"/api/private/[videoId]">): Promise<NextResponse> {
  const video = await privateVideo((await ctx.params).videoId);
  if (!video) return NextResponse.json({ error: "Not available privately." }, { status: 404 });
  // Stream addresses expire, so never cache them.
  return NextResponse.json(video, { headers: { "Cache-Control": "no-store" } });
}
