import { NextResponse } from "next/server";
import { readJson, requireViewer } from "@/lib/auth";
import { getAccounts } from "@/lib/session";
import { checkPin, setPin } from "@/lib/tvpin";

/** Unlocks a profile on this TV: { sub, pin }. The profile must be signed in on this device. */
export async function POST(req: Request): Promise<NextResponse> {
  const { sub, pin } = await readJson(req);
  const { accounts } = await getAccounts();
  if (typeof sub !== "string" || !accounts.some((a) => a.sub === sub)) return NextResponse.json({ error: "That profile isn't on this TV." }, { status: 404 });
  const result = await checkPin(sub, pin);
  return NextResponse.json(result, { status: result.ok ? 200 : 403 });
}

/** Sets, changes, or removes your PIN: { pin: "1234" | null, currentPin? }. */
export async function PUT(req: Request): Promise<NextResponse> {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const { pin, currentPin } = await readJson(req);
  const result = await setPin(viewer.sub, pin ?? null, currentPin);
  return NextResponse.json(result, { status: "error" in result ? 400 : 200 });
}
