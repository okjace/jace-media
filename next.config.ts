import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Thumbnails and avatars come from YouTube, Jace's storage, and anywhere a
    // Jace avatar lives, so they're plain <img> tags rather than next/image.
    unoptimized: true,
  },
  // TVs: straight to the lightweight TV app (old TV browsers can't run the site's styles).
  async redirects() {
    return [{ source: "/tv", destination: "/tv-app/index.html", permanent: false }];
  },
};

export default nextConfig;
