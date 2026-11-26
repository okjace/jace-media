import { NextResponse, type NextRequest } from "next/server";
import { readJson } from "@/lib/auth";
import { ACCOUNTS_COOKIE, markSignedOut, parseAccounts, withoutAccount, writeAccounts } from "@/lib/session";

/** Forgets one account on this device, with its token. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const { sub } = await readJson(req);
  if (typeof sub !== "string") return NextResponse.json({ error: "Which account?" }, { status: 400 });
  const accounts = parseAccounts(req.cookies.get(ACCOUNTS_COOKIE)?.value);
  const next = withoutAccount(accounts, sub);
  const res = NextResponse.json({ ok: true, remaining: next.accounts.length });
  writeAccounts(res, next);
  if (next.accounts.length === 0) markSignedOut(res);
  return res;
}
