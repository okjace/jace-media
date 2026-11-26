"use client";

/* eslint-disable @next/next/no-img-element -- pictures come from Jace Media's own image routes or Jace */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { VideoSurface, type Surface } from "@/components/tv/VideoSurface";

/**
 * Jace Media for TVs (LG webOS, Android TV, any smart TV browser): its own
 * full-screen interface, made for a remote. Arrow keys move between things,
 * OK opens them, Back goes back. Signing in is a QR code you scan with your
 * phone; profiles can be locked with a PIN.
 */

// ---------- Types from /api/app ----------

type Video = {
  source: "jace" | "youtube";
  id: string;
  title: string;
  thumbnail: string | null;
  channelId: string;
  channelName: string;
  channelPicture: string | null;
  publishedAt: string | null;
  views: number | null;
  short: boolean;
  src: string | null;
};
type Account = { sub: string; handle: string; name: string; picture: string | null; hasPin: boolean };
type Me = { account: Account | null; others: Account[] };
type WatchInfo = {
  video: {
    source: "jace" | "youtube";
    id: string;
    title: string;
    description: string;
    channelId: string | null;
    channelName: string;
    channelPicture: string | null;
    views: number | null;
    likes: number | null;
    live?: boolean;
    thumbnail: string | null;
    stream: { type: "file"; url: string } | { type: "youtube"; id: string };
  };
  upNext: Video[];
};
type LiveStream = { id: string; title: string; thumbnail: string | null; viewers: number; host: { name: string; picture: string | null } };

type Screen =
  | { name: "home" | "shorts" | "subs" | "live" | "search" | "you" }
  | { name: "watch"; source: "jace" | "youtube"; id: string }
  | { name: "channel"; id: string; title: string };

const NAV: { name: "home" | "shorts" | "subs" | "live" | "search" | "you"; label: string; icon: string }[] = [
  { name: "search", label: "Search", icon: "⌕" },
  { name: "home", label: "Home", icon: "⌂" },
  { name: "shorts", label: "Shorts", icon: "▯" },
  { name: "subs", label: "Subscriptions", icon: "☰" },
  { name: "live", label: "Live", icon: "◉" },
  { name: "you", label: "You", icon: "☺" },
];

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const UNLOCK_KEY = "jm_tv_unlocked";

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: init?.body ? { "Content-Type": "application/json" } : undefined });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
  return data;
}

function useApi<T>(url: string | null): { data: T | null; error: string | null } {
  const [state, setState] = useState<{ url: string | null; data: T | null; error: string | null }>({ url: null, data: null, error: null });
  useEffect(() => {
    if (!url) return;
    let stop = false;
    getJson<T>(url)
      .then((data) => !stop && setState({ url, data, error: null }))
      .catch((e: Error) => !stop && setState({ url, data: null, error: e.message }));
    return () => {
      stop = true;
    };
  }, [url]);
  return state.url === url ? { data: state.data, error: state.error } : { data: null, error: null };
}

// ---------- Remote: arrow keys move focus between [data-tv] things ----------

const isBack = (e: KeyboardEvent) => e.key === "Escape" || e.key === "GoBack" || e.key === "BrowserBack" || e.keyCode === 461 || e.keyCode === 10009;

function moveFocus(dir: "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight", scope: ParentNode = document) {
  const all = [...scope.querySelectorAll<HTMLElement>("[data-tv]:not([disabled])")].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
  });
  if (!all.length) return;
  const cur = document.activeElement as HTMLElement | null;
  if (!cur || !all.includes(cur)) {
    (all.find((el) => el.dataset.tvDefault !== undefined) ?? all[0]).focus();
    return;
  }
  const a = cur.getBoundingClientRect();
  const ax = a.left + a.width / 2;
  const ay = a.top + a.height / 2;
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  const fromMenu = !!cur.closest("nav");
  for (const el of all) {
    if (el === cur) continue;
    // Up/down stay on their side: the menu only opens with Left, and only Right leaves it.
    const inMenu = !!el.closest("nav");
    if ((dir === "ArrowUp" || dir === "ArrowDown") && inMenu !== fromMenu) continue;
    const b = el.getBoundingClientRect();
    const bx = b.left + b.width / 2;
    const by = b.top + b.height / 2;
    const dx = bx - ax;
    const dy = by - ay;
    let main: number;
    let side: number;
    if (dir === "ArrowRight") [main, side] = [dx, dy];
    else if (dir === "ArrowLeft") [main, side] = [-dx, dy];
    else if (dir === "ArrowDown") [main, side] = [dy, dx];
    else [main, side] = [-dy, dx];
    if (main <= 4) continue;
    // Prefer things in line (same row/column) over closer things off to the side.
    const score = main + Math.abs(side) * 2.5;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  // Stepping into the side menu lands on the screen you're on.
  if (best?.closest("nav") && !cur.closest("nav")) best = best.closest("nav")!.querySelector<HTMLElement>("[data-tv-active]") ?? best;
  if (best) {
    best.focus({ preventScroll: true });
    best.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }
}

// ---------- Small pieces ----------

const focusRing = "outline-none transition-transform duration-150 focus:scale-[1.06] focus:ring-[0.25rem] focus:ring-accent focus:ring-offset-[0.2rem] focus:ring-offset-[#0b0d10]";

