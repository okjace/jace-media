import { NextResponse, type NextRequest } from "next/server";
import { requireViewer } from "@/lib/auth";
import { listNotifications, markAllRead, unreadCount } from "@/lib/notifications";

/** ?count=1 gives just the unread count (the bell asks once a minute); otherwise the latest notifications. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  if (req.nextUrl.searchParams.get("count")) return NextResponse.json({ unread: await unreadCount(viewer.sub) });
  return NextResponse.json({ notifications: await listNotifications(viewer.sub, 30), unread: await unreadCount(viewer.sub) });
}

/** Marks everything read. */
export async function POST(): Promise<NextResponse> {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  await markAllRead(viewer.sub);
  return NextResponse.json({ ok: true });
}
