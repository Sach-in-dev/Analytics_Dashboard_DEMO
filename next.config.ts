import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // DEMO BUILD — no real backend is running, so every /api/* call must be
  // answered locally (either by an actual route.ts, or by the client-side
  // mock interceptor in src/lib/mock-interceptor.ts). Proxying to an
  // external API_URL here made every request hang until that dead
  // connection timed out before mock data could ever show up.
};

export default nextConfig;