function Card({ v, onOpen, wide = true, first = false }: { v: Video; onOpen: (v: Video) => void; wide?: boolean; first?: boolean }) {
  return (
    <button
      type="button"
      data-tv
      data-tv-default={first ? "" : undefined}
      onClick={() => onOpen(v)}
      className={`group shrink-0 rounded-[1rem] text-left ${focusRing} ${wide ? "w-[19rem]" : "w-[11rem]"}`}
    >
      <div className={`overflow-hidden rounded-[1rem] bg-white/5 ${wide ? "aspect-video" : "aspect-[9/16]"}`}>
        {v.thumbnail && <img src={v.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover" />}
      </div>
      <p className="mt-[0.6rem] line-clamp-2 text-[1.05rem] font-semibold leading-snug text-white/90 group-focus:text-white">{v.title}</p>
      {wide && <p className="mt-[0.2rem] truncate text-[0.9rem] text-white/50">{v.channelName}</p>}
    </button>
  );
}

function Row({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-[0.8rem]">
      <h2 className="px-[0.4rem] text-[1.35rem] font-semibold text-white/85">{title}</h2>
      <div className="no-scrollbar -my-[1rem] flex gap-[1.2rem] overflow-x-auto px-[0.6rem] py-[1rem]">{children}</div>
    </section>
  );
}

function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex h-[60vh] items-center justify-center gap-[1rem] text-[1.3rem] text-white/60">
      <span className="h-[2rem] w-[2rem] animate-spin rounded-full border-[0.25rem] border-white/15 border-t-accent" />
      {label}
    </div>
  );
}

function Logo({ size = 3 }: { size?: number }) {
  return <img src="/icon.svg" alt="" style={{ width: `${size}rem`, height: `${size}rem` }} className="rounded-[0.8rem]" />;
}

