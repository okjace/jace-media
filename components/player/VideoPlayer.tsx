"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useApp } from "@/components/AppProvider";
import { SEGMENT_INFO, type Segment } from "@/lib/segments";
import { YT_STATE, loadYouTubeApi, type YTPlayer } from "./youtubeApi";

/**
 * Jace Media's video player, for Jace videos, YouTube videos, and Shorts.
 *
 * Every button, the seek bar, and the poster are Jace Media's. Jace videos
 * play from Jace in a plain <video>. YouTube videos play in YouTube's
 * no-cookie player, kept hidden behind the poster until the video is actually
 * playing, with all of YouTube's own buttons turned off or cropped out. With
 * the Privacy mode extension, YouTube isn't contacted at all until you press
 * play. One player is reused when the video changes (Shorts), so switching
 * is quick.
 *
 * Shortcuts (like YouTube): Space/K play, J/L ±10s, ←/→ ±5s, ↑/↓ volume,
 * M mute, F fullscreen, 0-9 jump to 0-90%, Shift+< / Shift+> speed.
 */

type Props = {
  source: "youtube" | "jace";
  id: string;
  /** The video file (Jace videos). */
  src?: string;
  poster?: string | null;
  title: string;
  segments?: Segment[];
  /** embed: inside a post (no autoplay, no keyboard shortcuts, several can be on a page). */
  variant?: "full" | "short" | "mini" | "embed";
  /** A live stream: shows LIVE instead of a time, with Go live. */
  live?: boolean;
  /** Start here (seconds), e.g. the mini player picking up where the page left off. */
  startAt?: number;
  /** The watch page address, for the mini player's "back to video". */
  href?: string;
  onClose?: () => void;
  /** Should play now (Shorts: the one on screen). */
  active?: boolean;
  /** Start playing even in Privacy mode (you already pressed play, e.g. autoplay next). */
  autoStart?: boolean;
  nextHref?: string | null;
  nextTitle?: string | null;
};

/** One interface over <video> and YouTube's player. */
type Engine = {
  play(): void;
  pause(): void;
  seek(t: number): void;
  time(): number;
  duration(): number;
  buffered(): number;
  volume(v: number): void;
  muted(m: boolean): void;
  rate(r: number): void;
  paused(): boolean;
};

const RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

function fmt(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds % 60);
  const m = Math.floor(seconds / 60) % 60;
  const h = Math.floor(seconds / 3600);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

function stored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`jacemedia:${key}`);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function store(key: string, value: unknown): void {
  try {
    localStorage.setItem(`jacemedia:${key}`, JSON.stringify(value));
  } catch {}
}

