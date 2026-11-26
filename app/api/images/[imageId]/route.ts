import { NextResponse } from "next/server";
import { getImage } from "@/lib/profiles";

/** Pictures uploaded to Jace Media (profile pictures and post images). Ids are random and never reused. */
export async function GET(_req: Request, ctx: RouteContext<"/api/images/[imageId]">): Promise<NextResponse> {
  const { imageId } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(imageId)) return new NextResponse(null, { status: 404 });
  const image = await getImage(imageId);
  if (!image) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(image.data), {
    headers: {
      "Content-Type": image.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