function Face({ name, picture, size = 7 }: { name: string; picture: string | null; size?: number }) {
  return picture ? (
    <img src={picture} alt="" className="rounded-full object-cover" style={{ width: `${size}rem`, height: `${size}rem` }} />
  ) : (
    <span
      className="flex items-center justify-center rounded-full bg-accent/20 font-bold text-accent"
      style={{ width: `${size}rem`, height: `${size}rem`, fontSize: `${size * 0.42}rem` }}
    >
      {(name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

// ---------- QR code sign-in / phone approval ----------

function useTvCode(body: Record<string, unknown> | null, onDone: (r: { unlocked?: string }) => void) {
  const [code, setCode] = useState<{ code: string; qr: string; url: string } | null>(null);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  const key = body ? JSON.stringify(body) : null;
  useEffect(() => {
    if (!key) return;
    let stop = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = async () => {
      try {
        const c = await getJson<{ code: string; qr: string; url: string }>("/api/tv", { method: "POST", body: key });
        if (stop) return;
        setCode(c);
        timer = setInterval(async () => {
          const r = await getJson<{ done?: boolean; expired?: boolean; unlocked?: string }>(`/api/tv?code=${c.code}`).catch(() => null);
          if (!r || stop) return;
          if (r.done) {
            clearInterval(timer);
            done.current(r);
          } else if (r.expired) {
            clearInterval(timer);
            void start();
          }
        }, 2000);
      } catch {}
    };
    void start();
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [key]);
  return code;
}

function QrBox({ code, caption }: { code: { code: string; qr: string; url: string } | null; caption: string }) {
  return (
    <div className="flex flex-col items-center gap-[1rem]">
      <div className="h-[15rem] w-[15rem] overflow-hidden rounded-[1.2rem] bg-white p-[0.6rem] [&_svg]:h-full [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: code?.qr ?? "" }} />
      <p className="text-[1.1rem] text-white/60">{caption}</p>
      {code && (
        <p className="text-center text-[1rem] text-white/50">
          or go to <span className="font-semibold text-white/80">{code.url.replace(/^https?:\/\//, "").replace(/\?.*$/, "")}</span> and enter
          <span className="ml-[0.5rem] rounded-[0.4rem] bg-white/10 px-[0.6rem] py-[0.15rem] font-mono text-[1.5rem] tracking-[0.25em] text-white">{code.code}</span>
        </p>
      )}
    </div>
  );
}

function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const code = useTvCode({ purpose: "signin" }, onSignedIn);
  return (
    <div className="flex h-full items-center justify-center gap-[6rem] px-[6rem]">
      <div className="flex max-w-[34rem] flex-col gap-[1.4rem]">
        <Logo size={5} />
        <h1 className="text-[3rem] font-bold leading-tight">Sign in to Jace Media</h1>
        <p className="text-[1.4rem] leading-relaxed text-white/65">
          Scan the code with your phone&apos;s camera and tap <b className="text-white">Sign in the TV</b>. No typing with the remote.
        </p>
      </div>
      <QrBox code={code} caption="Scan with your phone" />
    </div>
  );
}

// ---------- Profile lock ----------

function PinPad({ who, onUnlock, onBack }: { who: Account; onUnlock: () => void; onBack: () => void }) {
  const [digits, setDigits] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [privateEntry, setPrivateEntry] = useState(() => typeof window !== "undefined" && localStorage.getItem("jm_tv_private_pin") === "1");
  const phone = useTvCode({ purpose: "unlock", sub: who.sub }, (r) => r.unlocked === who.sub && onUnlock());

  const submit = useCallback(
    async (pin: string) => {
      setBusy(true);
      try {
        await getJson("/api/tv/pin", { method: "POST", body: JSON.stringify({ sub: who.sub, pin }) });
        onUnlock();
      } catch (e) {
        setError((e as Error).message);
        setDigits("");
      } finally {
        setBusy(false);
      }
    },
    [who.sub, onUnlock],
  );

  const press = useCallback(
    (d: string) => {
      if (busy) return;
      setError(null);
      setDigits((cur) => {
        const next = (cur + d).slice(0, 4);
        if (next.length === 4) void submit(next);
        return next;
      });
    },
    [busy, submit],
  );

  // The remote's number buttons (and a keyboard's) type the PIN.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = e.keyCode >= 48 && e.keyCode <= 57 ? e.keyCode - 48 : e.keyCode >= 96 && e.keyCode <= 105 ? e.keyCode - 96 : null;
      if (n !== null) {
        e.preventDefault();
        e.stopPropagation();
        press(String(n));
      } else if (e.key === "Backspace" || e.keyCode === 403) {
        e.preventDefault();
        e.stopPropagation();
        setDigits((d) => d.slice(0, -1));
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [press]);

  const togglePrivate = () => {
    setPrivateEntry((p) => {
      localStorage.setItem("jm_tv_private_pin", p ? "0" : "1");
      return !p;
    });
  };

  return (
    <div className="flex h-full items-center justify-center gap-[6rem] px-[5rem]">
      <div className="flex flex-col items-center gap-[1.6rem]">
        <Face name={who.name} picture={who.picture} size={7} />
        <h1 className="text-[2.2rem] font-bold">Enter {who.name}&apos;s PIN</h1>
        <div className="flex gap-[1.2rem]" aria-label={`${digits.length} of 4 numbers entered`}>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={`h-[1.4rem] w-[1.4rem] rounded-full border-[0.18rem] ${i < digits.length ? "border-white bg-white" : "border-white/40"}`} />
          ))}
        </div>
        <p className="h-[1.6rem] text-[1.15rem] text-[#ff7b7b]">{error}</p>
        {privateEntry ? (
          <div className="flex w-[22rem] flex-col items-center gap-[0.6rem] rounded-[1.2rem] bg-white/[.05] p-[1.6rem] text-center">
            <span className="text-[2.4rem]" aria-hidden="true">🔒</span>
            <p className="text-[1.15rem] text-white/75">Private entry: type your PIN with the number buttons on your remote. Nothing shows on screen.</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-[0.8rem]">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((k, i) =>
              k ? (
                <button
                  key={i}
                  type="button"
                  data-tv
                  data-tv-default={k === "1" ? "" : undefined}
                  onClick={() => (k === "⌫" ? setDigits((d) => d.slice(0, -1)) : press(k))}
                  className={`h-[4.2rem] w-[5.6rem] rounded-[1rem] bg-white/[.08] text-[1.8rem] font-semibold ${focusRing} focus:bg-white focus:text-black`}
                >
                  {k}
                </button>
              ) : (
                <span key={i} />
              ),
            )}
          </div>
        )}
        <div className="flex gap-[1rem]">
          <button type="button" data-tv onClick={togglePrivate} className={`rounded-full bg-white/[.08] px-[1.4rem] py-[0.7rem] text-[1.05rem] ${focusRing} focus:bg-white focus:text-black`}>
            {privateEntry ? "Show number pad" : "🔒 Private entry"}
          </button>
          <button type="button" data-tv onClick={onBack} className={`rounded-full bg-white/[.08] px-[1.4rem] py-[0.7rem] text-[1.05rem] ${focusRing} focus:bg-white focus:text-black`}>
            Other profiles
          </button>
        </div>
      </div>
      <div className="flex flex-col items-center gap-[0.8rem] border-l border-white/10 pl-[5rem]">
        <p className="text-[1.4rem] font-semibold">Or approve on your phone</p>
        <QrBox code={phone} caption="Open with the Jace Media app and tap Unlock" />
      </div>
    </div>
  );
}

function Profiles({ me, onPick, onAdd }: { me: Me; onPick: (a: Account) => void; onAdd: () => void }) {
  const list = [me.account, ...me.others].filter((a): a is Account => !!a);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-[3rem]">
      <h1 className="text-[2.8rem] font-bold">Who&apos;s watching?</h1>
      <div className="flex flex-wrap justify-center gap-[2.4rem]">
        {list.map((a, i) => (
          <button key={a.sub} type="button" data-tv data-tv-default={i === 0 ? "" : undefined} onClick={() => onPick(a)} className={`flex w-[10rem] flex-col items-center gap-[0.8rem] rounded-[1.4rem] p-[0.8rem] ${focusRing}`}>
            <Face name={a.name} picture={a.picture} size={8} />
            <span className="max-w-full truncate text-[1.25rem] font-medium">{a.name}</span>
            {a.hasPin && <span className="text-[0.95rem] text-white/50">🔒 PIN</span>}
          </button>
        ))}
        <button type="button" data-tv onClick={onAdd} className={`flex w-[10rem] flex-col items-center gap-[0.8rem] rounded-[1.4rem] p-[0.8rem] ${focusRing}`}>
          <span className="flex h-[8rem] w-[8rem] items-center justify-center rounded-full border-[0.2rem] border-dashed border-white/30 text-[3rem] text-white/60">+</span>
          <span className="text-[1.25rem] font-medium text-white/70">Add profile</span>
        </button>
      </div>
    </div>
  );
}

// ---------- Screens ----------

