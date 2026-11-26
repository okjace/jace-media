"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Avatar } from "@/components/Avatar";
import { Notices, useApp, type SidebarSub } from "@/components/AppProvider";
import { MiniPlayer } from "@/components/player/MiniPlayer";
import type { Service } from "@/lib/services";
import { AccountMenu } from "./AccountMenu";
import { Icon, type IconName } from "./icons";
import { Logo } from "./Logo";
import { InstallApp } from "./InstallApp";
import { NotificationBell } from "./NotificationBell";
import { ThemeToggle } from "./ThemeToggle";

type NavItem = { href: string; label: string; icon: IconName; needs?: Service[]; signedIn?: boolean; avatar?: string | null };

const MAIN: NavItem[] = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/shorts", label: "Shorts", icon: "shorts", needs: ["youtube", "jacevideos"] },
  { href: "/subscriptions", label: "Subscriptions", icon: "subs", signedIn: true },
  { href: "/videos", label: "Videos", icon: "videos", needs: ["youtube", "jacevideos"] },
  { href: "/live", label: "Live", icon: "live", needs: ["jacelive", "twitch", "youtube"] },
];

const SOCIAL: NavItem[] = [
  { href: "/jace", label: "Jace", icon: "posts", needs: ["jace"] },
  { href: "/bluesky", label: "Bluesky", icon: "posts", needs: ["bluesky"] },
  { href: "/mastodon", label: "Mastodon", icon: "posts", needs: ["mastodon"] },
  { href: "/lemmy", label: "Lemmy", icon: "posts", needs: ["lemmy"] },
  { href: "/hackernews", label: "Hacker News", icon: "posts", needs: ["hackernews"] },
];

const YOU: NavItem[] = [
  { href: "/library", label: "Library", icon: "library", signedIn: true },
  { href: "/playlists/watch-later", label: "Watch Later", icon: "history", signedIn: true },
  { href: "/playlists", label: "Playlists", icon: "feed", signedIn: true },
  { href: "/import", label: "Import from YouTube", icon: "import", signedIn: true },
  { href: "/extensions", label: "Extensions", icon: "puzzle" },
  { href: "/services", label: "Choose services", icon: "services" },
  { href: "/settings", label: "Edit profile", icon: "settings", signedIn: true },
];

const SIDEBAR_KEY = "jacemedia:sidebar";

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function channelHrefFor(s: Pick<SidebarSub, "kind" | "ref">): string {
  return `/channel/${s.kind}/${encodeURIComponent(s.ref)}`;
}

function SearchBox({ onDone }: { onDone?: () => void }) {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();
  const [q, setQ] = useState(pathname === "/search" ? (params.get("q") ?? "") : "");
  function submit(e: FormEvent) {
    e.preventDefault();
    const query = q.trim();
    if (!query) return;
    router.push(`/search?q=${encodeURIComponent(query)}`);
    onDone?.();
  }
  return (
    <form onSubmit={submit} role="search" className="flex w-full items-center">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search everything"
        aria-label="Search"
        className="h-10 min-w-0 flex-1 rounded-l-full border border-line bg-background px-4 text-sm outline-none placeholder:text-muted focus:border-accent"
      />
      <button type="submit" aria-label="Search" className="flex h-10 w-14 items-center justify-center rounded-r-full border border-l-0 border-line bg-foreground/[.06] text-muted hover:text-foreground">
        <Icon name="search" size={19} />
      </button>
    </form>
  );
}

function NavLink({ item, collapsed, onClick }: { item: NavItem; collapsed: boolean; onClick?: () => void }) {
  const pathname = usePathname();
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      onClick={onClick}
      title={collapsed ? item.label : undefined}
      aria-current={active ? "page" : undefined}
      className={`flex items-center rounded-xl text-sm transition-colors ${
        collapsed ? "mx-1 flex-col gap-1 px-1 py-3 text-[10px]" : "gap-4 px-3 py-2"
      } ${active ? "bg-foreground/[.09] font-semibold text-foreground" : "text-foreground/85 hover:bg-foreground/[.06]"}`}
    >
      {item.avatar !== undefined ? (
        <Avatar name={item.label} src={item.avatar} size={24} />
      ) : (
        <Icon name={item.icon} className={active ? "text-accent" : ""} />
      )}
      <span className={collapsed ? "max-w-full truncate" : "truncate"}>{item.label}</span>
    </Link>
  );
}

function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="border-t border-line py-2 first:border-t-0">
      {title && <p className="px-3 pb-1 pt-1.5 text-xs font-semibold uppercase tracking-wider text-muted">{title}</p>}
      {children}
    </div>
  );
}

