import type { Metadata } from "next";
import Link from "next/link";
import { PageTitle } from "@/components/PageTitle";
import { EmptyState, VideoGrid } from "@/components/videos/VideoGrid";
import { getExtensions, getServices } from "@/lib/prefs";
import { hasTwitch, jaceLiveGames, jaceLiveHostUrl, jaceLiveJoinUrl, jaceLiveSets, twitchStreams, youtubeLive } from "@/lib/live";
import { textBlocked } from "@/lib/rating";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Live" };

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const MODE_EMOJI: Record<string, string> = { gold: "🪙", fishing: "🎣", rocket: "🚀", classic: "❓", king: "👑", factory: "🏭", hack: "💻", flag: "🚩", pinata: "🪅", sled: "🛷" };

function LiveBadge() {
  return <span className="rounded-md bg-danger px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">● Live</span>;
}

/** Live right now: Jace Live games, Twitch streams, and YouTube live streams. */
export default async function LivePage() {
  const [services, ext] = await Promise.all([getServices(), getExtensions()]);
  const on = (s: string) => services.includes(s as never);
  const [games, sets, twitch, yt] = await Promise.all([
    on("jacelive") ? jaceLiveGames() : Promise.resolve([]),
    on("jacelive") ? jaceLiveSets() : Promise.resolve([]),
    on("twitch") && hasTwitch ? twitchStreams(24) : Promise.resolve(null),
    on("youtube") ? youtubeLive(12) : Promise.resolve([]),
  ]);
  // Twitch marks mature streams; only "Everything" shows them.
  const streams = (twitch ?? []).filter((s) => (ext.rating === "all" || !s.mature) && !textBlocked(`${s.title} ${s.name}`, ext.rating));

  return (
    <div className="flex flex-col gap-10">
      <PageTitle title="Live">Games and streams happening right now.</PageTitle>

      {on("jacelive") && (
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              Jace Live games <LiveBadge />
            </h2>
            <a href="https://jace-live.vercel.app/join" className="text-sm text-accent hover:underline">
              Join with a code
            </a>
          </div>
          {games === null ? (
            <p className="text-sm text-muted">Jace Live can&apos;t be reached right now.</p>
          ) : games.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-muted">No open games right now. Host one below!</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {games.map((g) => (
                <a key={g.code} href={jaceLiveJoinUrl(g.code)} className="flex items-center gap-4 rounded-2xl border border-line bg-panel p-4 transition-colors hover:border-accent/60">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-3xl">{MODE_EMOJI[g.mode] ?? "🎮"}</span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{g.setTitle ?? `${g.mode} game`}</span>
                    <span className="block truncate text-sm text-muted">
                      Hosted by {g.hostName} · {g.players} playing
                    </span>
                    <span className="mt-1 inline-block rounded-md bg-foreground/[.07] px-2 py-0.5 font-mono text-xs">{g.code}</span>
                  </span>
                </a>
              ))}
            </div>
          )}
          {sets.length > 0 && (
            <>
              <h3 className="mt-2 text-sm font-semibold text-muted">Host a game with a popular set</h3>
              <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
                {sets.map((s) => (
                  <a key={s.id} href={jaceLiveHostUrl(s.id)} className="w-44 shrink-0 rounded-2xl border border-line bg-panel p-4 transition-colors hover:border-accent/60">
                    <span className="text-3xl">{s.cover || "❓"}</span>
                    <span className="mt-2 line-clamp-2 block font-medium leading-snug">{s.title}</span>
                    <span className="mt-1 block text-xs text-muted">
                      {s.questionCount} questions · {compact.format(s.plays)} plays
                    </span>
                  </a>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {on("youtube") && yt.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            YouTube live <LiveBadge />
          </h2>
          <VideoGrid videos={yt} />
        </section>
      )}

      {on("twitch") && hasTwitch && (
        <section className="flex flex-col gap-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            Twitch <LiveBadge />
          </h2>
          {!hasTwitch ? (
            <p className="text-sm text-muted">Twitch needs a free Twitch API key on this server (TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET).</p>
          ) : streams.length === 0 ? (
            <EmptyState title="Twitch can't be reached right now" />
          ) : (
            <div className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
              {streams.map((s) => (
                <Link key={s.login} href={`/live/twitch/${s.login}`} className="group flex flex-col gap-3">
                  <div className="relative aspect-video overflow-hidden rounded-xl bg-panel">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]" />
                    <span className="absolute left-2 top-2">
                      <LiveBadge />
                    </span>
                    {!ext.hideCounts && (
                      <span className="absolute bottom-2 right-2 rounded-md bg-black/80 px-1.5 py-0.5 text-xs text-white">{compact.format(s.viewers)} watching</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="line-clamp-2 font-medium leading-snug">{s.title}</p>
                    <p className="mt-1 truncate text-sm text-muted">
                      {s.name} · {s.game}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {!on("jacelive") && !on("twitch") && !on("youtube") && (
        <EmptyState title="Live is turned off">Turn on Jace Live, Twitch, or YouTube in Choose services.</EmptyState>
      )}
    </div>
  );
}