function Home({ open }: { open: (v: Video) => void }) {
  const { data, error } = useApi<{ videos: Video[]; shorts: Video[] }>("/api/app/home");
  if (error) return <p className="p-[3rem] text-[1.3rem] text-white/60">{error}</p>;
  if (!data) return <Loading />;
  const [hero, ...rest] = data.videos;
  return (
    <div className="flex flex-col gap-[2.4rem] pb-[4rem]">
      {hero && (
        <div className="relative -mx-[3rem] -mt-[2rem] flex h-[28rem] items-end overflow-hidden px-[3rem] pb-[2.4rem]">
          {hero.thumbnail && <img src={hero.thumbnail} alt="" className="absolute inset-0 h-full w-full scale-105 object-cover opacity-60 blur-[2px]" />}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0b0d10] via-[#0b0d10]/60 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0b0d10]/90 to-transparent" />
          <div className="relative flex max-w-[44rem] flex-col gap-[0.9rem]">
            <p className="text-[1.1rem] font-semibold uppercase tracking-wider text-accent">Recommended for you</p>
            <h1 className="line-clamp-2 text-[2.6rem] font-bold leading-tight">{hero.title}</h1>
            <p className="text-[1.2rem] text-white/70">
              {hero.channelName}
              {hero.views ? ` · ${compact.format(hero.views)} views` : ""}
            </p>
            <div className="mt-[0.4rem] flex gap-[1rem]">
              <button type="button" data-tv data-tv-default onClick={() => open(hero)} className={`rounded-full bg-white px-[2rem] py-[0.8rem] text-[1.2rem] font-bold text-black ${focusRing}`}>
                ▶ Play
              </button>
            </div>
          </div>
        </div>
      )}
      <Row title="Recommended">
        {rest.slice(0, 12).map((v) => (
          <Card key={v.id} v={v} onOpen={open} />
        ))}
      </Row>
      {data.shorts.length > 0 && (
        <Row title="Shorts">
          {data.shorts.map((v) => (
            <Card key={v.id} v={v} onOpen={open} wide={false} />
          ))}
        </Row>
      )}
      {rest.length > 12 && (
        <Row title="More for you">
          {rest.slice(12).map((v) => (
            <Card key={v.id} v={v} onOpen={open} />
          ))}
        </Row>
      )}
    </div>
  );
}

function Subs({ open, openChannel }: { open: (v: Video) => void; openChannel: (id: string, title: string) => void }) {
  const { data, error } = useApi<{ videos: Video[]; channels: { kind: string; ref: string; name: string; picture: string | null }[] }>("/api/app/subscriptions");
  if (error) return <p className="p-[3rem] text-[1.3rem] text-white/60">{error === "Sign in with Jace first." ? "Sign in to see your subscriptions." : error}</p>;
  if (!data) return <Loading />;
  const videos = data.videos.filter((v) => !v.short);
  const shorts = data.videos.filter((v) => v.short);
  return (
    <div className="flex flex-col gap-[2.4rem] pb-[4rem]">
      <h1 className="text-[2.2rem] font-bold">Subscriptions</h1>
      {data.channels.length > 0 && (
        <Row title="Your channels">
          {data.channels
            .filter((c) => c.kind === "youtube")
            .map((c, i) => (
              <button key={c.ref} type="button" data-tv data-tv-default={i === 0 ? "" : undefined} onClick={() => openChannel(c.ref, c.name)} className={`flex w-[8rem] shrink-0 flex-col items-center gap-[0.5rem] rounded-[1rem] p-[0.4rem] ${focusRing}`}>
                <Face name={c.name} picture={c.picture} size={5.5} />
                <span className="w-full truncate text-center text-[0.95rem] text-white/80">{c.name}</span>
              </button>
            ))}
        </Row>
      )}
      <Row title="Latest">
        {videos.slice(0, 30).map((v) => (
          <Card key={v.id} v={v} onOpen={open} />
        ))}
      </Row>
      {shorts.length > 0 && (
        <Row title="Shorts">
          {shorts.map((v) => (
            <Card key={v.id} v={v} onOpen={open} wide={false} />
          ))}
        </Row>
      )}
      {videos.length > 30 && (
        <Row title="Earlier">
          {videos.slice(30).map((v) => (
            <Card key={v.id} v={v} onOpen={open} />
          ))}
        </Row>
      )}
    </div>
  );
}

function Live({ open }: { open: (v: Video) => void }) {
  const { data, error } = useApi<{ jace: LiveStream[]; youtube: Video[] }>("/api/app/live");
  if (error) return <p className="p-[3rem] text-[1.3rem] text-white/60">{error}</p>;
  if (!data) return <Loading />;
  return (
    <div className="flex flex-col gap-[2.4rem] pb-[4rem]">
      <h1 className="text-[2.2rem] font-bold">Live</h1>
      {data.jace.length > 0 && (
        <Row title="On Jace Media">
          {data.jace.map((s) => (
            <div key={s.id} className="relative w-[19rem] shrink-0">
              <a href={`/live/watch/${s.id}`} data-tv className={`block rounded-[1rem] ${focusRing}`}>
                <div className="aspect-video overflow-hidden rounded-[1rem] bg-white/5">{s.thumbnail && <img src={s.thumbnail} alt="" className="h-full w-full object-cover" />}</div>
                <p className="mt-[0.6rem] line-clamp-2 text-[1.05rem] font-semibold">{s.title}</p>
                <p className="text-[0.9rem] text-white/50">{s.host.name}</p>
              </a>
              <span className="absolute left-[0.6rem] top-[0.6rem] rounded-[0.3rem] bg-[#e5484d] px-[0.5rem] py-[0.1rem] text-[0.8rem] font-bold">● LIVE</span>
            </div>
          ))}
        </Row>
      )}
      <Row title="Live on YouTube">
        {data.youtube.map((v, i) => (
          <Card key={v.id} v={v} onOpen={open} first={i === 0 && !data.jace.length} />
        ))}
      </Row>
    </div>
  );
}

