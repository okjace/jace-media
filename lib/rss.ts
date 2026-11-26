import "server-only";
import { q } from "./db";
import { getViewer } from "./auth";
import { decodeEntities, htmlToText, isAd } from "./social";
import type { FeedItem, Media } from "./types";

/**
 * RSS and Atom feeds: follow any website, blog, or news site. Paste a feed
 * address or just the site's address (its feed is found from the page).
 */

export type RssFeed = { url: string; title: string; site: string; items: FeedItem[] };

export const SUGGESTED_FEEDS = [
  { name: "BBC News", url: "https://feeds.bbci.co.uk/news/rss.xml" },
  { name: "NPR News", url: "https://www.npr.org/rss/rss.php?id=1001" },
  { name: "The Verge", url: "https://www.theverge.com/rss/index.xml" },
  { name: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index" },
  { name: "NASA", url: "https://www.nasa.gov/news-release/feed/" },
];

/** Only public https sites: never this server, its network, or other private addresses. */
export function safeFeedUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw.trim().startsWith("http") ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password || url.toString().length > 500) return null;
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") ||
    host.endsWith(".local") ||
    /^\[?[0-9a-f:]+\]?$/i.test(host) && host.includes(":") ||
    /^(127|10|0)\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    !host.includes(".")
  ) {
    return null;
  }
  return url;
}

async function get(url: URL): Promise<{ text: string; type: string; finalUrl: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "JaceMedia/0.1 (+https://github.com/okjace/jace-media)", Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8" },
      redirect: "follow",
      next: { revalidate: 900 },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    // Redirects must stay on public sites too.
    if (!safeFeedUrl(res.url || url.toString())) return null;
    const text = (await res.text()).slice(0, 3_000_000);
    return { text, type: res.headers.get("content-type") ?? "", finalUrl: res.url || url.toString() };
  } catch {
    return null;
  }
}

const tag = (xml: string, name: string): string | null => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  if (!m) return null;
  return decodeEntities(m[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1").trim());
};
const attr = (xml: string, name: string, attrName: string): string | null => {
  const m = xml.match(new RegExp(`<${name}\\b[^>]*\\b${attrName}=["']([^"']+)["']`, "i"));
  return m ? decodeEntities(m[1]) : null;
};

function images(block: string, html: string): Media[] {
  const url =
    attr(block, "media:thumbnail", "url") ??
    attr(block, "media:content", "url") ??
    (/<enclosure[^>]+type=["']image/i.test(block) ? attr(block, "enclosure", "url") : null) ??
    html.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] ??
    null;
  return url && /^https:\/\//.test(url) ? [{ kind: "image", url: decodeEntities(url) }] : [];
}

function parse(xml: string, feedUrl: string): RssFeed | null {
  const isAtom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
  const head = xml.split(isAtom ? /<entry[\s>]/i : /<item[\s>]/i)[0];
  const title = htmlToText(tag(head, "title") ?? "") || new URL(feedUrl).hostname;
  const site = (isAtom ? attr(head.replace(/<link[^>]+rel=["']self["'][^>]*>/gi, ""), "link", "href") : tag(head, "link")) ?? new URL(feedUrl).origin;
  const host = (() => {
    try {
      return new URL(site).hostname.replace(/^www\./, "");
    } catch {
      return new URL(feedUrl).hostname.replace(/^www\./, "");
    }
  })();
  const blocks = xml.split(isAtom ? /<entry[\s>]/i : /<item[\s>]/i).slice(1, 41);
  if (!blocks.length && !/<(rss|feed|rdf)/i.test(xml)) return null;
  const items: FeedItem[] = [];
  for (const b of blocks) {
    const link =
      (isAtom ? (attr(b.replace(/<link[^>]+rel=["'](?!alternate)[^"']*["'][^>]*>/gi, ""), "link", "href") ?? attr(b, "link", "href")) : tag(b, "link")) ?? tag(b, "guid") ?? "";
    if (!/^https?:\/\//.test(link)) continue;
    const html = tag(b, "content:encoded") ?? tag(b, "content") ?? tag(b, "description") ?? tag(b, "summary") ?? "";
    const text = htmlToText(html).replace(/\s+\n/g, "\n").slice(0, 400);
    const itemTitle = htmlToText(tag(b, "title") ?? "");
    if (isAd(`${itemTitle} ${text}`)) continue;
    const when = tag(b, "pubDate") ?? tag(b, "published") ?? tag(b, "updated") ?? tag(b, "dc:date");
    const created = when && !Number.isNaN(Date.parse(when)) ? new Date(when).toISOString() : new Date().toISOString();
    items.push({
      network: "rss",
      id: link,
      author: { name: title, handle: host, picture: `https://${new URL(link).hostname}/favicon.ico`, url: `/channel/rss/${encodeURIComponent(feedUrl)}` },
      title: itemTitle || "Untitled",
      text: text === itemTitle ? "" : text,
      url: link,
      link,
      media: images(b, html),
      createdAt: created,
      stats: {},
      place: host,
    });
  }
  return { url: feedUrl, title, site, items };
}

/** Reads a feed. Given a web page instead, finds the page's feed and reads that. */
export async function fetchFeed(raw: string): Promise<RssFeed | null> {
  const url = safeFeedUrl(raw);
  if (!url) return null;
  const page = await get(url);
  if (!page) return null;
  if (/<(rss|feed|rdf:RDF)[\s>]/i.test(page.text.slice(0, 2000))) return parse(page.text, page.finalUrl);
  // An HTML page: look for <link rel="alternate" type="application/rss+xml" href="…">.
  const link = page.text.match(/<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]*>/i)?.[0];
  const href = link?.match(/href=["']([^"']+)["']/i)?.[1];
  if (!href) {
    // No feed link on the page: try the addresses most sites use.
    for (const path of ["/feed/", "/rss", "/rss.xml", "/feed.xml", "/atom.xml", "/index.xml"]) {
      const guess = safeFeedUrl(new URL(path, page.finalUrl).toString());
      const found = guess ? await get(guess) : null;
      if (found && /<(rss|feed|rdf:RDF)[\s>]/i.test(found.text.slice(0, 2000))) return parse(found.text, found.finalUrl);
    }
    return null;
  }
  const feedUrl = safeFeedUrl(new URL(decodeEntities(href), page.finalUrl).toString());
  if (!feedUrl) return null;
  const feed = await get(feedUrl);
  return feed ? parse(feed.text, feed.finalUrl) : null;
}

/** Newest articles from the feeds you follow. */
export async function followedRss(perFeed = 6): Promise<FeedItem[]> {
  const viewer = await getViewer();
  if (!viewer) return [];
  const rows = await q(`SELECT ref FROM subscriptions WHERE sub = $1 AND kind = 'rss' ORDER BY created_at DESC LIMIT 25`, [viewer.sub]).catch(() => []);
  const feeds = await Promise.all(rows.map((r) => fetchFeed(r.ref as string)));
  return feeds.flatMap((f) => f?.items.slice(0, perFeed) ?? []);
}
