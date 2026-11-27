import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getAccountList, getViewer } from "@/lib/auth";
import { buildFeed } from "@/lib/customfeeds";
import { jaceVideo, jaceVideos } from "@/lib/data";
import { jacePosts } from "@/lib/feeds";
import { dislikeCount, listSubscriptions, recentHistory, videoVote } from "@/lib/library";
import { getExtensions, getServices } from "@/lib/prefs";
import { filterPosts, filterVideos } from "@/lib/ratingfilter";
import { getTaste, rankPosts, rankVideos, recommendedVideos } from "@/lib/recommend";
import { ACCOUNTS_COOKIE } from "@/lib/session";
import { NETWORKS } from "@/lib/social";
import { followedRss } from "@/lib/rss";
import { channelFeed, channelInfo, channelUploads, search, searchChannels, searchShorts, videoDetail } from "@/lib/youtube";
import { dislikes, withDeArrow } from "@/lib/ytextras";
import { sponsorSegments } from "@/lib/sponsorblock";
import { liveNow } from "@/lib/golive";
import { pinnedAmong } from "@/lib/tvpin";
import { continueWatching, getPlaylist, listPlaylists, watchLaterId } from "@/lib/playlists";
import { youtubeLive } from "@/lib/live";
import type { FeedItem, VideoCard } from "@/lib/types";

/**
 * The JSON API the native apps (TV, iPhone, Android, desktop) use. Signed-in
 * requests carry the encrypted session in the x-jace-media-session header
 * (or the usual cookie, on the TV app). Actions (like, subscribe, history,
 * comments, posting) use the same /api routes as the website.
 *
 *   GET  /api/app/signin            → Jace sign-in, then back to the app
 *   GET  /api/app/done              → jacemedia://signed-in?session=…
 *   GET  /api/app/me                → account, services, settings
 *   GET  /api/app/home              → videos, Shorts, and posts for you
 *   GET  /api/app/videos | shorts | subscriptions | history
 *   GET  /api/app/search?q=
 *   GET  /api/app/watch/{source}/{id}
 *   GET  /api/app/channel/youtube/{id} | /api/app/channel/jace/{id}
 */

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ path: string[] }> };

/** Pictures and video files as full addresses (the site uses relative ones). */
function absolute(origin: string) {
  const abs = (u: string | null | undefined) => (u ? (u.startsWith("/") ? `${origin}${u}` : u) : null);
  const video = (v: VideoCard) => ({
    source: v.source,
    id: v.id,
    title: v.title,
    thumbnail: abs(v.thumbnail),
    channelId: v.channelId,
    channelName: v.channelName,
    channelPicture: abs(v.channelPicture),
    publishedAt: v.publishedAt,
    views: v.views ?? null,
    duration: v.duration ?? null,
    short: !!v.short,
    src: v.src ?? null,
  });
  const post = (p: FeedItem) => ({
    ...p,
    author: { ...p.author, picture: abs(p.author.picture) },
    media: p.media.map((m) => ({ ...m, url: abs(m.url), thumb: abs(m.thumb) })),
    video: p.video ? { ...p.video, thumbnail: abs(p.video.thumbnail) } : null,
  });
  return { abs, video, post };
}

const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store", "Access-Control-Allow-Origin": "*" } });

function dedupe(list: VideoCard[]): VideoCard[] {
  const seen = new Set<string>();
  return list.filter((v) => !seen.has(`${v.source}:${v.id}`) && !!seen.add(`${v.source}:${v.id}`));
}

async function home() {
  const taste = await getTaste();
  const on = (s: (typeof taste.services)[number]) => taste.services.includes(s);
  const wantVideos = on("youtube") || on("jacevideos");
  const postTasks: Promise<FeedItem[]>[] = [];
  if (on("jace")) postTasks.push(jacePosts({ limit: 30 }).then((r) => r.items));
  for (const key of ["bluesky", "mastodon", "lemmy", "hackernews"] as const) {
    if (on(key)) postTasks.push(NETWORKS[key].load(20).then((r) => r ?? []));
  }
  if (on("rss")) postTasks.push(followedRss(4));
  const [posts, videos, shorts] = await Promise.all([
    Promise.all(postTasks).then((r) => r.flat()),
    wantVideos ? recommendedVideos({ limit: 30 }).then(withDeArrow) : [],
    wantVideos && !taste.ext.hideShorts ? recommendedVideos({ shorts: true, limit: 16 }).then(withDeArrow) : [],
  ]);
  return { videos, shorts, posts: rankPosts(posts, taste, 40) };
}

