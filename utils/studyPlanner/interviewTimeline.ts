import { addLocalDays } from "@/utils/localDate";

// Maps Profile Setup's interview-timeline/weekly-availability answers to
// concrete scheduling inputs. One source of truth, shared by:
//   - CreateStudyPlanAITab.tsx (pre-filling the "Create Study Plan" form)
//   - convex/StudyPlanner.ts's RedistributeSchedule (the actual day-by-day
//     distribution engine)
// "2 to 4 weeks" / "1 to 3 months" target their midpoint (3 weeks / 2 months)
// per product decision - a balanced default between urgent and relaxed.

export type InterviewTimeline = "have_date" | "within_week" | "2_4_weeks" | "1_3_months" | "no_date";
export type WeeklyAvailability = "about_2_hours" | "about_5_hours" | "10_plus_hours";

// "no_date" has no real deadline - this is only an internal pacing estimate
// used to bound the AI generator's required date range. It is never written
// to the profile or shown to the candidate as "your interview date".
const FLEXIBLE_PACING_WINDOW_DAYS = 84; // ~12 weeks

// Returns the effective scheduling deadline for a timeline, or null when
// there genuinely isn't one ("no_date") and the caller should treat the plan
// as open-ended rather than invent a date.
export function effectiveDeadline(
    timeline: string | null | undefined,
    interviewDate: string | null | undefined,
    today: string
): string | null {
    switch (timeline) {
        case "have_date":
            return interviewDate || null;
        case "within_week":
            return addLocalDays(today, 7);
        case "2_4_weeks":
            return addLocalDays(today, 21);
        case "1_3_months":
            return addLocalDays(today, 60);
        default:
            return null;
    }
}

// Same as effectiveDeadline, but always returns a date - falling back to the
// flexible pacing window when there's no real deadline (timeline missing,
// "no_date", or "have_date" without a stored date yet). Only for feeding the
// existing AI generator's required targetEndDate field.
export function deadlineOrPacingEstimate(
    timeline: string | null | undefined,
    interviewDate: string | null | undefined,
    today: string
): string {
    return effectiveDeadline(timeline, interviewDate, today) ?? addLocalDays(today, FLEXIBLE_PACING_WINDOW_DAYS);
}

export interface AvailabilityCaps {
    weeklyCapMinutes: number;
    dailyCapMinutes: number;
    // Sensible defaults for the one-shot AI-generation form, which only takes
    // a single hours/day number and a day-of-week list.
    defaultDayCount: number;
    defaultHoursPerDay: number;
}

const AVAILABILITY_CAPS: Record<WeeklyAvailability, AvailabilityCaps> = {
    about_2_hours: { weeklyCapMinutes: 120, dailyCapMinutes: 60, defaultDayCount: 2, defaultHoursPerDay: 1 },
    about_5_hours: { weeklyCapMinutes: 300, dailyCapMinutes: 120, defaultDayCount: 3, defaultHoursPerDay: 2 },
    "10_plus_hours": { weeklyCapMinutes: 600, dailyCapMinutes: 180, defaultDayCount: 4, defaultHoursPerDay: 3 },
};

const DEFAULT_CAPS: AvailabilityCaps = { weeklyCapMinutes: 300, dailyCapMinutes: 120, defaultDayCount: 3, defaultHoursPerDay: 1.5 };

export function availabilityCapsFor(weeklyAvailability: string | null | undefined): AvailabilityCaps {
    return (weeklyAvailability && AVAILABILITY_CAPS[weeklyAvailability as WeeklyAvailability]) || DEFAULT_CAPS;
}

const WEEK_DAY_ORDER = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Picks `count` preferred study days spread across the week (not bunched at
// the start), e.g. 3 days -> Mon/Wed/Fri. Used only as a one-shot default;
// the candidate can change it freely in the Create Study Plan form.
export function defaultStudyDays(count: number): string[] {
    const pool = ["Mon", "Wed", "Fri", "Tue", "Thu", "Sat", "Sun"];
    return pool.slice(0, Math.max(1, Math.min(count, 7))).sort((a, b) => WEEK_DAY_ORDER.indexOf(a) - WEEK_DAY_ORDER.indexOf(b));
}