/** The subscriptions list: folders first (they open and close), then everyone else. */
function SubscriptionList({ subs, onClick }: { subs: SidebarSub[]; onClick?: () => void }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [all, setAll] = useState(false);
  const folders = useMemo(() => {
    const map = new Map<string, SidebarSub[]>();
    for (const s of subs) if (s.folder) map.set(s.folder, [...(map.get(s.folder) ?? []), s]);
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [subs]);
  const loose = subs.filter((s) => !s.folder);
  const shown = all ? loose : loose.slice(0, 7);
  const row = (s: SidebarSub) => (
    <NavLink
      key={`${s.kind}:${s.ref}`}
      item={{ href: channelHrefFor(s), label: s.name, icon: "user", avatar: s.picture }}
      collapsed={false}
      onClick={onClick}
    />
  );
  return (
    <>
      {folders.map(([name, list]) => (
        <div key={name}>
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => setOpen((o) => ({ ...o, [name]: !o[name] }))}
              aria-expanded={!!open[name]}
              className="flex flex-1 items-center gap-4 rounded-xl px-3 py-2 text-sm hover:bg-foreground/[.06]"
            >
              <Icon name="folder" />
              <span className="flex-1 truncate text-left">{name}</span>
              <Icon name="chevron" size={16} className={`text-muted transition-transform ${open[name] ? "rotate-90" : ""}`} />
            </button>
          </div>
          {open[name] && (
            <div className="ml-4 border-l border-line pl-1">
              <NavLink item={{ href: `/subscriptions?folder=${encodeURIComponent(name)}`, label: `All in ${name}`, icon: "feed" }} collapsed={false} onClick={onClick} />
              {list.map((s) => row(s))}
            </div>
          )}
        </div>
      ))}
      {shown.map((s) => row(s))}
      {loose.length > 7 && (
        <button type="button" onClick={() => setAll((a) => !a)} className="flex w-full items-center gap-4 rounded-xl px-3 py-2 text-sm text-muted hover:bg-foreground/[.06]">
          <Icon name="chevron" className={all ? "-rotate-90" : "rotate-90"} />
          {all ? "Show fewer" : `Show ${loose.length - 7} more`}
        </button>
      )}
      <NavLink item={{ href: "/subscriptions/manage", label: "Manage subscriptions", icon: "settings" }} collapsed={false} onClick={onClick} />
    </>
  );
}

function SidebarContent({ collapsed, onClick }: { collapsed: boolean; onClick?: () => void }) {
  const { current, services, feeds, subs } = useApp();
  const visible = (i: NavItem) => (!i.needs || i.needs.some((n) => services.includes(n))) && (!i.signedIn || current);
  if (collapsed) {
    return (
      <nav aria-label="Main" className="flex flex-col py-1">
        {[...MAIN, { href: "/library", label: "You", icon: "library" as IconName }].filter(visible).map((i) => (
          <NavLink key={i.href} item={i} collapsed onClick={onClick} />
        ))}
      </nav>
    );
  }
  return (
    <nav aria-label="Main" className="flex flex-col px-2 pb-6">
      <Section>{MAIN.filter(visible).map((i) => <NavLink key={i.href} item={i} collapsed={false} onClick={onClick} />)}</Section>
      {SOCIAL.some(visible) && (
        <Section title="Social">{SOCIAL.filter(visible).map((i) => <NavLink key={i.href} item={i} collapsed={false} onClick={onClick} />)}</Section>
      )}
      {current && (
        <Section title="Your feeds">
          {feeds.map((f) => (
            <NavLink key={f.id} item={{ href: `/feeds/${f.id}`, label: f.name, icon: "feed" }} collapsed={false} onClick={onClick} />
          ))}
          <NavLink item={{ href: "/feeds", label: "New feed", icon: "plus" }} collapsed={false} onClick={onClick} />
        </Section>
      )}
      {current && subs.length > 0 && (
        <Section title="Subscriptions">
          <SubscriptionList subs={subs} onClick={onClick} />
        </Section>
      )}
      <Section title="You">
        {YOU.filter(visible).map((i) => (
          <NavLink key={i.href} item={i} collapsed={false} onClick={onClick} />
        ))}
        <InstallApp />
      </Section>
      <p className="px-3 pt-2 text-xs leading-relaxed text-muted">
        No ads, ever. <a href="https://github.com/okjace/jace-media" className="hover:text-foreground">Open source</a> ·{" "}
        <a href="https://jaceo.vercel.app" className="hover:text-foreground">Jace</a>
      </p>
    </nav>
  );
}