function Search({ open }: { open: (v: Video) => void }) {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const { data } = useApi<{ videos: Video[]; shorts: Video[] }>(query ? `/api/app/search?q=${encodeURIComponent(query)}` : null);
  return (
    <div className="flex flex-col gap-[2rem] pb-[4rem]">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(q.trim());
        }}
        className="flex gap-[1rem]"
      >
        <input
          data-tv
          data-tv-default
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search videos and channels"
          className={`h-[4rem] flex-1 rounded-full bg-white/[.08] px-[2rem] text-[1.4rem] outline-none placeholder:text-white/40 focus:bg-white/[.14] focus:ring-[0.2rem] focus:ring-accent`}
        />
        <button type="submit" data-tv className={`rounded-full bg-accent px-[2rem] text-[1.3rem] font-bold text-[#0c1410] ${focusRing}`}>
          Search
        </button>
      </form>
      {query && !data && <Loading label="Searching…" />}
      {data && (
        <>
          <Row title="Videos">
            {data.videos.map((v) => (
              <Card key={v.id} v={v} onOpen={open} />
            ))}
          </Row>
          {data.shorts.length > 0 && (
            <Row title="Shorts">
              {data.shorts.map((v) => (
                <Card key={v.id} v={v} onOpen={open} wide={false} />
              ))}
            </Row>
          )}
        </>
      )}
    </div>
  );
}

function Channel({ id, title, open }: { id: string; title: string; open: (v: Video) => void }) {
  const { data } = useApi<{ channel: { name: string; picture: string | null; banner?: string | null; subscribers?: number | null }; videos: Video[]; shorts: Video[] }>(
    `/api/app/channel/youtube/${encodeURIComponent(id)}`,
  );
  if (!data) return <Loading label={`Loading ${title}…`} />;
  return (
    <div className="flex flex-col gap-[2.4rem] pb-[4rem]">
      <div className="flex items-center gap-[1.6rem]">
        <Face name={data.channel.name} picture={data.channel.picture} size={6} />
        <div>
          <h1 className="text-[2.4rem] font-bold">{data.channel.name}</h1>
          {data.channel.subscribers ? <p className="text-[1.1rem] text-white/55">{compact.format(data.channel.subscribers)} subscribers</p> : null}
        </div>
      </div>
      <Row title="Videos">
        {data.videos.map((v, i) => (
          <Card key={v.id} v={v} onOpen={open} first={i === 0} />
        ))}
      </Row>
      {data.shorts.length > 0 && (
        <Row title="Shorts">
          {data.shorts.map((v) => (
            <Card key={v.id} v={v} onOpen={open} wide={false} />
          ))}
        </Row>
      )}
    </div>
  );
}

function You({ me, onLock, onProfiles, reload }: { me: Me; onLock: () => void; onProfiles: () => void; reload: () => void }) {
  const a = me.account!;
  const [step, setStep] = useState<"menu" | "set" | "confirm" | "remove">("menu");
  const [first, setFirst] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const btn = `rounded-[1rem] bg-white/[.07] px-[1.6rem] py-[1rem] text-left text-[1.2rem] ${focusRing} focus:bg-white focus:text-black`;

  if (step === "remove") {
    return (
      <NewPin
        title="Enter your PIN to remove it"
        onDone={async (pin) => {
          try {
            await getJson("/api/tv/pin", { method: "PUT", body: JSON.stringify({ pin: null, currentPin: pin }) });
            setMsg("PIN removed.");
            reload();
          } catch (e) {
            setMsg((e as Error).message);
          }
          setStep("menu");
        }}
        onCancel={() => setStep("menu")}
      />
    );
  }
  if (step !== "menu") {
    return (
      <NewPin
        title={step === "set" ? "Choose a 4-number PIN" : "Enter it again"}
        onDone={async (pin) => {
          if (step === "set") {
            setFirst(pin);
            setStep("confirm");
            return;
          }
          if (pin !== first) {
            setMsg("Those didn't match. Try again.");
            setStep("menu");
            return;
          }
          try {
            await getJson("/api/tv/pin", { method: "PUT", body: JSON.stringify({ pin }) });
            setMsg("PIN set. This profile now asks for it on TVs.");
            reload();
          } catch (e) {
            setMsg((e as Error).message);
          }
          setStep("menu");
        }}
        onCancel={() => setStep("menu")}
      />
    );
  }

  return (
    <div className="flex max-w-[48rem] flex-col gap-[1.6rem] pb-[4rem]">
      <div className="flex items-center gap-[1.4rem]">
        <Face name={a.name} picture={a.picture} size={6} />
        <div>
          <h1 className="text-[2.2rem] font-bold">{a.name}</h1>
          <p className="text-[1.1rem] text-white/55">@{a.handle}</p>
        </div>
      </div>
      {msg && <p className="text-[1.15rem] text-accent">{msg}</p>}
      <button type="button" data-tv data-tv-default onClick={onProfiles} className={btn}>
        👥 Switch profile
      </button>
      {a.hasPin ? (
        <>
          <button type="button" data-tv onClick={onLock} className={btn}>
            🔒 Lock now
          </button>
          <button
            type="button"
            data-tv
            onClick={() => setStep("remove")}
            className={btn}
          >
            Remove PIN
          </button>
        </>
      ) : (
        <button type="button" data-tv onClick={() => setStep("set")} className={btn}>
          🔒 Lock this profile with a PIN
        </button>
      )}
      <form action="/api/auth/signout" method="post">
        <button type="submit" data-tv className={btn}>
          Sign out
        </button>
      </form>
    </div>
  );
}

