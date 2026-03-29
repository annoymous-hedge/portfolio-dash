import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // When using `next dev` alone, proxy /api/portfolio to local FastAPI if USE_PYTHON_API=1
  // (run `npm run dev:api` in another terminal). On Vercel, FastAPI is served by the Python runtime.
  async rewrites() {
    if (process.env.USE_PYTHON_API === "1") {
      return [
        {
          source: "/api/portfolio",
          destination: "http://127.0.0.1:8000/api/portfolio",
        },
      ];
    }
    return [];
  },
};

export default nextConfig;
