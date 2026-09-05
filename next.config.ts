import type { NextConfig } from "next";

const nextConfig: NextConfig = {

  rewrites: async () => {
    // On Vercel (VERCEL=1 is set automatically in that environment) the
    // backend is a same-project Python Function at /api/py/* — see
    // vercel.json and api/py/index.py — so route there with a relative
    // path instead of an external API_URL. Everywhere else (local dev,
    // the Docker demo stack), behavior is unchanged: proxy to API_URL.
    const backend = process.env.VERCEL
      ? "/api/py"
      : process.env.API_URL || "http://localhost:3000";

    return [
      {
        source: "/api/auth/:path*",
        destination: `${backend}/auth/:path*`,
      },
      {
        source: "/api/analytics/:path*",
        destination: `${backend}/:path*`,
      },
      {
        source: "/api/:path*",
        destination: `${backend}/:path*`,
      },
    ];
  },
};

export default nextConfig;