function NewPin({ title, onDone, onCancel }: { title: string; onDone: (pin: string) => void; onCancel: () => void }) {
  const [digits, setDigits] = useState("");
  const add = useCallback(
    (d: string) =>
      setDigits((cur) => {
        const next = (cur + d).slice(0, 4);
        if (next.length === 4) setTimeout(() => onDone(next), 150);
        return next.length === 4 ? "" : next;
      }),
    [onDone],
  );
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = e.keyCode >= 48 && e.keyCode <= 57 ? e.keyCode - 48 : e.keyCode >= 96 && e.keyCode <= 105 ? e.keyCode - 96 : null;
      if (n !== null) {
        e.preventDefault();
        e.stopPropagation();
        add(String(n));
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [add]);
  return (
    <div className="flex flex-col items-center gap-[1.4rem] pt-[4rem]">
      <h1 className="text-[2rem] font-bold">{title}</h1>
      <div className="flex gap-[1.2rem]">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`h-[1.4rem] w-[1.4rem] rounded-full border-[0.18rem] ${i < digits.length ? "border-white bg-white" : "border-white/40"}`} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-[0.8rem]">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((k, i) =>
          k ? (
            <button key={i} type="button" data-tv data-tv-default={k === "1" ? "" : undefined} onClick={() => (k === "⌫" ? setDigits((d) => d.slice(0, -1)) : add(k))} className={`h-[4.2rem] w-[5.6rem] rounded-[1rem] bg-white/[.08] text-[1.8rem] font-semibold ${focusRing} focus:bg-white focus:text-black`}>
              {k}
            </button>
          ) : (
            <span key={i} />
          ),
        )}
      </div>
      <button type="button" data-tv onClick={onCancel} className={`rounded-full bg-white/[.08] px-[1.4rem] py-[0.7rem] text-[1.05rem] ${focusRing} focus:bg-white focus:text-black`}>
        Cancel
      </button>
    </div>
  );
}

// ---------- Player ----------

