import { NextResponse } from "next/server";
import { readJson, requireViewer } from "@/lib/auth";
import { updateProfile, type ProfilePatch } from "@/lib/profiles";

/** Changes the Jace Media name, bio, or picture. Jace itself is never changed. */
export async function PATCH(req: Request): Promise<NextResponse> {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const body = await readJson(req);
  const patch: ProfilePatch = {};
  if (body.name === null || typeof body.name === "string") patch.name = body.name;
  if (typeof body.bio === "string") patch.bio = body.bio;
  if (body.picture === null || typeof body.picture === "string") patch.picture = body.picture;
  const result = await updateProfile(viewer.sub, patch);
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json({ profile: result });
}
