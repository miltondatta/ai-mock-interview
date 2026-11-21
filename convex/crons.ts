import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

// Personalized Job Discovery's daily automated matching cycle (D4). This is
// the first (and, as of D4, the only) entry in this file - there was no
// existing convex/crons.ts anywhere in this repository before this
// milestone (verified by inspection before writing this file), so this
// cannot be modifying or replacing any existing cron job.
//
// Schedule: 01:00 UTC daily = 07:00 Asia/Dhaka (UTC+6, no daylight saving,
// so this offset is constant year-round). Chosen to run an hour after the
// n8n "AI Mock Interview - External Job Synchronization" workflow's 00:00
// UTC branch (see n8n/ai-mock-interview-external-job-synchronization.json),
// giving the Himalayas/Jobicy sync, dedupe-key backfill, and
// removed-upstream sweep time to settle before this cycle reads the central
// `jobs` table - exactly the reasoning already recorded in
// PERSONALIZED_JOB_DISCOVERY_TECHNICAL_DESIGN.md section 5. This cron makes
// no external HTTP call of any kind; it only reads the already-synchronized
// `jobs` table and each candidate's own UserProfileTable row.
const crons = cronJobs();

crons.daily(
  "daily candidate job matching",
  { hourUTC: 1, minuteUTC: 0 },
  internal.jobDiscovery.runDailyMatchingCycle
);

export default crons;