function Icon({ d, size = 22 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  play: "M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14z",
  pause: "M7 4h3.5v16H7zM13.5 4H17v16h-3.5z",
  replay: "M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z",
  next: "M5 5.5v13a1 1 0 0 0 1.55.83L15 13.7V18.5h2.5v-13H15v4.8L6.55 4.67A1 1 0 0 0 5 5.5z",
  volume: "M4 9v6h4l5 5V4L8 9H4zm12.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z",
  mute: "M4 9v6h4l5 5V4L8 9H4zm12.6 3 2.7-2.7-1.4-1.4-2.7 2.7-2.7-2.7-1.4 1.4 2.7 2.7-2.7 2.7 1.4 1.4 2.7-2.7 2.7 2.7 1.4-1.4z",
  full: "M4 4h6v2H6v4H4zm10 0h6v6h-2V6h-4zM4 14h2v4h4v2H4zm14 0h2v6h-6v-2h4z",
  exitFull: "M8 4h2v6H4V8h4zm6 0h2v4h4v2h-6zM4 14h6v6H8v-4H4zm10 0h6v2h-4v4h-2z",
  pip: "M3 5h18v8h-2V7H5v10h6v2H3zm10 9h8v6h-8z",
  gear: "M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.4-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.4L6.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.4 2.5-1a7.4 7.4 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.4zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z",
};

export function VideoPlayer({
  source,
  id,
  src,
  poster,
  title,
  segments = [],
  variant = "full",
  active = true,
  autoStart = false,
  nextHref,
  nextTitle,
  startAt,
  live = false,
  href,
  onClose,
}: Props) {
  const router = useRouter();
  const { extensions: ext, current, setMini, invidious } = useApp();
  const mini = variant === "mini";
  const short = variant === "short";
  const compact = short || variant === "mini";
  const posterUrl = poster ?? (source === "youtube" ? `/api/yt-thumb/${id}${short ? "" : "?s=maxresdefault"}` : null);
  const skip = useMemo(() => (ext.sponsorblock ? ext.skip : []), [ext.sponsorblock, ext.skip]);

  const box = useRef<HTMLDivElement>(null);
  const videoEl = useRef<HTMLVideoElement>(null);
  const ytHost = useRef<HTMLDivElement>(null);
  const yt = useRef<YTPlayer | null>(null);
  const engine = useRef<Engine | null>(null);
  const loadedId = useRef<string | null>(null);
  const idRef = useRef(id);
  const activeRef = useRef(active);
  const skippedRef = useRef(new Set<number>());
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekingRef = useRef(false);

  // Privacy mode: YouTube's player isn't loaded until you press play.
  // How it plays: "native" is our own <video> (Jace videos, and YouTube through
  // Invidious with Private playback); "youtube" is YouTube's player behind our controls.
  const wantsPrivate = source === "youtube" && invidious && ext.privatePlayback;
  const [mode, setMode] = useState<"native" | "youtube" | "pending">(source === "jace" ? "native" : wantsPrivate ? "pending" : "youtube");
  const [privateSrc, setPrivateSrc] = useState<{ url: string; captions: { label: string; lang: string; url: string }[] } | null>(null);
  const nativeSrc = source === "jace" ? src : privateSrc?.url;
  const [armed, setArmed] = useState(source === "jace" || compact || !ext.privacy || autoStart);
  const [cc, setCc] = useState(false);
  /** Caption size: -1 small, 0 normal, 1 large, 2 huge (YouTube's fontSize steps). */
  const [ccSize, setCcSize] = useState<number>(() => stored("captionSize", 1));
  const [ccStyle, setCcStyle] = useState<"box" | "outline">(() => stored("captionStyle", "box"));
  const [cue, setCue] = useState("");
  const [ready, setReady] = useState(false);
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [ended, setEnded] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [controls, setControls] = useState(true);
  const [menu, setMenu] = useState(false);
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null);
  const [toast, setToast] = useState<{ text: string; undo?: number } | null>(null);
  const [flash, setFlash] = useState<"play" | "pause" | null>(null);
  const [ytClickThrough, setYtClickThrough] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const posKey = `pos:${source}:${id}`;
  // The latest id and active flag, for callbacks made by YouTube's player.
  useEffect(() => {
    idRef.current = id;
    activeRef.current = active;
  }, [id, active]);

  const applySaved = useCallback(() => {
    const e = engine.current;
    if (!e) return;
    const vol = stored("volume", 1);
    const mute = short ? stored("shortsMuted", false) : stored("muted", false);
    e.volume(vol);
    e.muted(mute);
    setVolume(vol);
    setMuted(mute);
    const r = !short && ext.rememberSpeed ? stored("rate", 1) : 1;
    e.rate(r);
    setRate(r);
    if (startAt && startAt > 1) e.seek(startAt);
    else if (!compact && ext.resume) {
      const resume = stored(posKey, 0);
      if (resume > 5) e.seek(resume);
    }
  }, [short, compact, startAt, ext.rememberSpeed, ext.resume, posKey]);

  // ----- Private playback: get the streams from Invidious -----
  useEffect(() => {
    if (!wantsPrivate) return;
    let stop = false;
    /* eslint-disable react-hooks/set-state-in-effect */
    setMode("pending");
    setPrivateSrc(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    fetch(`/api/private/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { sources: { url: string }[]; captions: { label: string; lang: string; url: string }[]; live: boolean } | null) => {
        if (stop) return;
        if (d && d.sources.length && !d.live) {
          setPrivateSrc({ url: d.sources[0].url, captions: d.captions });
          setMode("native");
          setArmed(true); // nothing goes to YouTube, so no need to wait for a click
        } else setMode("youtube");
      })
      .catch(() => !stop && setMode("youtube"));
    return () => {
      stop = true;
    };
  }, [id, wantsPrivate]);

  // ----- Jace: a plain <video> -----
  useEffect(() => {
    if (mode !== "native") return;
    const v = videoEl.current;
    if (!v) return;
    engine.current = {
      play: () => {
        v.play().catch(() => {
          // Browsers only autoplay muted until you've interacted with the page.
          v.muted = true;
          setMuted(true);
          v.play().catch(() => {});
        });
      },
      pause: () => v.pause(),
      seek: (t) => {
        v.currentTime = Math.max(0, Math.min(t, v.duration || t));
      },
      time: () => v.currentTime,
      duration: () => v.duration || 0,
      buffered: () => (v.duration && v.buffered.length ? v.buffered.end(v.buffered.length - 1) / v.duration : 0),
      volume: (x) => {
        v.volume = x;
      },
      muted: (m) => {
        v.muted = m;
      },
      rate: (r) => {
        v.playbackRate = r;
      },
      paused: () => v.paused,
    };
    const onMeta = () => {
      applySaved();
      setDuration(v.duration || 0);
      setReady(true);
      if (activeRef.current) engine.current?.play();
    };
    const events: [string, () => void][] = [
      ["loadedmetadata", onMeta],
      ["play", () => (setPlaying(true), setEnded(false), setStarted(true))],
      ["pause", () => setPlaying(false)],
      ["waiting", () => setWaiting(true)],
      ["playing", () => setWaiting(false)],
      ["ended", () => (setPlaying(false), setEnded(true))],
      ["error", () => setError("This video can't be played right now.")],
    ];
    for (const [name, fn] of events) v.addEventListener(name, fn);
    if (v.readyState >= 1) onMeta();
    return () => {
      for (const [name, fn] of events) v.removeEventListener(name, fn);
    };
  }, [mode, nativeSrc, applySaved]);

  // ----- YouTube: created once, reused for every video after that -----
  useEffect(() => {
    if (mode !== "youtube" || !armed || !ytHost.current) return;
    let cancelled = false;
    const mount = document.createElement("div");
    ytHost.current.appendChild(mount);
    loadYouTubeApi().then((YT) => {
      if (cancelled) return;
      loadedId.current = idRef.current;
      yt.current = new YT.Player(mount, {
        videoId: idRef.current,
        host: "https://www.youtube-nocookie.com",
        width: "100%",
        height: "100%",
        playerVars: {
          autoplay: activeRef.current ? 1 : 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          rel: 0,
          modestbranding: 1,
          iv_load_policy: 3,
          playsinline: 1,
          cc_load_policy: 0,
          origin: window.location.origin,
        },
        events: {
          onReady: ({ target: p }) => {
            engine.current = {
              play: () => p.playVideo(),
              pause: () => p.pauseVideo(),
              seek: (t) => p.seekTo(Math.max(0, t), true),
              time: () => p.getCurrentTime() || 0,
              duration: () => p.getDuration() || 0,
              buffered: () => p.getVideoLoadedFraction() || 0,
              volume: (x) => p.setVolume(Math.round(x * 100)),
              muted: (m) => (m ? p.mute() : p.unMute()),
              rate: (r) => p.setPlaybackRate(r),
              paused: () => p.getPlayerState() !== YT_STATE.PLAYING && p.getPlayerState() !== YT_STATE.BUFFERING,
            };
            applySaved();
            setReady(true);
            // Captions on from last time: switched on once the video is actually playing (see onStateChange).
            if (stored("captions", false)) {
              captionsPending.current = true;
              setCc(true);
            }
            if (activeRef.current) p.playVideo();
          },
          onStateChange: ({ data }) => {
            setPlaying(data === YT_STATE.PLAYING || data === YT_STATE.BUFFERING);
            setWaiting(data === YT_STATE.BUFFERING);
            if (data === YT_STATE.PLAYING) setStarted(true);
            if (data === YT_STATE.PLAYING && captionsPending.current && yt.current) {
              captionsPending.current = false;
              ytCaptionsOnRef.current(yt.current);
            }
            if (data === YT_STATE.ENDED) {
              // Shorts loop; everything else ends.
              if (short) yt.current?.seekTo(0, true);
              else setEnded(true);
            }
          },
          onError: () => setError("YouTube won't play this video here."),
        },
      });
    });
    return () => {
      cancelled = true;
      engine.current = null;
      try {
        yt.current?.destroy();
      } catch {}
      yt.current = null;
      mount.remove();
    };
    // applySaved changes per video; the player itself is made once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, armed, short]);

  // A new video in the same player (Shorts swipes): reset and load it, no new player.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    skippedRef.current = new Set();
    setStarted(false);
    setEnded(false);
    setTime(0);
    setDuration(0);
    setError(null);
    setCountdown(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    if (mode === "youtube" && yt.current && loadedId.current !== id) {
      loadedId.current = id;
      if (activeRef.current) yt.current.loadVideoById(id);
      else yt.current.cueVideoById(id);
      applySaved();
    }
  }, [id, mode, applySaved]);

  // Shorts play when on screen and pause when not.
  useEffect(() => {
    if (!ready) return;
    if (active) engine.current?.play();
    else engine.current?.pause();
  }, [active, ready]);

  // The clock: time, buffering, saving your place, and SponsorBlock skipping.
  useEffect(() => {
    const tick = setInterval(() => {
      const e = engine.current;
      if (!e) return;
      const t = e.time();
      if (!seekingRef.current) setTime(t);
      setDuration(e.duration());
      setBuffered(e.buffered());
      segments.forEach((s, i) => {
        if (skip.includes(s.category) && !skippedRef.current.has(i) && t >= s.start && t < s.end - 0.4) {
          skippedRef.current.add(i);
          e.seek(s.end);
          setToast({ text: `Skipped ${SEGMENT_INFO[s.category].label.toLowerCase()}`, undo: i });
        }
      });
    }, 250);
    let ticks = 0;
    const save = setInterval(() => {
      const e = engine.current;
      if (!e || short) return;
      const t = e.time();
      const d = e.duration();
      if (ext.resume && !live && t > 10 && d && t < d - 20) store(posKey, Math.floor(t));
      // Every 15 seconds of playing, tell the account (Continue watching on every device).
      ticks += 1;
      if (current && !e.paused() && ticks % 3 === 0 && d > 0) {
        fetch("/api/progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source, id: idRef.current, position: Math.floor(t), duration: Math.floor(d) }),
        }).catch(() => {});
      }
    }, 5000);
    return () => {
      clearInterval(tick);
      clearInterval(save);
    };
  }, [segments, skip, posKey, short, ext.resume, current, source, live]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 500);
    return () => clearTimeout(t);
  }, [flash]);

  // When it ends: forget the saved place, and count down to the next video.
  useEffect(() => {
    if (!ended || compact || live) return;
    try {
      localStorage.removeItem(`jacemedia:${posKey}`);
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (ext.autoplayNext && nextHref) setCountdown(5);
  }, [ended, compact, ext.autoplayNext, nextHref, posKey, live]);

  const goNext = useCallback(() => {
    if (!nextHref) return;
    router.push(`${nextHref}${nextHref.includes("?") ? "&" : "?"}play=1`);
  }, [nextHref, router]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      goNext();
      return;
    }
    const t = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(t);
  }, [countdown, goNext]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === box.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // ----- actions -----
  const toggle = useCallback(() => {
    if (!armed) {
      setArmed(true);
      return;
    }
    const e = engine.current;
    if (!e) return;
    if (ended) {
      e.seek(0);
      setEnded(false);
      setCountdown(null);
    }
    const willPlay = e.paused();
    if (willPlay) e.play();
    else e.pause();
    if (compact) setFlash(willPlay ? "play" : "pause");
  }, [armed, ended, compact]);

  const seekTo = useCallback(
    (t: number) => {
      const e = engine.current;
      if (!e) return;
      const target = Math.max(0, Math.min(t, e.duration() || t));
      e.seek(target);
      setTime(target);
      setEnded(false);
      // Seeking back into a skipped part means you want to watch it.
      segments.forEach((s, i) => {
        if (target >= s.start && target < s.end) skippedRef.current.add(i);
      });
    },
    [segments],
  );

  const changeVolume = useCallback(
    (v: number) => {
      const x = Math.max(0, Math.min(1, v));
      engine.current?.volume(x);
      engine.current?.muted(x === 0);
      setVolume(x);
      setMuted(x === 0);
      store("volume", x);
      store(short ? "shortsMuted" : "muted", x === 0);
    },
    [short],
  );

  const toggleMute = useCallback(() => {
    const next = !muted;
    engine.current?.muted(next);
    if (!next && volume === 0) changeVolume(0.5);
    setMuted(next);
    store(short ? "shortsMuted" : "muted", next);
  }, [muted, volume, changeVolume, short]);

  const changeRate = useCallback(
    (r: number) => {
      engine.current?.rate(r);
      setRate(r);
      if (ext.rememberSpeed) store("rate", r);
    },
    [ext.rememberSpeed],
  );

  const captionsPending = useRef(false);
  const ytCaptionsOnRef = useRef<(p: YTPlayer) => void>(() => {});
  const ytCaptionsOn = useCallback((p: YTPlayer) => {
    p.loadModule("captions");
    const pickTrack = () => {
      try {
        const list = (p.getOption("captions", "tracklist") as { languageCode: string }[] | undefined) ?? [];
        const lang = navigator.language.slice(0, 2);
        const track = list.find((t) => t.languageCode.startsWith(lang)) ?? list.find((t) => t.languageCode.startsWith("en")) ?? list[0];
        if (track) p.setOption("captions", "track", { languageCode: track.languageCode });
      } catch {}
    };
    // The track list only appears once the module has loaded.
    pickTrack();
    setTimeout(() => {
      try {
        p.setOption("captions", "fontSize", stored("captionSize", 1));
      } catch {}
    }, 2500);
    setTimeout(pickTrack, 600);
    setTimeout(pickTrack, 1800);
  }, []);

  useEffect(() => {
    ytCaptionsOnRef.current = ytCaptionsOn;
  }, [ytCaptionsOn]);

  const toggleCaptions = useCallback(() => {
    const v = videoEl.current;
    if (mode === "native" && v) {
      const next = !cc;
      const tracks = [...v.textTracks];
      const pick = tracks.find((t) => t.language.startsWith(navigator.language.slice(0, 2))) ?? tracks[0];
      // "hidden": the browser keeps time, Jace Media draws the words (see the caption overlay).
      for (const t of tracks) t.mode = next && t === pick ? "hidden" : "disabled";
      setCc(next && !!pick);
      store("captions", next);
      return;
    }
    const p = yt.current;
    if (!p) return;
    const next = !cc;
    if (next) ytCaptionsOn(p);
    else {
      p.setOption("captions", "track", {});
      p.unloadModule("captions");
    }
    setCc(next);
    store("captions", next);
  }, [cc, mode, ytCaptionsOn]);

  const changeCaptionSize = useCallback(
    (n: number) => {
      setCcSize(n);
      store("captionSize", n);
      try {
        if (mode === "youtube" && cc) yt.current?.setOption("captions", "fontSize", n);
      } catch {}
    },
    [mode, cc],
  );

  // Our own captions for native playback: follow the active cue.
  useEffect(() => {
    const v = videoEl.current;
    if (!v || mode !== "native" || !cc) {
      setCue("");
      return;
    }
    const track = [...v.textTracks].find((t) => t.mode === "hidden");
    if (!track) return;
    const update = () =>
      setCue(
        [...(track.activeCues ?? [])]
          .map((c) => (c as VTTCue).text.replace(/<[^>]+>/g, ""))
          .join("\n"),
      );
    track.addEventListener("cuechange", update);
    update();
    return () => track.removeEventListener("cuechange", update);
  }, [cc, mode, nativeSrc]);

  // Leaving the page while a video plays: it keeps going in the mini player.
  const handoff = useRef<{ playing: boolean; time: number }>({ playing: false, time: 0 });
  useEffect(() => {
    handoff.current = { playing, time };
  }, [playing, time]);
  useEffect(() => {
    if (variant !== "full" || !ext.miniPlayer) return;
    setMini(null);
    return () => {
      const { playing: was, time: at } = handoff.current;
      if (was && href) setMini({ source, id: idRef.current, src, poster: posterUrl, title, start: at, href });
    };
    // Only on mount and unmount of this video's page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // iPhone can't make a page element fullscreen: our own <video> uses iPhone's
  // video fullscreen, and YouTube's player fills the whole window instead.
  const [fillWindow, setFillWindow] = useState(false);
  const toggleFullscreen = useCallback(() => {
    if (fillWindow) {
      setFillWindow(false);
      return;
    }
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
      return;
    }
    const el = box.current as (HTMLDivElement & { webkitRequestFullscreen?: () => void }) | null;
    if (el?.requestFullscreen && document.fullscreenEnabled) {
      el.requestFullscreen().catch(() => setFillWindow(true));
    } else if (el?.webkitRequestFullscreen) {
      el.webkitRequestFullscreen();
    } else {
      const v = videoEl.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
      if (mode === "native" && v?.webkitEnterFullscreen) v.webkitEnterFullscreen();
      else setFillWindow(true);
    }
  }, [fillWindow, mode]);

  const pip = useCallback(() => {
    const v = videoEl.current;
    if (!v) return;
    if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {});
    else v.requestPictureInPicture().catch(() => {});
  }, []);

  // Press and hold the video for 2x speed; let go to go back.
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const [boost, setBoost] = useState(false);
  const holdStart = useCallback(() => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => {
      const e = engine.current;
      if (!e || e.paused()) return;
      held.current = true;
      e.rate(2);
      setBoost(true);
    }, 400);
  }, []);
  const holdEnd = useCallback(() => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (held.current) {
      engine.current?.rate(rate);
      setBoost(false);
    }
  }, [rate]);

  const poke = useCallback(() => {
    setControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControls(false), 2500);
  }, []);

  // Keyboard shortcuts (full player; Shorts use ↑/↓ to move between Shorts).
  useEffect(() => {
    if (compact || variant === "embed") return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable=true]") || e.ctrlKey || e.metaKey || e.altKey) return;
      const eng = engine.current;
      const k = e.key;
      let handled = true;
      if (k === " " || k === "k" || k === "K") toggle();
      else if (!eng) handled = false;
      else if (k === "j" || k === "J") seekTo(eng.time() - 10);
      else if (k === "l" || k === "L") seekTo(eng.time() + 10);
      else if (k === "ArrowLeft") seekTo(eng.time() - 5);
      else if (k === "ArrowRight") seekTo(eng.time() + 5);
      else if (k === "ArrowUp") changeVolume(volume + 0.05);
      else if (k === "ArrowDown") changeVolume(volume - 0.05);
      else if (k === "m" || k === "M") toggleMute();
      else if (k === "f" || k === "F") toggleFullscreen();
      else if (k === "c" || k === "C") toggleCaptions();
      else if (k === "Home") seekTo(0);
      else if (k === "End") seekTo(eng.duration());
      else if (/^[0-9]$/.test(k)) seekTo((eng.duration() * Number(k)) / 10);
      else if (k === ">") changeRate(RATES[Math.min(RATES.length - 1, RATES.indexOf(rate) + 1)] ?? 1);
      else if (k === "<") changeRate(RATES[Math.max(0, RATES.indexOf(rate) - 1)] ?? 1);
      else handled = false;
      if (handled) {
        e.preventDefault();
        poke();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [compact, variant, toggle, seekTo, changeVolume, toggleMute, toggleFullscreen, toggleCaptions, source, changeRate, volume, rate, poke]);

  // ----- seek bar -----
  const bar = useRef<HTMLDivElement>(null);
  const timeAt = (clientX: number) => {
    const r = bar.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * (duration || 0);
  };
  function onBarDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    seekingRef.current = true;
    bar.current?.setPointerCapture(e.pointerId);
    setTime(timeAt(e.clientX));
  }
  function onBarMove(e: ReactPointerEvent<HTMLDivElement>) {
    const r = bar.current!.getBoundingClientRect();
    setHover({ x: e.clientX - r.left, t: timeAt(e.clientX) });
    if (seekingRef.current) setTime(timeAt(e.clientX));
  }
  function onBarUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (!seekingRef.current) return;
    seekingRef.current = false;
    seekTo(timeAt(e.clientX));
  }

  const pct = (t: number) => (duration ? `${Math.min(100, (t / duration) * 100)}%` : "0%");
  const showUi = controls || !playing || menu;
  const hoverSegment = hover ? segments.find((s) => hover.t >= s.start && hover.t < s.end) : undefined;
  // YouTube's frame stays hidden behind the poster until the video is really playing (and again once it ends).
  const covered = mode === "pending" || (mode === "youtube" && (!armed || !started || ended));
  const btn = "flex h-10 w-10 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/15 hover:text-white";

  const seekBar = (
    <div
      ref={bar}
      role="slider"
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(time)}
      aria-valuetext={`${fmt(time)} of ${fmt(duration)}`}
      tabIndex={0}
      onPointerDown={onBarDown}
      onPointerMove={onBarMove}
      onPointerUp={onBarUp}
      onPointerLeave={() => setHover(null)}
      className="group/bar relative flex h-4 cursor-pointer touch-none items-center"
    >
      <div className={`relative w-full rounded-full bg-white/25 transition-all ${compact ? "h-1 group-hover/bar:h-2" : "h-1 group-hover/bar:h-1.5"}`}>
        <div className="absolute inset-y-0 left-0 rounded-full bg-white/35" style={{ width: `${buffered * 100}%` }} />
        {segments.map((s, i) => (
          <div
            key={i}
            className="absolute inset-y-0"
            style={{ left: pct(s.start), width: `calc(${pct(s.end)} - ${pct(s.start)})`, background: SEGMENT_INFO[s.category].color, opacity: 0.85 }}
          />
        ))}
        <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: pct(time) }} />
        <div
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 scale-0 rounded-full bg-accent transition-transform group-hover/bar:scale-100"
          style={{ left: pct(time) }}
        />
      </div>
      {hover && (
        <div
          className="pointer-events-none absolute bottom-6 -translate-x-1/2 whitespace-nowrap rounded-md bg-black/90 px-2 py-1 text-xs text-white"
          style={{ left: hover.x }}
        >
          {fmt(hover.t)}
          {hoverSegment && <span style={{ color: SEGMENT_INFO[hoverSegment.category].color }}> · {SEGMENT_INFO[hoverSegment.category].label}</span>}
        </div>
      )}
    </div>
  );

  return (
    <div data-no-menu className={`relative ${short ? "h-full w-full" : "w-full"}`}>
      {ext.ambient && !compact && posterUrl && (
        // Ambient glow: the poster, blurred, behind the player.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={posterUrl} alt="" aria-hidden="true" className="pointer-events-none absolute -inset-6 -z-10 h-[calc(100%+3rem)] w-[calc(100%+3rem)] scale-105 object-cover opacity-35 blur-3xl saturate-150" />
      )}
      <div
        ref={box}
        onPointerMove={poke}
        onPointerLeave={() => playing && setControls(false)}
        className={`group/player relative select-none overflow-hidden bg-black ${short ? "h-full w-full" : mini ? "aspect-video w-full rounded-xl" : "aspect-video w-full sm:rounded-2xl"} ${
          fullscreen ? "!aspect-auto h-screen !rounded-none" : ""
        } ${fillWindow ? "!fixed !inset-0 !z-[200] !aspect-auto !h-[100dvh] !w-screen !rounded-none" : ""} ${!showUi && playing ? "cursor-none" : ""}`}
        aria-label={`Video player: ${title}`}
        role="region"
      >
        {mode === "native" ? (
          <video
            ref={videoEl}
            src={nativeSrc}
            poster={posterUrl ?? undefined}
            loop={short}
            playsInline
            preload="metadata"
            className="h-full w-full object-contain"
          >
            {privateSrc?.captions.map((c) => (
              <track key={c.url} kind="subtitles" src={c.url} srcLang={c.lang} label={c.label} />
            ))}
          </video>
        ) : (
          // YouTube's frame is taller than the box, so its title bar and logo sit outside it.
          // With captions on it fits the box exactly, because YouTube draws captions at its bottom edge.
          <div
            ref={ytHost}
            className={`absolute ${cc ? "inset-0" : "inset-x-0 -bottom-[120px] -top-[120px]"} [&_iframe]:h-full [&_iframe]:w-full ${ytClickThrough ? "" : "pointer-events-none"}`}
          />
        )}
        {/* Captions Jace Media draws itself (Jace videos and private playback). */}
        {mode === "native" && cc && cue && (
          <div
            className="pointer-events-none absolute inset-x-0 z-[5] flex justify-center px-[6%] text-center transition-[bottom] duration-200"
            style={{ bottom: showUi || !playing ? "4.75rem" : "6%" }}
            aria-live="polite"
          >
            <span
              className={`whitespace-pre-line font-medium leading-snug text-white ${
                ccStyle === "box" ? "rounded-md bg-black/75 px-[.5em] py-[.15em] [box-decoration-break:clone]" : "[text-shadow:0_0_4px_#000,0_2px_3px_#000,0_0_1px_#000]"
              }`}
              style={{ fontSize: `calc(${[0.8, 1, 1.3, 1.65][ccSize + 1] ?? 1.3} * clamp(13px, 2.1vw, 30px))` }}
            >
              {cue}
            </span>
          </div>
        )}

        {covered && posterUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={posterUrl} alt="" className="pointer-events-none absolute inset-0 h-full w-full bg-black object-cover" />
        )}

        {/* Clicks land on Jace Media, never on YouTube's player: click plays/pauses, double-click goes fullscreen. */}
        <button
          type="button"
          aria-label={playing ? "Pause" : "Play"}
          onClick={() => {
            if (held.current) {
              held.current = false;
              return;
            }
            toggle();
          }}
          onPointerDown={holdStart}
          onPointerUp={holdEnd}
          onPointerCancel={holdEnd}
          onPointerLeave={holdEnd}
          onContextMenu={(e) => e.preventDefault()}
          onDoubleClick={compact ? undefined : toggleFullscreen}
          className={`absolute inset-0 h-full w-full cursor-[inherit] ${ytClickThrough ? "pointer-events-none" : ""}`}
        />

        {(waiting || mode === "pending" || (armed && !ready && mode === "youtube")) && !error && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="h-12 w-12 animate-spin rounded-full border-4 border-white/25 border-t-white" />
          </div>
        )}
        {!playing && !waiting && (ready || !armed) && !error && countdown === null && !compact && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/20 backdrop-blur-sm transition-transform group-hover/player:scale-105">
              <Icon d={ended ? ICONS.replay : ICONS.play} size={34} />
            </span>
          </div>
        )}
        {compact && (flash || (!playing && ready && !waiting)) && (
          // A tap flashes play/pause; while paused, a play button stays up.
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className={`flex h-16 w-16 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm ${flash ? "animate-[fadeout_0.5s_ease-out_forwards]" : ""}`}>
              <Icon d={flash === "pause" ? ICONS.pause : ICONS.play} size={30} />
            </span>
          </div>
        )}
        {!armed && !compact && (
          <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs text-white/70">
            Privacy mode: YouTube loads when you press play
          </p>
        )}
        {error && <div className="absolute inset-0 flex items-center justify-center bg-black/85 p-6 text-center text-sm text-white">{error}</div>}

        {boost && (
          <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-black/75 px-3 py-1 text-sm font-semibold text-white backdrop-blur">
            2× ▶▶
          </div>
        )}
        {toast && (
          <div className="absolute right-3 top-3 z-10 flex items-center gap-2 rounded-full bg-black/80 py-1.5 pl-4 pr-1.5 text-sm text-white backdrop-blur">
            {toast.text}
            {toast.undo !== undefined && (
              <button
                type="button"
                onClick={() => {
                  seekTo(segments[toast.undo!].start);
                  setToast(null);
                }}
                className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium hover:bg-white/25"
              >
                Undo
              </button>
            )}
          </div>
        )}

        {countdown !== null && nextHref && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/80 p-6 text-center text-white backdrop-blur-sm">
            <p className="text-sm text-white/70">Up next in {countdown}</p>
            {nextTitle && <p className="line-clamp-2 max-w-md text-lg font-semibold">{nextTitle}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => setCountdown(null)} className="rounded-full bg-white/15 px-4 py-2 text-sm hover:bg-white/25">
                Cancel
              </button>
              <button type="button" onClick={goNext} className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-on-accent">
                Play now
              </button>
            </div>
          </div>
        )}

        {compact ? (
          <>
            {mini && (
              <div className="absolute left-2 top-2 z-10 flex gap-1">
                {href && (
                  <button
                    type="button"
                    onClick={() => {
                      const at = Math.floor(engine.current?.time() ?? 0);
                      store(posKey, at);
                      onClose?.();
                      router.push(href);
                    }}
                    aria-label="Back to the video"
                    title="Back to the video"
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur hover:bg-black/75"
                  >
                    <Icon d={ICONS.full} size={16} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close mini player"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur hover:bg-black/75"
                >
                  ✕
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={toggleMute}
              aria-label={muted ? "Unmute" : "Mute"}
              className="absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur hover:bg-black/65"
            >
              <Icon d={muted || volume === 0 ? ICONS.mute : ICONS.volume} size={20} />
            </button>
            <div className="absolute inset-x-0 bottom-0 z-10 px-2 pb-1">{seekBar}</div>
          </>
        ) : (
          <div
            className={`absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-3 pb-1.5 pt-14 transition-opacity duration-200 ${
              showUi && armed ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            {seekBar}
            <div className="flex items-center gap-0.5 text-white">
              <button type="button" onClick={toggle} aria-label={playing ? "Pause (k)" : "Play (k)"} className={btn}>
                <Icon d={playing ? ICONS.pause : ended ? ICONS.replay : ICONS.play} />
              </button>
              {nextHref && (
                <button type="button" onClick={goNext} aria-label="Next video" title={nextTitle ?? "Next"} className={btn}>
                  <Icon d={ICONS.next} />
                </button>
              )}
              <div className="group/vol flex items-center">
                <button type="button" onClick={toggleMute} aria-label={muted ? "Unmute (m)" : "Mute (m)"} className={btn}>
                  <Icon d={muted || volume === 0 ? ICONS.mute : ICONS.volume} />
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={muted ? 0 : volume}
                  onChange={(e) => changeVolume(Number(e.target.value))}
                  aria-label="Volume"
                  className="w-0 accent-white opacity-0 transition-all group-hover/vol:w-20 group-hover/vol:opacity-100 focus:w-20 focus:opacity-100"
                />
              </div>
              {live ? (
                <button
                  type="button"
                  onClick={() => seekTo(engine.current?.duration() ?? time)}
                  title="Go to the live part"
                  className="ml-1.5 flex items-center gap-1.5 rounded-full px-2 py-1 text-sm font-semibold hover:bg-white/10"
                >
                  <span className={`h-2 w-2 rounded-full ${duration - time < 15 ? "bg-danger" : "bg-white/50"}`} aria-hidden="true" />
                  {duration - time < 15 ? "LIVE" : "Go live"}
                </button>
              ) : (
                <span className="ml-1.5 text-sm tabular-nums text-white/90">
                {fmt(time)} <span className="text-white/50">/ {fmt(duration)}</span>
              </span>
              )}
              <span className="flex-1" />
              {segments.some((s) => skip.includes(s.category)) && (
                <span className="hidden rounded-full bg-white/10 px-2.5 py-1 text-xs text-white/80 sm:inline" title="SponsorBlock is skipping ads inside this video">
                  Ads skipped
                </span>
              )}
              {rate !== 1 && <span className="px-1 text-xs text-white/80">{rate}×</span>}
              {(mode === "youtube" || (privateSrc?.captions.length ?? 0) > 0) && (
                <button
                  type="button"
                  onClick={toggleCaptions}
                  aria-pressed={cc}
                  aria-label={cc ? "Captions off (c)" : "Captions on (c)"}
                  title="Captions (c)"
                  className={`${btn} text-xs font-bold`}
                >
                  <span className={`rounded border px-1 py-0.5 leading-none ${cc ? "border-accent bg-accent text-on-accent" : "border-white/80"}`}>CC</span>
                </button>
              )}
              <div className="relative">
                <button type="button" onClick={() => setMenu((m) => !m)} aria-label="Settings" aria-expanded={menu} className={btn}>
                  <Icon d={ICONS.gear} />
                </button>
                {menu && (
                  <div role="menu" className="absolute bottom-12 right-0 w-64 rounded-xl bg-black/90 p-2 text-sm text-white shadow-2xl ring-1 ring-white/10 backdrop-blur">
                    <p className="px-2 pb-1 pt-1 text-xs text-white/60">Speed</p>
                    <div className="grid grid-cols-4 gap-1 px-1 pb-2">
                      {RATES.map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => changeRate(r)}
                          className={`rounded-lg py-1.5 text-xs ${r === rate ? "bg-accent font-medium text-on-accent" : "hover:bg-white/10"}`}
                        >
                          {r === 1 ? "1×" : `${r}×`}
                        </button>
                      ))}
                    </div>
                    <p className="px-2 pb-1 pt-1 text-xs text-white/60">Caption size</p>
                    <div className="grid grid-cols-4 gap-1 px-1 pb-2">
                      {[
                        [-1, "S"],
                        [0, "M"],
                        [1, "L"],
                        [2, "XL"],
                      ].map(([n, label]) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => changeCaptionSize(n as number)}
                          className={`rounded-lg py-1.5 text-xs ${n === ccSize ? "bg-accent font-medium text-on-accent" : "hover:bg-white/10"}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {mode === "native" && (
                      <div className="grid grid-cols-2 gap-1 px-1 pb-2">
                        {(["box", "outline"] as const).map((st) => (
                          <button
                            key={st}
                            type="button"
                            onClick={() => (setCcStyle(st), store("captionStyle", st))}
                            className={`rounded-lg py-1.5 text-xs ${st === ccStyle ? "bg-accent font-medium text-on-accent" : "hover:bg-white/10"}`}
                          >
                            {st === "box" ? "▭ Box" : "A Outline"}
                          </button>
                        ))}
                      </div>
                    )}
                    {source === "youtube" && (
                      <label
                        className="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-2 hover:bg-white/10"
                        title="If YouTube shows one of its own ads, turn this on to press its Skip button"
                      >
                        Let me press YouTube&apos;s &quot;Skip ad&quot;
                        <input type="checkbox" checked={ytClickThrough} onChange={(e) => setYtClickThrough(e.target.checked)} className="accent-[var(--accent)]" />
                      </label>
                    )}
                    <Link href="/extensions" className="block rounded-lg px-2 py-2 text-white/80 hover:bg-white/10 hover:text-white">
                      Ad skipping, autoplay and more → Extensions
                    </Link>
                  </div>
                )}
              </div>
              {mode === "native" && (
                <button type="button" onClick={pip} aria-label="Picture in picture" className={btn}>
                  <Icon d={ICONS.pip} />
                </button>
              )}
              <button type="button" onClick={toggleFullscreen} aria-label={fullscreen ? "Exit full screen (f)" : "Full screen (f)"} className={btn}>
                <Icon d={fullscreen || fillWindow ? ICONS.exitFull : ICONS.full} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
