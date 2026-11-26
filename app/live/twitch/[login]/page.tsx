import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getExtensions } from "@/lib/prefs";
import { twitchStream } from "@/lib/live";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/live/twitch/[login]">): Promise<Metadata> {
  const s = await twitchStream((await params).login);
  return { title: s ? `${s.name} on Twitch` : "Twitch" };
}

/** A Twitch stream with its chat, inside Jace Media. Twitch's player shows Twitch's own ads. */
export default async function TwitchWatchPage({ params }: PageProps<"/live/twitch/[login]">) {
  const { login } = await params;
  if (!/^[a-zA-Z0-9_]{2,25}$/.test(login)) notFound();
  const [stream, ext, h] = await Promise.all([twitchStream(login), getExtensions(), headers()]);
  if (stream?.mature && ext.rating !== "all") {
    return <p className="rounded-2xl border border-line bg-panel p-6 text-center text-sm">This stream is marked mature, so your content rating hides it.</p>;
  }
  // Twitch's embed must be told which site it's on.
  const parent = (h.get("host") ?? "jace-media.vercel.app").split(":")[0];
  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="-mx-4 overflow-hidden bg-black sm:mx-0 sm:rounded-2xl">
          <iframe
            src={`https://player.twitch.tv/?channel=${login}&parent=${parent}&autoplay=true`}
            title={`${login} on Twitch`}
            allowFullScreen
            className="aspect-video w-full"
          />
        </div>
        <h1 className="text-xl font-semibold leading-snug">{stream?.title ?? login}</h1>
        <p className="text-sm text-muted">
          {stream ? `${stream.name} · ${stream.game}` : `${login} is offline right now.`} ·{" "}
          <a href={`https://www.twitch.tv/${login}`} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">
            Open on Twitch ↗
          </a>
        </p>
      </div>
      <iframe
        src={`https://www.twitch.tv/embed/${login}/chat?parent=${parent}&darkpopout`}
        title="Twitch chat"
        className="h-[480px] w-full shrink-0 rounded-2xl border border-line lg:h-[calc(100dvh-8rem)] lg:w-[340px]"
      />
    </div>
  );
}
