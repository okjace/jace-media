import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Jace Media",
    short_name: "Jace Media",
    description: "Posts and videos from everywhere, in one place, with no ads.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#111317",
    theme_color: "#111317",
    categories: ["social", "entertainment", "news"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    shortcuts: [
      { name: "Shorts", url: "/shorts", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Subscriptions", url: "/subscriptions", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Search", url: "/search", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
