import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Jace Media",
    short_name: "Jace Media",
    description: "Posts and videos from everywhere, in one place, with no ads.",
    start_url: "/",
    display: "standalone",
    background_color: "#111317",
    theme_color: "#111317",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
