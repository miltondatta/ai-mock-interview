// "Maybe Later" (dashboard) and "Skip for Now" (/welcome) dismissal for the
// profile set-up invitation. Scoped to the current Clerk sign-in rather than
// the account: a new session - signing out and back in, or the session
// timing out and signing back in - always gets a different session id, so
// the invitation shows again if the profile is still incomplete. Kept in
// sessionStorage only, so it never reaches Convex, other devices, or
// outlives the browser tab.

function storageKey(sessionId: string): string {
    return `profileSetupPromptDismissed:${sessionId}`;
}

export function isProfileSetupPromptDismissed(sessionId: string | null | undefined): boolean {
    if (!sessionId) return false;
    try {
        return sessionStorage.getItem(storageKey(sessionId)) === "1";
    } catch {
        return false;
    }
}

export function dismissProfileSetupPrompt(sessionId: string | null | undefined): void {
    if (!sessionId) return;
    try {
        sessionStorage.setItem(storageKey(sessionId), "1");
    } catch {
        // Storage can be unavailable (private browsing) - the dismissal just
        // won't stick past this interaction, which is a reasonable fallback.
    }
}
