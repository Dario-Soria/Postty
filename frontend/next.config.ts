import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
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
      allowedOrigins: ['localhost:8080'],
    },
  },
};

export default nextConfig;
