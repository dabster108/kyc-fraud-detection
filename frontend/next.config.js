// next.config.js
const nextConfig = {
  turbopack: {
    root: __dirname,
  },
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: "http://localhost:3002/api/v1/:path*",
      },
    ];
  },
};

module.exports = nextConfig;