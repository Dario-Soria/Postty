import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // Allow loading the dev server via LAN IP (e.g. http://192.168.x.x:3000).
  // Without this, Next will warn (and in future versions may block) cross-origin
  // requests for dev assets like `/_next/*`.
  // NOTE: Next expects hostnames only (no protocol / port).
  allowedDevOrigins: ["localhost", "127.0.0.1", "192.168.1.13"],
  async redirects() {
    return [
      // Public app entry should stay on root URL.
      { source: "/v3", destination: "/", permanent: false },
      { source: "/v3/:path*", destination: "/", permanent: false },
      // Disable legacy V2 surface.
      { source: "/v2", destination: "/", permanent: false },
      { source: "/v2/:path*", destination: "/", permanent: false },
    ];
  },
  async rewrites() {
    const backend = process.env.POSTTY_API_BASE_URL || "http://localhost:8080";
    return [
      // Serve backend-generated assets through the frontend origin (works on phones).
      { source: "/generated-images/:path*", destination: `${backend}/generated-images/:path*` },
      { source: "/reference-library/:path*", destination: `${backend}/reference-library/:path*` },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '8080',
        pathname: '/generated-images/**',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '8080',
        pathname: '/reference-library/**',
      },
      // If any code still uses an absolute LAN URL for the backend in dev.
      {
        protocol: "http",
        hostname: "192.168.1.13",
        port: "8080",
        pathname: "/generated-images/**",
      },
    ],
    // Allow loading images from localhost in development
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    // This is safe for local development
    unoptimized: process.env.NODE_ENV === 'development',
  },
  // Disable private IP blocking for localhost in development
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:8080", "192.168.1.13:3000"],
    },
  },
};

export default nextConfig;
