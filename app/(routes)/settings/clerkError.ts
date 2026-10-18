// Clerk API errors carry a human-readable reason in errors[0].longMessage
// (e.g. "Password has been found in an online data breach") - surface that
// instead of a generic failure message whenever it's there.
export function getClerkErrorMessage(error: unknown, fallback: string): string {
  const clerkErrors = (error as { errors?: { longMessage?: string; message?: string }[] })?.errors
  const first = Array.isArray(clerkErrors) ? clerkErrors[0] : undefined
  return first?.longMessage || first?.message || fallback
}
