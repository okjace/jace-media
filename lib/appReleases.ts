import "server-only";

/**
 * The phone and TV apps' releases, from GitHub (okjace/jace-media releases
 * tagged apps-v1.2.3, built by .github/workflows/apps.yml). Cached for 10 minutes.
 */

const REPO = "okjace/jace-media";

export type AppFile = { version: string; versionCode: number; url: string; size: number; date: string; notes: string };
type Kind = "android" | "ios" | "webos" | "windows" | "mac" | "linux" | "linuxDeb";
export type AppReleases = Record<Kind, AppFile | null> & { iosVersions: AppFile[]; page: string };

const FILES: Record<string, Kind> = {
  "android.apk": "android",
  "ios.ipa": "ios",
  "webos.ipk": "webos",
  "windows-setup.exe": "windows",
  "mac.dmg": "mac",
  "linux.AppImage": "linux",
  "linux.deb": "linuxDeb",
};

const code = (v: string) => {
  const [a = 0, b = 0, c = 0] = v.split(".").map((x) => Number(x) || 0);
  return a * 10000 + b * 100 + c;
};

type GhRelease = { tag_name: string; draft: boolean; prerelease: boolean; published_at: string; body: string | null; html_url: string; assets: { name: string; browser_download_url: string; size: number }[] };

export async function appReleases(): Promise<AppReleases> {
  const empty: AppReleases = { android: null, ios: null, webos: null, windows: null, mac: null, linux: null, linuxDeb: null, iosVersions: [], page: `https://github.com/${REPO}/releases` };
  let releases: GhRelease[];
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=30`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "JaceMedia" },
      next: { revalidate: 600 },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return empty;
    releases = (await res.json()) as GhRelease[];
  } catch {
    return empty;
  }
  const out = { ...empty };
  for (const r of releases) {
    if (r.draft || r.prerelease || !r.tag_name.startsWith("apps-v")) continue;
    const notes = (r.body ?? "").split("\n---")[0].slice(0, 4000);
    for (const a of r.assets) {
      const m = a.name.match(/^JaceMedia-(\d+\.\d+\.\d+)-(.+)$/);
      if (!m || !FILES[m[2]]) continue;
      const file: AppFile = { version: m[1], versionCode: code(m[1]), url: a.browser_download_url, size: a.size, date: r.published_at, notes };
      const kind = FILES[m[2]];
      if (kind === "ios") out.iosVersions.push(file);
      if (!out[kind] || file.versionCode > out[kind]!.versionCode) out[kind] = file;
    }
  }
  out.iosVersions.sort((x, y) => y.versionCode - x.versionCode);
  return out;
}
