import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { AppProvider } from "@/components/AppProvider";
import { AppShell } from "@/components/site/AppShell";
import { getAccountList, getViewer } from "@/lib/auth";
import { listFeeds } from "@/lib/customfeeds";
import { listSubscriptions } from "@/lib/library";
import { getExtensions, getServices } from "@/lib/prefs";
import { invidiousConfigured } from "@/lib/invidious";
import { shouldAutoSignIn } from "@/lib/session";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Jace Media", template: "%s · Jace Media" },
  description: "Jace posts, YouTube and Jace videos, Bluesky, Mastodon, Lemmy, Hacker News, news sites, and live games in one place, with no ads.",
  appleWebApp: { capable: true, title: "Jace Media", statusBarStyle: "black-translucent" },
  icons: { apple: "/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#111317",
  width: "device-width",
  initialScale: 1,
};

// Applies the saved light/dark choice before first paint, so there's no flash.
const themeScript = `try{if(localStorage.getItem("jacemedia:theme")==="light")document.documentElement.dataset.theme="light"}catch(e){}`;

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [{ current, others }, autoSignIn, services, extensions, viewer] = await Promise.all([
    getAccountList(),
    shouldAutoSignIn(),
    getServices(),
    getExtensions(),
    getViewer(),
  ]);
  const [feedList, subList] = viewer
    ? await Promise.all([listFeeds(viewer.sub).catch(() => []), listSubscriptions(viewer.sub).catch(() => [])])
    : [[], []];
  const feeds = feedList.map((f) => ({ id: f.id, name: f.name }));
  const subs = subList.map((s) => ({ kind: s.kind, ref: s.ref, name: s.name, picture: s.picture, folder: s.folder ?? null }));

  return (
    <html
      lang="en"
      data-theme="dark"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-full flex-col">
        <AppProvider current={current} others={others} services={services} feeds={feeds} extensions={extensions} subs={subs} invidious={invidiousConfigured} autoSignIn={autoSignIn}>
          <Suspense>
            <AppShell>{children}</AppShell>
          </Suspense>
        </AppProvider>
      </body>
    </html>
  );
}
