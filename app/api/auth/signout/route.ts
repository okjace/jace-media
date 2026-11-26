import { NextResponse, type NextRequest } from "next/server";
import { ACCOUNTS_COOKIE, markSignedOut, parseAccounts, withoutAccount, writeAccounts } from "@/lib/session";

/**
 * Signs out of Jace Media (the Jace account itself stays signed in on Jace).
 * ?all=1 forgets every account on this device; otherwise only the current one,
 * and the next remembered account takes over. Either way, no automatic
 * sign-in happens again until the person signs in themselves.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const all = req.nextUrl.searchParams.get("all") === "1";
  const accounts = parseAccounts(req.cookies.get(ACCOUNTS_COOKIE)?.value);
  const next = all || !accounts.current ? { current: null, accounts: [] } : withoutAccount(accounts, accounts.current);
  const res = NextResponse.json({ ok: true, remaining: next.accounts.length });
  writeAccounts(res, next);
  markSignedOut(res);
  return res;
}
