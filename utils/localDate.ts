// Shared local-date helpers. Every date in this app is a plain "YYYY-MM-DD"
// string interpreted in the browser's own local timezone - never parsed back
// into a Date via `new Date(isoString)` (UTC-midnight parsing can silently
// shift a day backward for timezones behind UTC). Matches the convention
// already used by app/(routes)/study-planner/schedule/types.ts.

export function todayLocalDateString(): string {
    return toLocalDateString(new Date());
}

export function toLocalDateString(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// Adds `days` (can be negative) to a "YYYY-MM-DD" string, in local time.
export function addLocalDays(dateStr: string, days: number): string {
    const [y, m, d] = dateStr.split("-").map(Number);
    const date = new Date(y, (m ?? 1) - 1, d ?? 1);
    date.setDate(date.getDate() + days);
    return toLocalDateString(date);
}
