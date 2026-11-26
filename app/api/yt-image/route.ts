import { NextResponse, type NextRequest } from "next/server";

/** Only YouTube's own picture servers: channel pictures and banners. */
const HOSTS = /^(yt3\.ggpht\.com|yt3\.googleusercontent\.com|i\.ytimg\.com|i[0-9]\.ytimg\.com)$/;

/**
 * Channel pictures and banners, fetched by Jace Media's server and cached on
 * Vercel's CDN, so your browser never asks YouTube for them.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  let url: URL;
  try {
    url = new URL(req.nextUrl.searchParams.get("u") ?? "");
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  if (url.protocol !== "https:" || !HOSTS.test(url.hostname)) return new NextResponse(null, { status: 400 });
  const res = await fetch(url, { next: { revalidate: 86_400 }, signal: AbortSignal.timeout(8_000) }).catch(() => null);
  if (!res || !res.ok || !(res.headers.get("content-type") ?? "").startsWith("image/")) return new NextResponse(null, { status: 404 });
  return new NextResponse(res.body, {
    headers: {
      "Content-Type": res.headers.get("content-type")!,
      "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
