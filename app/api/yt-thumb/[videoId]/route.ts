import { NextResponse, type NextRequest } from "next/server";

const SIZES = new Set(["default", "mqdefault", "hqdefault", "sddefault", "maxresdefault"]);

/**
 * YouTube thumbnails, fetched by Jace Media's server and cached on Vercel's
 * CDN, so your browser never contacts YouTube just to show a list of videos.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/yt-thumb/[videoId]">): Promise<NextResponse> {
  const { videoId } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return new NextResponse(null, { status: 404 });
  const wanted = req.nextUrl.searchParams.get("s") ?? "hqdefault";
  const size = SIZES.has(wanted) ? wanted : "hqdefault";
  let res = await fetch(`https://i.ytimg.com/vi/${videoId}/${size}.jpg`, { next: { revalidate: 86_400 } }).catch(() => null);
  // Not every video has the biggest sizes.
  if ((!res || !res.ok) && size !== "hqdefault") res = await fetch(`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`, { next: { revalidate: 86_400 } }).catch(() => null);
  if (!res || !res.ok) return new NextResponse(null, { status: 404 });
  return new NextResponse(res.body, {
    headers: {
      "Content-Type": res.headers.get("content-type") ?? "image/jpeg",
      "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
