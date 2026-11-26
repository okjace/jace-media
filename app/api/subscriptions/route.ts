import { NextResponse } from "next/server";
import { readJson, requireViewer } from "@/lib/auth";
import { isSubKind, subscribe, unsubscribe, validRef } from "@/lib/library";

/** Follow (POST) or unfollow (DELETE) a channel, person, or community on any service. */
async function handle(req: Request, on: boolean): Promise<NextResponse> {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const { kind, ref, name, picture } = await readJson(req);
  if (!isSubKind(kind) || typeof ref !== "string" || !validRef(kind, ref)) {
    return NextResponse.json({ error: "That can't be followed." }, { status: 400 });
  }
  if (kind === "jace" && ref === viewer.sub) return NextResponse.json({ error: "That's you!" }, { status: 400 });
  if (on) {
    await subscribe(viewer.sub, {
      kind,
      ref,
      name: typeof name === "string" && name.trim() ? name.trim() : ref,
      picture: typeof picture === "string" && /^(https:\/\/|\/api\/images\/)/.test(picture) ? picture : null,
    });
  } else {
    await unsubscribe(viewer.sub, kind, ref);
  }
  return NextResponse.json({ subscribed: on });
}

export async function POST(req: Request) {
  return handle(req, true);
}
export async function DELETE(req: Request) {
  return handle(req, false);
}
