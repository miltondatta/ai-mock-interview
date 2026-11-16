// Runs once when a Next.js server instance starts (see
// node_modules/next/dist/docs/01-app/02-guides/instrumentation.md).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NODE_ENV === "development") {
    await import("./instrumentation-node")
  }
}