/** Header, sidebar (collapsible; a drawer on phones), and a bottom bar on phones. */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { current } = useApp();
  const [wide, setWide] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [mobileSearch, setMobileSearch] = useState(false);
  const fullBleed = pathname.startsWith("/shorts");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWide(localStorage.getItem(SIDEBAR_KEY) !== "narrow");
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDrawer(false);
  }, [pathname]);

  function toggleMenu() {
    if (window.matchMedia("(min-width: 1024px)").matches) {
      setWide((w) => {
        localStorage.setItem(SIDEBAR_KEY, w ? "narrow" : "wide");
        return !w;
      });
    } else setDrawer((d) => !d);
  }

  return (
    <>
      <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-line/60 bg-background/90 px-2 backdrop-blur-md sm:gap-4 sm:px-4">
        <button type="button" onClick={toggleMenu} aria-label="Menu" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-foreground/[.07]">
          <Icon name="menu" />
        </button>
        <Link href="/" className="flex shrink-0 items-center gap-2 text-lg font-semibold tracking-tight" aria-label="Jace Media home">
          <Logo />
          <span className="hidden sm:inline">
            Jace <span className="text-accent">Media</span>
          </span>
        </Link>
        <div className="mx-auto hidden w-full max-w-xl md:flex">
          <SearchBox />
        </div>
        <span className="flex-1 md:hidden" />
        <button type="button" onClick={() => setMobileSearch(true)} aria-label="Search" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-foreground/[.07] md:hidden">
          <Icon name="search" />
        </button>
        <NotificationBell />
        <ThemeToggle />
        <AccountMenu />
        {mobileSearch && (
          <div className="absolute inset-0 flex items-center gap-2 bg-background px-2 md:hidden">
            <button type="button" onClick={() => setMobileSearch(false)} aria-label="Close search" className="flex h-10 w-10 items-center justify-center rounded-full">
              <Icon name="close" />
            </button>
            <SearchBox onDone={() => setMobileSearch(false)} />
          </div>
        )}
      </header>

      <div className="flex flex-1">
        {/* Desktop sidebar */}
        <aside
          className={`no-scrollbar sticky top-14 hidden h-[calc(100dvh-3.5rem)] shrink-0 overflow-y-auto md:block ${wide ? "lg:w-60" : "lg:w-[76px]"} md:w-[76px]`}
          aria-label="Sidebar"
        >
          <div className="hidden lg:block">{wide ? <SidebarContent collapsed={false} /> : <SidebarContent collapsed />}</div>
          <div className="lg:hidden">
            <SidebarContent collapsed />
          </div>
        </aside>

        {/* Phone/tablet drawer */}
        {drawer && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-label="Menu">
            <button type="button" aria-label="Close menu" onClick={() => setDrawer(false)} className="absolute inset-0 bg-black/50" />
            <div className="no-scrollbar absolute inset-y-0 left-0 w-72 overflow-y-auto bg-background shadow-2xl">
              <div className="flex h-14 items-center gap-2 px-2">
                <button type="button" onClick={() => setDrawer(false)} aria-label="Close menu" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-foreground/[.07]">
                  <Icon name="menu" />
                </button>
                <Logo />
                <span className="font-semibold">
                  Jace <span className="text-accent">Media</span>
                </span>
              </div>
              <SidebarContent collapsed={false} onClick={() => setDrawer(false)} />
            </div>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <Notices />
          <main className={`mx-auto w-full flex-1 pb-24 md:pb-10 ${fullBleed ? "px-2 pt-3" : "max-w-[1500px] px-4 pt-5 sm:px-6"}`}>{children}</main>
        </div>
      </div>

      <MiniPlayer />

      {/* Phone bottom bar */}
      <nav aria-label="Bottom" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-line bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {[
          { href: "/", label: "Home", icon: "home" as IconName },
          { href: "/shorts", label: "Shorts", icon: "shorts" as IconName },
          { href: current ? "/subscriptions" : "/videos", label: current ? "Subscriptions" : "Videos", icon: (current ? "subs" : "videos") as IconName },
          { href: current ? "/library" : "/extensions", label: current ? "You" : "Extensions", icon: (current ? "library" : "puzzle") as IconName },
        ].map((i) => {
          const active = isActive(pathname, i.href);
          return (
            <Link key={i.href} href={i.href} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${active ? "text-foreground" : "text-muted"}`}>
              <Icon name={i.icon} className={active ? "text-accent" : ""} />
              {i.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
