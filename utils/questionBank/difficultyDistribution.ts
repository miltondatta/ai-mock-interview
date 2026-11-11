import type { Difficulty } from "./schemas";

export interface DifficultyRatios {
    beginner: number;
    intermediate: number;
    advanced: number;
}

// Default split when the caller doesn't ask for a specific distribution -
// configurable here rather than left to prompt instructions alone, since the
// backend re-validates (and tops up) whatever Gemini actually returns.
export const DEFAULT_DIFFICULTY_RATIOS: DifficultyRatios = {
    beginner: 0.4,
    intermediate: 0.4,
    advanced: 0.2,
};

export interface DifficultyCounts {
    beginner: number;
    intermediate: number;
    advanced: number;
}

// Converts a total question count + ratio split into exact integer counts
// that always sum to `total` (largest-remainder rounding).
export function computeDifficultyCounts(
    total: number,
    ratios: DifficultyRatios = DEFAULT_DIFFICULTY_RATIOS
): DifficultyCounts {
    const entries: [Difficulty, number][] = [
        ["beginner", total * ratios.beginner],
        ["intermediate", total * ratios.intermediate],
        ["advanced", total * ratios.advanced],
    ];
    const floored = entries.map(([key, value]) => [key, Math.floor(value), value - Math.floor(value)] as const);
    let assigned = floored.reduce((sum, [, count]) => sum + count, 0);
    const result: DifficultyCounts = { beginner: 0, intermediate: 0, advanced: 0 };
    for (const [key, count] of floored) result[key] = count;

    // Hand out remaining units to whichever levels had the largest fractional
    // remainder, so small totals (e.g. 3) still land on sensible levels.
    const remainders = [...floored].sort((a, b) => b[2] - a[2]);
    let i = 0;
    while (assigned < total) {
        result[remainders[i % remainders.length][0]] += 1;
        assigned += 1;
        i += 1;
    }
    return result;
}
