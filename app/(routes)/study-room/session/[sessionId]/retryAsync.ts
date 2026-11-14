// Shared retry-with-backoff wrapper used by every M4 workspace auto-save
// path (Whiteboard/Code/Notes) to "handle network interruptions and
// reconnection" - a save that fails (offline, a dropped Convex mutation)
// is retried a few times with increasing delay before surfacing a
// save-error indicator, instead of silently losing the edit on the first
// hiccup.
export async function retryAsync<T>(fn: () => Promise<T>, attempts = 3, baseDelayMs = 1000): Promise<T> {
  let lastError: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (e) {
      lastError = e
      if (i < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, baseDelayMs * Math.pow(2, i)))
      }
    }
  }
  throw lastError
}
