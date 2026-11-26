import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { q } from "./db";
import { parseExtensions, type Extensions } from "./extensions";
import { getCurrent } from "./session";
import { ALL_SERVICES, parseServices, type Service } from "./services";

/**
 * Preferences: which services to show, and which extensions are on. Signed
 * in, they're saved on the account (so they follow you to every device);
 * signed out, in a cookie on this device.
 */

export const SERVICES_COOKIE = "jm_services";
export const EXTENSIONS_COOKIE = "jm_extensions";

const COOKIE = { path: "/", sameSite: "lax" as const, maxAge: 60 * 60 * 24 * 365, httpOnly: true };

/** Both saved preferences for the signed-in account, read once per request. */
const accountPrefs = cache(async (): Promise<{ services: string | null; extensions: string | null } | null> => {
  const current = await getCurrent();
  if (!current) return null;
  try {
    const rows = await q(`SELECT services, extensions FROM profiles WHERE sub = $1`, [current.sub]);
    return rows[0] ? { services: (rows[0].services as string) ?? null, extensions: (rows[0].extensions as string) ?? null } : null;
  } catch {
    return null;
  }
});

export const getServices = cache(async (): Promise<Service[]> => {
  const saved = (await accountPrefs())?.services;
  return parseServices(saved ?? (await cookies()).get(SERVICES_COOKIE)?.value);
});

export const getExtensions = cache(async (): Promise<Extensions> => {
  const saved = (await accountPrefs())?.extensions;
  return parseExtensions(saved ?? (await cookies()).get(EXTENSIONS_COOKIE)?.value ?? "{}");
});

export async function saveServices(res: NextResponse, services: Service[]): Promise<void> {
  const value = JSON.stringify(services.length ? services : ALL_SERVICES);
  res.cookies.set(SERVICES_COOKIE, value, COOKIE);
  const current = await getCurrent();
  if (current) await q(`UPDATE profiles SET services = $2 WHERE sub = $1`, [current.sub, value]);
}

export async function saveExtensions(res: NextResponse, extensions: Extensions): Promise<void> {
  const value = JSON.stringify(extensions);
  res.cookies.set(EXTENSIONS_COOKIE, value, COOKIE);
  const current = await getCurrent();
  if (current) await q(`UPDATE profiles SET extensions = $2 WHERE sub = $1`, [current.sub, value]);
}
