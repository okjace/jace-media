import type { Metadata } from "next";
import { AppUpdateSettings } from "@/components/AppUpdateSettings";
import { PageTitle } from "@/components/PageTitle";
import { appReleases, type AppFile } from "@/lib/appReleases";
import { bytes, date } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Get the app" };

const SOURCE = "https://jace-media.vercel.app/api/altstore";

function Card({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line bg-panel p-5">
      <h2 className="flex items-center gap-3 text-lg font-semibold">
        <span className="text-2xl" aria-hidden="true">
          {icon}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Download({ file, label }: { file: AppFile | null; label: string }) {
  if (!file) return <p className="text-sm text-muted">The first build is on its way. Check back soon.</p>;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <a href={file.url} className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover">
        {label}
      </a>
      <span className="text-xs text-muted">
        Version {file.version} · {bytes(file.size)} · {date(file.date)}
      </span>
    </div>
  );
}

const steps = "list-decimal space-y-1.5 pl-5 text-sm text-muted";

/** Jace Media for phones and TVs: downloads, how to install, and how updates work. */
export default async function AppsPage() {
  const r = await appReleases();
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageTitle title="Get the app">
        Jace Media for your phone, TV, and computer. The apps always show the newest Jace Media, and update themselves when the app part changes.
      </PageTitle>

      <AppUpdateSettings />

      <Card icon="🤖" title="Android phones and tablets">
        <Download file={r.android} label="Download for Android" />
        <ol className={steps}>
          <li>Open the downloaded file. If Android asks, allow installing apps from your browser.</li>
          <li>Open Jace Media and sign in with Jace.</li>
          <li>Updates: Automatic or Manual, on this page inside the app.</li>
        </ol>
      </Card>

      <Card icon="📺" title="Android TV, Google TV, and Fire TV">
        <Download file={r.android} label="Download the APK" />
        <ol className={steps}>
          <li>
            On the TV, install <b>Downloader</b> (free, by AFTVnews) from the TV&apos;s app store.
          </li>
          <li>
            In Downloader, type <b>jace-media.vercel.app/apps</b> and choose the Android download. Allow Downloader to install apps when asked.
          </li>
          <li>Jace Media shows up on your TV&apos;s home screen. Use the remote&apos;s arrows and OK.</li>
        </ol>
      </Card>

      <Card icon="📱" title="iPhone and iPad (AltStore or SideStore)">
        <div className="flex flex-wrap gap-2">
          <a href={`sidestore://source?url=${encodeURIComponent(SOURCE)}`} className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover">
            Add to SideStore
          </a>
          <a href={`altstore://source?url=${encodeURIComponent(SOURCE)}`} className="rounded-full border border-line px-5 py-2 text-sm font-medium hover:bg-foreground/[.05]">
            Add to AltStore
          </a>
        </div>
        <ol className={steps}>
          <li>
            Install <a href="https://sidestore.io" className="text-accent hover:underline">SideStore</a> or{" "}
            <a href="https://altstore.io" className="text-accent hover:underline">AltStore</a> first (free, with your own Apple ID).
          </li>
          <li>Tap a button above, or add this source by hand: <code className="break-all rounded bg-foreground/[.08] px-1">{SOURCE}</code></li>
          <li>Install Jace Media from the source. SideStore or AltStore keeps it updated (and refreshes it every 7 days).</li>
        </ol>
        {r.ios && (
          <p className="text-xs text-muted">
            Newest: version {r.ios.version} ({date(r.ios.date)}). <a href={r.ios.url} className="hover:text-foreground">Download the .ipa</a>
          </p>
        )}
      </Card>

      <Card icon="📺" title="LG TV (webOS)">
        <Download file={r.webos} label="Download for LG TV (.ipk)" />
        <ol className={steps}>
          <li>
            On a computer, make a free account at <a href="https://webostv.developer.lge.com" className="text-accent hover:underline">LG&apos;s developer site</a>, and
            install the <b>Developer Mode</b> app on your TV from LG&apos;s Content Store. Sign in and turn Developer Mode on.
          </li>
          <li>
            Install LG&apos;s webOS tools on the computer (<code className="rounded bg-foreground/[.08] px-1">npm install -g @webos-tools/cli</code>), add your TV with{" "}
            <code className="rounded bg-foreground/[.08] px-1">ares-setup-device</code>, then run{" "}
            <code className="rounded bg-foreground/[.08] px-1">ares-install JaceMedia-…-webos.ipk</code>.
          </li>
          <li>Developer Mode lasts 50 hours at a time; press Extend in the Developer Mode app to keep it.</li>
        </ol>
        <p className="text-xs text-muted">Or skip installing: open the TV&apos;s web browser and go to jace-media.vercel.app/tv.</p>
      </Card>

      <Card icon="🍎" title="Apple TV">
        <p className="text-sm text-muted">
          Apple TV can&apos;t run web apps, so there&apos;s no Apple TV app yet. Instead, use the iPhone app and press the AirPlay button on any video to play it on
          your Apple TV.
        </p>
      </Card>

      <Card icon="💻" title="Windows, Mac, and Linux">
        <p className="text-sm text-muted">A small, fast app (a few MB): it uses your computer&apos;s own web engine instead of bundling a whole browser.</p>
        <div className="flex flex-col gap-3">
          <Download file={r.windows} label="Download for Windows" />
          <Download file={r.mac} label="Download for Mac" />
          <Download file={r.linux} label="Download for Linux (AppImage)" />
          {r.linuxDeb && (
            <a href={r.linuxDeb.url} className="self-start text-sm text-accent hover:underline">
              Linux .deb (Debian, Ubuntu)
            </a>
          )}
        </div>
        <ol className={steps}>
          <li>Windows: open the setup file. If SmartScreen appears, choose More info → Run anyway.</li>
          <li>Mac: open the .dmg and drag Jace Media to Applications. The first time, right-click it → Open.</li>
          <li>Linux: make the AppImage runnable (right-click → Properties → Allow executing) and open it.</li>
        </ol>
        <p className="text-xs text-muted">
          Or install it from your browser: in Chrome or Edge, choose <b>Install app</b> in Jace Media&apos;s sidebar; on a Mac with Safari, File → Add to Dock.
        </p>
      </Card>
    </div>
  );
}