function fmt(s: number): string {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(Math.floor(s % 60)).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

function Player({ source, id, onOpen, onExit }: { source: "jace" | "youtube"; id: string; onOpen: (v: Video) => void; onExit: () => void }) {
  const { data } = useApi<WatchInfo>(`/api/app/watch/${source}/${encodeURIComponent(id)}`);
  const surface = useRef<Surface>(null);
  const [playing, setPlaying] = useState(true);
  const [ui, setUi] = useState(true);
  const [t, setT] = useState({ time: 0, duration: 0 });
  const [cc, setCc] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const box = useRef<HTMLDivElement>(null);
  const recorded = useRef(false);

  const poke = useCallback(() => {
    setUi(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (!surface.current?.paused()) setUi(false);
    }, 4500);
  }, []);

  useEffect(() => {
    const i = setInterval(() => {
      const s = surface.current;
      if (s) setT({ time: s.time(), duration: s.duration() });
    }, 500);
    return () => clearInterval(i);
  }, []);

  // Count it in your history once it starts.
  useEffect(() => {
    if (!playing || recorded.current || !data) return;
    recorded.current = true;
    void fetch("/api/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, id, title: data.video.title, channelId: data.video.channelId, channelName: data.video.channelName, thumbnail: data.video.thumbnail }),
    }).catch(() => {});
  }, [playing, data, source, id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = surface.current;
      if (isBack(e)) return; // handled by the app (history)
      const media: Record<number, () => void> = {
        415: () => s?.play(),
        19: () => s?.pause(),
        412: () => s?.seekBy(-10),
        417: () => s?.seekBy(10),
        179: () => s?.toggle(),
      };
      if (media[e.keyCode] || e.key === "MediaPlayPause") {
        e.preventDefault();
        (media[e.keyCode] ?? (() => s?.toggle()))();
        poke();
        return;
      }
      if (!ui) {
        // Controls hidden: OK pauses, left/right skip, up/down bring the controls back.
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          s?.toggle();
          poke();
        } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          s?.seekBy(e.key === "ArrowLeft" ? -10 : 10);
          setToast(e.key === "ArrowLeft" ? "⏪ 10s" : "10s ⏩");
          setTimeout(() => setToast(null), 700);
        } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          poke();
          setTimeout(() => box.current?.querySelector<HTMLElement>("[data-tv-default]")?.focus(), 0);
        }
        e.stopPropagation();
        return;
      }
      poke();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [ui, poke]);

  useEffect(() => {
    // Show the controls when the video opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    poke();
    return () => clearTimeout(hideTimer.current);
  }, [poke]);

  const v = data?.video;
  const ctl = `rounded-full bg-white/10 px-[1.4rem] py-[0.8rem] text-[1.3rem] font-semibold backdrop-blur ${focusRing} focus:bg-white focus:text-black`;
  return (
    <div ref={box} className="fixed inset-0 z-50 bg-black">
      {v && (
        <VideoSurface
          ref={surface}
          source={v.stream.type === "file" ? "jace" : "youtube"}
          id={v.id}
          src={v.stream.type === "file" ? v.stream.url : null}
          onState={(p) => {
            setPlaying(p);
            if (!p) setUi(true);
          }}
          onEnded={() => data?.upNext[0] && onOpen(data.upNext[0])}
        />
      )}
      {!v && <Loading />}
      {toast && <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/70 px-[1.6rem] py-[0.8rem] text-[1.6rem] font-bold">{toast}</div>}
      <div className={`absolute inset-0 flex flex-col justify-between transition-opacity duration-300 ${ui ? "opacity-100" : "pointer-events-none opacity-0"}`}>
        <div className="bg-gradient-to-b from-black/85 to-transparent px-[3rem] pb-[4rem] pt-[2rem]">
          <p className="line-clamp-1 text-[1.8rem] font-bold">{v?.title}</p>
          <p className="text-[1.15rem] text-white/70">
            {v?.channelName}
            {v?.live ? " · 🔴 LIVE" : ""}
          </p>
        </div>
        <div className="flex flex-col gap-[1.2rem] bg-gradient-to-t from-black/90 via-black/60 to-transparent px-[3rem] pb-[2rem] pt-[5rem]">
          {!v?.live && (
            <div className="flex items-center gap-[1rem] text-[1.05rem] tabular-nums text-white/80">
              <span>{fmt(t.time)}</span>
              <div className="h-[0.35rem] flex-1 overflow-hidden rounded-full bg-white/25">
                <div className="h-full rounded-full bg-accent" style={{ width: `${t.duration ? (t.time / t.duration) * 100 : 0}%` }} />
              </div>
              <span>{fmt(t.duration)}</span>
            </div>
          )}
          <div className="flex items-center gap-[1rem]">
            <button type="button" data-tv onClick={() => surface.current?.seekBy(-10)} className={ctl}>
              ⏪ 10
            </button>
            <button type="button" data-tv data-tv-default onClick={() => surface.current?.toggle()} className={ctl}>
              {playing ? "❚❚ Pause" : "▶ Play"}
            </button>
            <button type="button" data-tv onClick={() => surface.current?.seekBy(10)} className={ctl}>
              10 ⏩
            </button>
            {v?.stream.type === "youtube" && (
              <button
                type="button"
                data-tv
                onClick={() => {
                  surface.current?.captions(!cc);
                  setCc(!cc);
                }}
                className={`${ctl} ${cc ? "!bg-accent !text-[#0c1410]" : ""}`}
              >
                CC
              </button>
            )}
            <span className="flex-1" />
            <button type="button" data-tv onClick={onExit} className={ctl}>
              ✕ Close
            </button>
          </div>
          {data && data.upNext.length > 0 && (
            <div className="flex flex-col gap-[0.6rem]">
              <p className="text-[1.05rem] font-semibold text-white/70">Up next</p>
              <div className="no-scrollbar -my-[0.8rem] flex gap-[1rem] overflow-x-auto px-[0.4rem] py-[0.8rem]">
                {data.upNext.slice(0, 12).map((n) => (
                  <button key={n.id} type="button" data-tv onClick={() => onOpen(n)} className={`w-[14rem] shrink-0 text-left ${focusRing} rounded-[0.8rem]`}>
                    <div className="aspect-video overflow-hidden rounded-[0.8rem] bg-white/5">{n.thumbnail && <img src={n.thumbnail} alt="" className="h-full w-full object-cover" />}</div>
                    <p className="mt-[0.4rem] line-clamp-1 text-[0.95rem]">{n.title}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Shorts({ onExit }: { onExit: () => void }) {
  const { data } = useApi<{ videos: Video[] }>("/api/app/shorts");
  const [i, setI] = useState(0);
  const surface = useRef<Surface>(null);
  const list = data?.videos ?? [];
  const cur = list[i];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // While the side menu has focus, the arrows move through it.
      if ((document.activeElement as HTMLElement | null)?.closest("nav")) return;
      if (e.key === "ArrowDown") setI((n) => Math.min(list.length - 1, n + 1));
      else if (e.key === "ArrowUp") setI((n) => Math.max(0, n - 1));
      else if (e.key === "Enter" || e.key === " ") surface.current?.toggle();
      else if (e.key === "ArrowLeft") {
        const menu = document.querySelector<HTMLElement>("nav [data-tv]:nth-of-type(3)");
        if (menu) menu.focus();
        else onExit();
      }
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [list.length, onExit]);
  if (!data) return <Loading />;
  if (!cur) return <p className="p-[3rem] text-[1.3rem] text-white/60">No Shorts right now.</p>;
  return (
    <div className="flex h-full items-center justify-center gap-[3rem]">
      <div className="aspect-[9/16] h-[92vh] overflow-hidden rounded-[1.4rem] bg-black shadow-2xl">
        <VideoSurface key={`${cur.source}:${cur.id}`} ref={surface} source={cur.source} id={cur.id} src={cur.src} fit="cover" onEnded={() => setI((n) => Math.min(list.length - 1, n + 1))} />
      </div>
      <div className="flex w-[26rem] flex-col gap-[1rem]">
        <p className="text-[1.6rem] font-bold leading-snug">{cur.title}</p>
        <p className="text-[1.15rem] text-white/60">{cur.channelName}</p>
        <div className="mt-[2rem] flex flex-col gap-[0.5rem] text-[1.05rem] text-white/45">
          <p>▲ ▼ Previous / next</p>
          <p>OK Pause</p>
          <p>◀ Back to the menu</p>
        </div>
        <p className="mt-[1rem] text-[1rem] text-white/40">
          {i + 1} / {list.length}
        </p>
      </div>
    </div>
  );
}

// ---------- The app ----------

export function TvApp() {
  const [me, setMe] = useState<Me | null>(null);
  const [gate, setGate] = useState<"loading" | "signin" | "profiles" | "pin" | "open">("loading");
  const [pinFor, setPinFor] = useState<Account | null>(null);
  const [stack, setStack] = useState<Screen[]>([{ name: "home" }]);
  const screen = stack[stack.length - 1];

  // A TV-sized page: 1rem is 1/96 of the screen width, so it looks the same on every TV.
  useEffect(() => {
    const html = document.documentElement;
    const before = html.style.fontSize;
    html.style.fontSize = "calc(100vw / 96)";
    document.body.style.overflow = "hidden";
    return () => {
      html.style.fontSize = before;
      document.body.style.overflow = "";
    };
  }, []);

  const loadMe = useCallback(async () => {
    const m = await getJson<Me>("/api/app/me").catch(() => null);
    setMe(m);
    return m;
  }, []);

  const enter = useCallback((m: Me | null) => {
    if (!m?.account) return setGate("signin");
    if (m.account.hasPin && sessionStorage.getItem(UNLOCK_KEY) !== m.account.sub) {
      setPinFor(m.account);
      return setGate("pin");
    }
    setGate("open");
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadMe().then((m) => {
      if (m?.account && m.others.length > 0 && !sessionStorage.getItem(UNLOCK_KEY)) setGate("profiles");
      else enter(m);
    });
  }, [loadMe, enter]);

  // Back button: the app keeps its own history, so the TV's Back key (and Android TV's) works.
  const push = useCallback((s: Screen) => {
    setStack((st) => [...st, s]);
    history.pushState({ tv: true }, "");
  }, []);
  const go = useCallback((s: Screen) => {
    setStack([s]);
  }, []);
  useEffect(() => {
    const onPop = () => setStack((st) => (st.length > 1 ? st.slice(0, -1) : st));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Arrow keys move between things; Back goes back.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isBack(e) || (e.key === "Backspace" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement))) {
        e.preventDefault();
        if (stack.length > 1) history.back();
        else if (gate === "pin" || gate === "signin") setGate(me?.account ? "profiles" : "signin");
        return;
      }
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        const t = e.target as HTMLElement;
        if (t instanceof HTMLInputElement && (e.key === "ArrowLeft" || e.key === "ArrowRight")) return;
        e.preventDefault();
        moveFocus(e.key as "ArrowUp");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stack.length, gate, me]);

  // Put the focus somewhere sensible after every screen change.
  useEffect(() => {
    const t = setTimeout(() => {
      const main = document.querySelector("[data-tv-main]") ?? document;
      const el = main.querySelector<HTMLElement>("[data-tv-default]") ?? main.querySelector<HTMLElement>("[data-tv]");
      el?.focus({ preventScroll: true });
    }, 350);
    return () => clearTimeout(t);
  }, [screen, gate]);

  const open = useCallback((v: Video) => push({ name: "watch", source: v.source, id: v.id }), [push]);
  const openChannel = useCallback((id: string, title: string) => push({ name: "channel", id, title }), [push]);

  const pick = async (a: Account) => {
    if (me?.account?.sub !== a.sub) {
      await getJson("/api/accounts/switch", { method: "POST", body: JSON.stringify({ sub: a.sub }) }).catch(() => {});
      sessionStorage.removeItem(UNLOCK_KEY);
    }
    const m = await loadMe();
    enter(m);
  };

  const shell = (children: ReactNode) => (
    <div className="fixed inset-0 z-[500] overflow-hidden bg-[#0b0d10] font-sans text-white antialiased [&_*]:cursor-none">{children}</div>
  );

  if (gate === "loading") return shell(<Loading label="Opening Jace Media…" />);
  if (gate === "signin")
    return shell(
      <SignIn
        onSignedIn={async () => {
          const m = await loadMe();
          if (m?.account) sessionStorage.setItem(UNLOCK_KEY, m.account.sub); // you just approved it on your phone
          enter(m);
        }}
      />,
    );
  if (gate === "profiles" && me) return shell(<Profiles me={me} onPick={pick} onAdd={() => setGate("signin")} />);
  if (gate === "pin" && pinFor)
    return shell(
      <PinPad
        who={pinFor}
        onUnlock={() => {
          sessionStorage.setItem(UNLOCK_KEY, pinFor.sub);
          setGate("open");
        }}
        onBack={() => setGate("profiles")}
      />,
    );
  if (!me?.account) return shell(<Loading />);

  if (screen.name === "watch") return shell(<Player key={`${screen.source}:${screen.id}`} source={screen.source} id={screen.id} onOpen={open} onExit={() => history.back()} />);

  return shell(
    <div className="flex h-full">
      <nav className="group/nav z-10 flex w-[6.5rem] shrink-0 flex-col items-stretch gap-[0.6rem] bg-gradient-to-r from-black/70 to-transparent px-[0.9rem] py-[2rem] transition-[width] duration-200 focus-within:w-[17rem] focus-within:bg-black/85">
        <div className="mb-[1.4rem] flex items-center gap-[0.9rem] px-[0.4rem]">
          <Logo size={2.8} />
          <span className="hidden whitespace-nowrap text-[1.3rem] font-bold group-focus-within/nav:inline">Jace Media</span>
        </div>
        {NAV.map((n) => {
          const on = screen.name === n.name;
          return (
            <button
              key={n.name}
              type="button"
              data-tv
              data-tv-active={on ? "" : undefined}
              onClick={() => go({ name: n.name })}
              className={`flex items-center gap-[1rem] rounded-[0.9rem] px-[1rem] py-[0.8rem] text-left text-[1.2rem] outline-none transition-colors ${
                on ? "text-accent" : "text-white/60"
              } focus:bg-white focus:text-black`}
            >
              <span className="w-[1.6rem] text-center text-[1.5rem]">{n.name === "you" ? <Face name={me.account!.name} picture={me.account!.picture} size={1.8} /> : n.icon}</span>
              <span className="hidden whitespace-nowrap group-focus-within/nav:inline">{n.label}</span>
            </button>
          );
        })}
      </nav>
      <main data-tv-main className="no-scrollbar flex-1 overflow-y-auto px-[3rem] py-[2rem]">
        {screen.name === "home" && <Home open={open} />}
        {screen.name === "shorts" && <Shorts onExit={() => go({ name: "home" })} />}
        {screen.name === "subs" && <Subs open={open} openChannel={openChannel} />}
        {screen.name === "live" && <Live open={open} />}
        {screen.name === "search" && <Search open={open} />}
        {screen.name === "channel" && <Channel id={screen.id} title={screen.title} open={open} />}
        {screen.name === "you" && (
          <You
            me={me}
            reload={() => void loadMe()}
            onLock={() => {
              sessionStorage.removeItem(UNLOCK_KEY);
              enter(me);
            }}
            onProfiles={() => setGate("profiles")}
          />
        )}
      </main>
    </div>,
  );
}
