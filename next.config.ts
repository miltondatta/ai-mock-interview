import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Arcjet's WASM analyzer breaks when Next bundles it into the server build;
  // keep it as a native require instead.
  // serverExternalPackages: [
  //   "@arcjet/next",
  //   "@arcjet/analyze",
  //   "@arcjet/analyze-wasm",
  //   "@arcjet/inspect",
  // ],
};

export default nextConfig;
