import { NextResponse } from "next/server";
import { appReleases } from "@/lib/appReleases";

const SITE = "https://jace-media.vercel.app";

/**
 * The AltStore / SideStore source (their "apps.json" format). Add it once in
 * AltStore or SideStore and they install the iPhone app and keep it updated.
 */
export async function GET(): Promise<NextResponse> {
  const r = await appReleases();
  return NextResponse.json(
    {
      name: "Jace Media",
      identifier: "com.okjace.jacemedia.source",
      website: SITE,
      subtitle: "Posts and videos from everywhere, with no ads",
      iconURL: `${SITE}/icon-512.png`,
      tintColor: "3ddc84",
      apps: [
        {
          name: "Jace Media",
          bundleIdentifier: "com.okjace.jacemedia",
          developerName: "okjace",
          subtitle: "Jace, YouTube, Bluesky, Mastodon, Lemmy, and more. No ads.",
          localizedDescription:
            "Jace Media puts Jace posts, Jace and YouTube videos and Shorts, Bluesky, Mastodon, Lemmy, Hacker News, news sites, and live games in one app, with no ads, recommendations made for you, custom feeds, and Sign in with Jace.",
          iconURL: `${SITE}/icon-512.png`,
          tintColor: "3ddc84",
          category: "social",
          screenshots: [],
          versions: r.iosVersions.map((v) => ({
            version: v.version,
            buildVersion: String(v.versionCode),
            date: v.date,
            downloadURL: v.url,
            size: v.size,
            localizedDescription: v.notes,
            minOSVersion: "16.0",
          })),
          appPermissions: { entitlements: [], privacy: {} },
        },
      ],
      news: [],
    },
    { headers: { "Cache-Control": "public, max-age=300, s-maxage=600" } },
  );
}
