import { NextResponse } from "next/server";
import { readJson, requireViewer } from "@/lib/auth";
import { saveFeed } from "@/lib/customfeeds";

/** Makes a custom feed. */
export async function POST(req: Request): Promise<NextResponse> {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const body = await readJson(req);
  const result = await saveFeed(viewer.sub, { name: body.name, rules: body.rules });
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json({ feed: result }, { status: 201 });
}
