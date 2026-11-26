import { NextResponse, type NextRequest } from "next/server";
import { readJson } from "@/lib/auth";
import { JaceBanned, JaceUnauthorized, JaceUnavailable, getUserInfo } from "@/lib/jace";
import { markBanned, syncProfile } from "@/lib/profiles";
import { ACCOUNTS_COOKIE, parseAccounts, withoutAccount, writeAccounts } from "@/lib/session";

/**
 * Switches to another remembered account using its stored token. If Jace says
 * that token is expired or revoked, the browser is told to sign that account
 * in again; a banned account is removed from the list.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const { sub } = await readJson(req);
  const accounts = parseAccounts(req.cookies.get(ACCOUNTS_COOKIE)?.value);
  const account = accounts.accounts.find((a) => a.sub === sub);
  if (!account) return NextResponse.json({ error: "That account isn't on this device anymore." }, { status: 404 });

  try {
    const info = await getUserInfo(account.token);
    if (info.banned) throw new JaceBanned();
    await syncProfile(info);
  } catch (err) {
    if (err instanceof JaceUnauthorized) {
      const res = NextResponse.json({ reauth: true });
      writeAccounts(res, withoutAccount(accounts, account.sub));
      return res;
    }
    if (err instanceof JaceBanned) {
      await markBanned(account.sub).catch(() => {});
      const res = NextResponse.json({ banned: true }, { status: 403 });
      writeAccounts(res, withoutAccount(accounts, account.sub));
      return res;
    }
    // Jace being down shouldn't stop switching; the next page load re-checks.
    if (!(err instanceof JaceUnavailable)) throw err;
  }
  const res = NextResponse.json({ ok: true });
  writeAccounts(res, { ...accounts, current: account.sub });
  return res;
}