export async function GET(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const path = (await ctx.params).path;
  const origin = req.nextUrl.origin;
  const { video, post, abs } = absolute(origin);
  const sp = req.nextUrl.searchParams;

  try {
    switch (path[0]) {
      case "signin": {
        // The app opens this in a sign-in sheet; Jace sends the person back to /api/app/done.
        const mode = sp.get("mode") === "add" ? "add" : "interactive";
        return NextResponse.redirect(new URL(`/api/auth/signin?mode=${mode}&next=/api/app/done`, req.url));
      }
      case "done": {
        const sealed = (await cookies()).get(ACCOUNTS_COOKIE)?.value;
        const target = sealed ? `jacemedia://signed-in?session=${encodeURIComponent(sealed)}` : "jacemedia://signed-in?error=1";
        return NextResponse.redirect(target);
      }
      case "me": {
        const [{ current, others }, services, ext] = await Promise.all([getAccountList(), getServices(), getExtensions()]);
        const pinned = await pinnedAmong([current, ...others].flatMap((a) => (a ? [a.sub] : [])));
        const fix = <T extends { sub: string; picture: string | null }>(a: T) => ({ ...a, picture: abs(a.picture), hasPin: pinned.has(a.sub) });
        return json({ account: current ? fix(current) : null, others: others.map(fix), services, extensions: ext });
      }
      case "home": {
        const h = await home();
        return json({ videos: h.videos.map(video), shorts: h.shorts.map(video), posts: h.posts.map(post) });
      }
      case "videos": {
        const list = await recommendedVideos({ limit: 48 }).then(withDeArrow);
        return json({ videos: list.map(video) });
      }
      case "shorts": {
        const list = await recommendedVideos({ shorts: true, limit: 40 }).then(withDeArrow);
        return json({ videos: list.map(video) });
      }
      case "subscriptions": {
        const viewer = await getViewer();
        if (!viewer) return json({ error: "Sign in with Jace first." }, 401);
        const [taste, subs] = await Promise.all([getTaste(), listSubscriptions(viewer.sub)]);
        const entries = await buildFeed({ services: taste.services, only: "subscriptions", content: "all", include: [], exclude: [], sort: "latest", folder: null }, 80);
        return json({
          channels: subs.map((s) => ({ kind: s.kind, ref: s.ref, name: s.name, picture: abs(s.picture), folder: s.folder ?? null })),
          videos: entries.flatMap((e) => (e.kind === "video" ? [video(e.video)] : [])),
          posts: entries.flatMap((e) => (e.kind === "post" ? [post(e.item)] : [])),
        });
      }
      case "live": {
        const taste = await getTaste();
        const [own, yt] = await Promise.all([liveNow().catch(() => []), taste.services.includes("youtube") ? youtubeLive(24).catch(() => []) : []]);
        return json({
          jace: own.map((s) => ({ ...s, thumbnail: abs(s.thumbnail), host: { ...s.host, picture: abs(s.host.picture) } })),
          youtube: (await filterVideos(yt)).map(video),
        });
      }
      case "library": {
        const viewer = await getViewer();
        if (!viewer) return json({ error: "Sign in with Jace first." }, 401);
        const wl = await watchLaterId(viewer.sub);
        const [cont, later, lists] = await Promise.all([continueWatching(viewer.sub, 20), getPlaylist(viewer.sub, wl), listPlaylists(viewer.sub)]);
        return json({
          continueWatching: cont.map((v) => ({ ...video(v), progress: v.progress })),
          watchLater: (later?.videos ?? []).map(video),
          playlists: lists.filter((pl) => pl.kind !== "watch_later").map((pl) => ({ ...pl, thumbnail: abs(pl.thumbnail) })),
        });
      }
      case "playlist": {
        const viewer = await getViewer();
        if (!viewer) return json({ error: "Sign in with Jace first." }, 401);
        const pl = await getPlaylist(viewer.sub, path[1] ?? "");
        if (!pl) return json({ error: "That playlist doesn't exist." }, 404);
        return json({ name: pl.playlist.name, videos: pl.videos.map(video) });
      }
      case "posts": {
        const h = await home();
        return json({ posts: h.posts.map(post) });
      }
      case "history": {
        const viewer = await getViewer();
        if (!viewer) return json({ error: "Sign in with Jace first." }, 401);
        const items = await recentHistory(viewer.sub, 60);
        return json({ items });
      }
      case "search": {
        const q = (sp.get("q") ?? "").trim().slice(0, 200);
        if (!q) return json({ videos: [], shorts: [], channels: [], posts: [] });
        const taste = await getTaste();
        const [yt, jace, shorts, channels, posts] = await Promise.all([
          taste.services.includes("youtube") ? search(q, 30).then((r) => r ?? []) : [],
          taste.services.includes("jacevideos") ? jaceVideos({ q, limit: 20 }).then((r) => r.videos) : [],
          taste.services.includes("youtube") ? searchShorts(q, 16) : [],
          taste.services.includes("youtube") ? searchChannels(q, 10) : [],
          taste.services.includes("jace") ? jacePosts({ q, limit: 20 }).then((r) => r.items) : [],
        ]);
        const videos = await filterVideos(dedupe([...jace, ...yt]));
        return json({
          videos: (await withDeArrow(videos)).map(video),
          shorts: (await filterVideos(shorts)).map(video),
          channels: channels.map((c) => ({ ...c, picture: abs((c as { picture?: string | null }).picture) })),
          posts: (await filterPosts(posts)).map(post),
        });
      }
      case "watch": {
        const [, source, id] = path;
        const viewer = await getViewer();
        if (source === "jace" && id) {
          const v = await jaceVideo(id);
          if (!v) return json({ error: "That video isn't available." }, 404);
          const [taste, more, myVote, down] = await Promise.all([
            getTaste(),
            recommendedVideos({ limit: 20, exclude: id }),
            viewer ? videoVote(viewer.sub, "jace", id).catch(() => 0) : 0,
            dislikeCount("jace", id).catch(() => 0),
          ]);
          return json({
            video: {
              source: "jace",
              id: v.id,
              title: v.title,
              description: v.description,
              channelId: v.owner_id,
              channelName: v.owner_name,
              channelPicture: abs(v.owner_picture),
              publishedAt: v.created_at,
              views: null,
              likes: v.likes,
              dislikes: down,
              myVote,
              thumbnail: abs(v.thumbnail_url),
              stream: { type: "file", url: v.url, contentType: v.content_type },
              subscribed: taste.following.has(`jace:${v.owner_id.toLowerCase()}`),
              comments: v.comments,
            },
            upNext: (await withDeArrow(await filterVideos(more))).map(video),
          });
        }
        if (source === "youtube" && id && /^[\w-]{11}$/.test(id)) {
          const d = await videoDetail(id);
          const channelId = d?.channelId ?? null;
          const [taste, channel, more, segments, votes, myVote] = await Promise.all([
            getTaste(),
            channelId ? channelFeed(channelId) : null,
            recommendedVideos({ limit: 20, exclude: id }),
            sponsorSegments(id),
            dislikes(id),
            viewer ? videoVote(viewer.sub, "youtube", id).catch(() => 0) : 0,
          ]);
          const fromChannel = rankVideos((channel?.videos ?? []).filter((v) => !v.short && v.id !== id), taste, 4);
          const upNext = dedupe([...fromChannel, ...more]).filter((v) => v.id !== id).slice(0, 20);
          return json({
            video: {
              source: "youtube",
              id,
              title: d?.title ?? "YouTube video",
              description: d?.description ?? "",
              channelId,
              channelName: d?.channelName ?? "YouTube",
              channelPicture: null,
              publishedAt: d?.publishedAt ?? null,
              views: d?.views ?? null,
              likes: d?.likes ?? votes?.likes ?? null,
              dislikes: votes?.dislikes ?? null,
              myVote,
              live: !!d?.live,
              thumbnail: `${origin}/api/yt-thumb/${id}`,
              // Played through YouTube's privacy-enhanced player, with no ads added by Jace Media.
              stream: { type: "youtube", id, embed: `https://www.youtube-nocookie.com/embed/${id}?playsinline=1&rel=0&modestbranding=1` },
              skip: segments,
              subscribed: !!channelId && taste.following.has(`youtube:${channelId.toLowerCase()}`),
            },
            upNext: (await withDeArrow(await filterVideos(upNext))).map(video),
          });
        }
        return json({ error: "Unknown video." }, 404);
      }
      case "channel": {
        const [, kind, ref] = path;
        if (kind === "youtube" && ref) {
          const info = await channelInfo(ref);
          const uploads = info ? await channelUploads(info.uploads, sp.get("page") ?? undefined) : null;
          const fallback = uploads ? null : await channelFeed(ref);
          const list = uploads?.videos ?? fallback?.videos ?? [];
          return json({
            channel: info ? { ...info, picture: abs(info.picture), banner: abs(info.banner) } : { id: ref, name: fallback?.name ?? "Channel", picture: null },
            videos: (await filterVideos(list.filter((v) => !v.short))).map(video),
            shorts: (await filterVideos(list.filter((v) => v.short))).map(video),
            next: uploads?.next ?? null,
          });
        }
        return json({ error: "Unknown channel." }, 404);
      }
      default:
        return json({ error: "Not found." }, 404);
    }
  } catch (err) {
    console.error("App API error:", err);
    return json({ error: "Something went wrong. Try again." }, 500);
  }
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, x-jace-media-session",
    },
  });
}
