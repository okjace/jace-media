"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { loadYouTubeApi, YT_STATE, type YTPlayer } from "@/components/player/youtubeApi";

/** Plays a Jace video file or a YouTube video (privacy-enhanced player, YouTube's buttons cropped out), for the TV app. */
export type Surface = {
  play(): void;
  pause(): void;
  toggle(): void;
  seekBy(seconds: number): void;
  time(): number;
  duration(): number;
  paused(): boolean;
  captions(on: boolean): void;
};

type Props = {
  source: "jace" | "youtube";
  id: string;
  src?: string | null;
  fit?: "contain" | "cover";
  onState?: (playing: boolean) => void;
  onEnded?: () => void;
};

export const VideoSurface = forwardRef<Surface, Props>(function VideoSurface({ source, id, src, fit = "contain", onState, onEnded }, ref) {
  const video = useRef<HTMLVideoElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const yt = useRef<YTPlayer | null>(null);
  const cb = useRef({ onState, onEnded });
  useEffect(() => {
    cb.current = { onState, onEnded };
  });

  useEffect(() => {
    if (source !== "youtube" || !host.current) return;
    let cancelled = false;
    const el = document.createElement("div");
    host.current.appendChild(el);
    void loadYouTubeApi().then((YT) => {
      if (cancelled) return;
      yt.current = new YT.Player(el, {
        videoId: id,
        host: "https://www.youtube-nocookie.com",
        width: "100%",
        height: "100%",
        playerVars: { autoplay: 1, controls: 0, disablekb: 1, fs: 0, rel: 0, modestbranding: 1, iv_load_policy: 3, playsinline: 1, origin: window.location.origin },
        events: {
          onReady: (e) => e.target.playVideo(),
          onStateChange: ({ data }) => {
            cb.current.onState?.(data === YT_STATE.PLAYING || data === YT_STATE.BUFFERING);
            if (data === YT_STATE.ENDED) cb.current.onEnded?.();
          },
        },
      });
    });
    return () => {
      cancelled = true;
      try {
        yt.current?.destroy();
      } catch {}
      yt.current = null;
      el.remove();
    };
  }, [source, id]);

  useImperativeHandle(
    ref,
    () => ({
      play: () => (source === "jace" ? void video.current?.play() : yt.current?.playVideo()),
      pause: () => (source === "jace" ? video.current?.pause() : yt.current?.pauseVideo()),
      toggle() {
        if (this.paused()) this.play();
        else this.pause();
      },
      seekBy(s) {
        if (source === "jace" && video.current) video.current.currentTime = Math.max(0, video.current.currentTime + s);
        else if (yt.current) yt.current.seekTo(Math.max(0, yt.current.getCurrentTime() + s), true);
      },
      time: () => (source === "jace" ? (video.current?.currentTime ?? 0) : (yt.current?.getCurrentTime?.() ?? 0)),
      duration: () => (source === "jace" ? video.current?.duration || 0 : (yt.current?.getDuration?.() ?? 0)),
      paused: () =>
        source === "jace" ? (video.current?.paused ?? true) : ![YT_STATE.PLAYING, YT_STATE.BUFFERING].includes((yt.current?.getPlayerState?.() ?? -1) as never),
      captions(on) {
        const p = yt.current;
        if (!p) return;
        try {
          if (!on) {
            p.setOption("captions", "track", {});
            p.unloadModule("captions");
            return;
          }
          p.loadModule("captions");
          const pick = () => {
            const list = (p.getOption("captions", "tracklist") as { languageCode: string }[] | undefined) ?? [];
            const t = list.find((x) => x.languageCode.startsWith(navigator.language.slice(0, 2))) ?? list.find((x) => x.languageCode.startsWith("en")) ?? list[0];
            if (t) p.setOption("captions", "track", { languageCode: t.languageCode });
          };
          pick();
          setTimeout(pick, 800);
          setTimeout(pick, 2000);
        } catch {}
      },
    }),
    [source],
  );

  if (source === "jace") {
    return (
      <video
        ref={video}
        src={src ?? undefined}
        autoPlay
        playsInline
        onPlay={() => onState?.(true)}
        onPause={() => onState?.(false)}
        onEnded={() => onEnded?.()}
        className={`h-full w-full bg-black ${fit === "cover" ? "object-cover" : "object-contain"}`}
      />
    );
  }
  // Taller than the screen, so YouTube's own title bar and logo sit outside it.
  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <div ref={host} className="pointer-events-none absolute inset-x-0 -bottom-[12%] -top-[12%] [&_iframe]:h-full [&_iframe]:w-full" />
    </div>
  );
});
