import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Thumbnails and avatars come from YouTube, Jace's storage, and anywhere a
    // Jace avatar lives, so they're plain <img> tags rather than next/image.
    unoptimized: true,
  },
};

export default nextConfig;
