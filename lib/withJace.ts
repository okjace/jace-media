import "server-only";
import { NextResponse } from "next/server";
import { JaceError, JaceUnauthorized, JaceUnavailable } from "./jace";
import { getCurrent } from "./session";

/**
 * Runs a request that acts on Jace as the signed-in account and turns Jace's
 * answers into friendly ones (an expired sign-in, a muted account, a bad title…).
 */
export async function withJace(fn: (token: string) => Promise<unknown>): Promise<NextResponse> {
  const current = await getCurrent();
  if (!current) return NextResponse.json({ error: "Sign in with Jace first." }, { status: 401 });
  try {
    return NextResponse.json(await fn(current.token));
  } catch (err) {
    if (err instanceof JaceUnauthorized) return NextResponse.json({ error: "Your Jace sign-in expired. Sign in again." }, { status: 401 });
    if (err instanceof JaceError) {
      const message = err.code === "insufficient_scope" ? "Sign out and sign in with Jace again to upload videos." : err.message;
      return NextResponse.json({ error: message }, { status: err.status });
    }
    if (err instanceof JaceUnavailable) return NextResponse.json({ error: "Jace videos aren't available right now. Try again soon." }, { status: 503 });
    console.error(err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
