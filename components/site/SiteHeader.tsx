"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApp } from "@/components/AppProvider";
import { AccountMenu } from "./AccountMenu";
import { Logo } from "./Logo";
import { TABS } from "./Tabs";
import { ThemeToggle } from "./ThemeToggle";

export function SiteHeader() {
  const pathname = usePathname();
  const { current, services, feeds } = useApp();
  const isWatch = pathname.startsWith("/watch/");
  const tabs = [
    ...TABS.filter((t) => (!t.needs || t.needs.some((n) => services.includes(n))) && (!t.signedIn || current)),
    ...feeds.map((f) => ({ href: `/feeds/${f.id}`, label: f.name })),
  ];
  const chip = (active: boolean) =>
    `shrink-0 rounded-full px-3.5 py-1.5 transition-colors ${active ? "bg-accent font-medium text-on-accent" : "bg-foreground/[.06] text-foreground hover:bg-foreground/[.1]"}`;

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex min-h-16 w-full max-w-6xl items-center gap-3 px-4 py-2.5 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2 text-lg font-semibold tracking-tight" aria-label="Jace Media home">
          <Logo />
          <span>
            Jace <span className="text-accent">Media</span>
          </span>
        </Link>
        <span className="flex-1" />
        <ThemeToggle />
        <AccountMenu />
      </div>
      <nav aria-label="Tabs" className="no-scrollbar mx-auto flex w-full max-w-6xl gap-1 overflow-x-auto px-4 pb-2 text-sm sm:px-6">
        {tabs.map((tab) => {
          const active =
            tab.href === "/" ? pathname === "/" : pathname === tab.href || pathname.startsWith(`${tab.href}/`) || (tab.href === "/videos" && isWatch);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={chip(active)}
            >
              {tab.label}
            </Link>
          );
        })}
        <Link href={current ? "/feeds" : "/services"} title={current ? "Make a feed" : "Choose services"} className={chip(pathname === "/feeds")}>
          {current ? "+ Feed" : "Choose services"}
        </Link>
      </nav>
    </header>
  );
}
