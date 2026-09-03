import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The generate route reads reference/ off the filesystem. Vercel only ships
  // files its tracer can see, and a readdir at runtime is invisible to it, so
  // the folder has to be named explicitly or the deployed function finds an
  // empty directory. /api/health reports the count it can actually see.
  outputFileTracingIncludes: {
    "/api/generate": ["./reference/**/*"],
    "/api/health": ["./reference/**/*"],
  },
};

export default nextConfig;
