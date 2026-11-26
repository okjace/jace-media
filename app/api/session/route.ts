import { NextResponse, type NextRequest } from "next/server";
import { JaceBanned, JaceUnauthorized, JaceUnavailable, getUserInfo } from "@/lib/jace";
import { markBanned, summary, syncProfile } from "@/lib/profiles";
import { ACCOUNTS_COOKIE, parseAccounts, withoutAccount, writeAccounts } from "@/lib/session";

/**
 * Re-checks the current account with Jace (once per page load). A ban
 * removes it from this device; an expired or revoked token removes it and
 * asks the person to sign in again; a new Jace name or picture is saved.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const accounts = parseAccounts(req.cookies.get(ACCOUNTS_COOKIE)?.value);
  const account = accounts.accounts.find((a) => a.sub === accounts.current);
  if (!account) return NextResponse.json({ ok: true, current: null });
  try {
    const info = await getUserInfo(account.token);
    if (info.banned) throw new JaceBanned();
    const profile = await syncProfile(info);
    return NextResponse.json({ ok: true, current: summary(profile) });
  } catch (err) {
    if (err instanceof JaceBanned || err instanceof JaceUnauthorized) {
      const banned = err instanceof JaceBanned;
      if (banned) await markBanned(account.sub).catch(() => {});
      const res = NextResponse.json({ ok: false, banned, expired: !banned });
      writeAccounts(res, withoutAccount(accounts, account.sub));
      return res;
    }
    if (err instanceof JaceUnavailable) return NextResponse.json({ ok: true, offline: true });
    throw err;
  }
}
