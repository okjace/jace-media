import { NextResponse, type NextRequest } from "next/server";
import { readJson, requireViewer } from "@/lib/auth";
import { addExtComment, deleteExtComment, editExtComment, isExtNetwork } from "@/lib/extcomments";

/** Comment on a post from another network: { network, postId, body }. */
export async function POST(req: Request): Promise<NextResponse> {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const { network, postId, body } = await readJson(req);
  if (!isExtNetwork(network) || typeof postId !== "string" || typeof body !== "string") {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const result = await addExtComment(viewer, network, postId, body);
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result, { status: 201 });
}

/** ?id= deletes your own comment (admins can delete any). */
export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!(await deleteExtComment(viewer, id))) return NextResponse.json({ error: "You can't delete that." }, { status: 403 });
  return NextResponse.json({ ok: true });
}

/** ?id= edits your own comment: { body }. */
export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const { body } = await readJson(req);
  const result = await editExtComment(viewer, req.nextUrl.searchParams.get("id") ?? "", typeof body === "string" ? body : "");
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}
