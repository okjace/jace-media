import "server-only";
import { JACE_URL } from "./jace";

/**
 * Checks a picture address is one of yours on Jace's storage: an https file
 * in your own uploads folder there (Jace only lets you upload to your own
 * folder), so nobody can attach someone else's file or any other website.
 */
export function isOwnJaceUpload(url: unknown, sub: string): url is string {
  if (typeof url !== "string" || url.length > 600) return false;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const jaceHost = new URL(JACE_URL).host;
  const storageHost = u.protocol === "https:" && /\.supabase\.co$/.test(u.hostname);
  const mockHost = u.host === jaceHost && process.env.NODE_ENV !== "production";
  if (!storageHost && !mockHost) return false;
  return u.pathname.includes(`/thumbnails/${sub}/`) && !u.pathname.includes("..") && !u.search;
}
