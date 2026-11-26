import type { Service } from "@/lib/services";

/** The built-in tabs. A tab shows when any of its services is turned on (none listed: always). */
export const TABS: { href: string; label: string; needs?: Service[]; signedIn?: boolean }[] = [
  { href: "/", label: "For you" },
  { href: "/subscriptions", label: "Subscriptions", signedIn: true },
  { href: "/videos", label: "Videos", needs: ["youtube", "jacevideos"] },
  { href: "/shorts", label: "Shorts", needs: ["youtube", "jacevideos"] },
  { href: "/jace", label: "Jace", needs: ["jace"] },
  { href: "/bluesky", label: "Bluesky", needs: ["bluesky"] },
  { href: "/mastodon", label: "Mastodon", needs: ["mastodon"] },
  { href: "/lemmy", label: "Lemmy", needs: ["lemmy"] },
  { href: "/hackernews", label: "Hacker News", needs: ["hackernews"] },
];
