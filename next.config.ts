import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "s1.ticketm.net" },
      { protocol: "https", hostname: "**.ticketmaster.com" },
      { protocol: "https", hostname: "**.evbuc.com" },
      { protocol: "https", hostname: "**.eventbrite.com" },
    ],
  },
};

export default nextConfig;
