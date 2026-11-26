import "server-only";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { q } from "./db";
import { getCurrent } from "./session";
import { ALL_SERVICES, parseServices, type Service } from "./services";

export const SERVICES_COOKIE = "jm_services";

/**
 * The services someone wants to see. Signed in, it's saved on their account
 * (so it follows them to every device); signed out, in a cookie on this device.
 */
export async function getServices(): Promise<Service[]> {
  const current = await getCurrent();
  if (current) {
    try {
      const rows = await q(`SELECT services FROM profiles WHERE sub = $1`, [current.sub]);
      if (rows[0]?.services) return parseServices(rows[0].services as string);
    } catch {
      // fall through to the cookie
    }
  }
  return parseServices((await cookies()).get(SERVICES_COOKIE)?.value);
}

export async function saveServices(res: NextResponse, services: Service[]): Promise<void> {
  const value = JSON.stringify(services.length ? services : ALL_SERVICES);
  res.cookies.set(SERVICES_COOKIE, value, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365, httpOnly: true });
  const current = await getCurrent();
  if (current) await q(`UPDATE profiles SET services = $2 WHERE sub = $1`, [current.sub, value]);
}
