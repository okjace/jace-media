import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { AppProvider, Notices } from "@/components/AppProvider";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { getAccountList, getViewer } from "@/lib/auth";
import { listFeeds } from "@/lib/customfeeds";
import { getServices } from "@/lib/prefs";
import { shouldAutoSignIn } from "@/lib/session";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Jace Media", template: "%s · Jace Media" },
  description: "Jace posts, YouTube and Jace videos, Bluesky, Mastodon, Lemmy, and Hacker News in one place, with no ads.",
};

export const viewport: Viewport = {
  themeColor: "#111317",
  width: "device-width",
  initialScale: 1,
};

// Applies the saved light/dark choice before first paint, so there's no flash.
const themeScript = `try{if(localStorage.getItem("jacemedia:theme")==="light")document.documentElement.dataset.theme="light"}catch(e){}`;

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [{ current, others }, autoSignIn, services, viewer] = await Promise.all([getAccountList(), shouldAutoSignIn(), getServices(), getViewer()]);
  const feeds = viewer ? (await listFeeds(viewer.sub).catch(() => [])).map((f) => ({ id: f.id, name: f.name })) : [];

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
        <AppProvider current={current} others={others} services={services} feeds={feeds} autoSignIn={autoSignIn}>
          <Suspense>
            <SiteHeader />
          </Suspense>
          <Notices />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-5 sm:px-6">{children}</main>
          <SiteFooter />
        </AppProvider>
      </body>
    </html>
  );
}
