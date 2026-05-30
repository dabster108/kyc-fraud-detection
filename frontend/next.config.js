// next.config.js
const backendUrl =
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "http://localhost:3002";

const nextConfig = {
  turbopack: {
    root: __dirname,
  },
  // Document step runs OCR + forgery + face extract + Cloudinary (>30s default proxy limit)
  experimental: {
    proxyTimeout: 180_000,
  },
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${backendUrl}/api/v1/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
