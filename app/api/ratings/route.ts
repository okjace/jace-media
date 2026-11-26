import { NextResponse } from "next/server";
import { readJson, requireViewer } from "@/lib/auth";
import { q } from "@/lib/db";

/** Rate a post or video: { target: "network:id", rating: 1 (appropriate), -1 (inappropriate), or 0 (clear) }. */
export async function POST(req: Request): Promise<NextResponse> {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const { target, rating } = await readJson(req);
  if (typeof target !== "string" || !/^(jace|jacevideo|youtube|bluesky|mastodon|lemmy|hackernews):.{1,300}$/.test(target) || ![1, -1, 0].includes(rating as number)) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  if (rating === 0) await q(`DELETE FROM content_ratings WHERE sub = $1 AND target = $2`, [viewer.sub, target]);
  else {
    await q(
      `INSERT INTO content_ratings (sub, target, rating, created_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT (sub, target) DO UPDATE SET rating = EXCLUDED.rating, created_at = EXCLUDED.created_at`,
      [viewer.sub, target, rating, Date.now()],
    );
  }
  return NextResponse.json({ ok: true });
}
