# Dashboard Redesign — Implementation Progress

Tracks implementation of the redesigned Dashboard (MagicPath reference:
https://designs.magicpath.ai/v1/smart-winter-3399), one part at a time per
the Claude Code prompts. Each part only touches the scope it was asked for.

## Part 1 — Welcome Header + Career Progress Overview (DONE)

### Files created
- `app/(routes)/dashboard/ProgressOverview.tsx` — the 4 KPI cards.

### Files modified
- `app/(routes)/dashboard/page.tsx` — welcome header copy/layout, added
  "Explore Jobs" secondary action, mounted `ProgressOverview`.

### Data sources per metric
| Card | Metric | Source | Notes |
|---|---|---|---|
| Completed Interviews | `interviewList.filter(status === 'completed').length` | `api.Interview.GetUserInterviews` (existing, reused) | "+N this week" sub-label computed from each interview's real `_creationTime` (last 7 days); omitted when 0, never fabricated. |
| Study Plan Progress | `overallProgress` (0–100%) | `api.StudyPlanner.GetDashboardStats` (existing, reused) | Shows "No study plans yet" instead of a progress bar when `totalPlans === 0`. |
| Resume Readiness | `profileCompletionPercent` | `api.ProfessionalProfile.GetOnboardingStatus` (existing, reused) | **Documented data gap**: there is no resume-specific completeness score in the schema. This reuses professional-profile completeness (`computeProfileCompletion` in `convex/profileMatchingShared.ts`) — the same number `ProfileSetupPrompt` and job matching already use — as the closest real signal. `api.Resumes.GetUserResumes` (existing, reused) is additionally checked only to show "Upload a resume to get started" when the candidate has zero resumes on file. Card links to `/manage-resume` per spec, even though the underlying percentage is profile-based, not resume-based. |
| New Job Matches | count of actual matches | `api.jobDiscovery.GetCandidateMatches` (existing, reused), falling back to `api.Jobs.GetJobsForUser` (existing, reused) exactly like `JobsForYou.tsx` already does when there are no persisted matches yet | Queried with `limit: 300` (the same server-side cap both queries already enforce) so the count isn't truncated by a small display limit. Shows "Last updated" (via existing `formatLastRefreshed`) only when persisted matches exist, matching `JobsForYou`'s own convention. Shows "No matches yet" when the count is 0 — currently always true in production per the prior finding that job sync has never run (0 jobs synced, `JOB_SYNC_SHARED_SECRET` unset). This is displayed honestly, not hidden or faked. |

No new Convex queries or mutations were written. No schema changes.

### Welcome header
- Date: real `Date()`, formatted client-side.
- Greeting: Clerk's `user.firstName` (first name only, not full name as before) — falls back to no name suffix if Clerk hasn't loaded it yet.
- "Start Mock Interview" → `/create-interview` (existing creation workflow, unchanged).
- "Explore Jobs" → `/jobs` (existing Jobs page, unchanged).

### Outstanding issues / missing data
- **Resume Readiness has no dedicated resume-completeness metric.** If a true per-resume score is wanted later (e.g. based on parsed resume content/sections rather than profile fields), that needs a new backend computation — out of scope for this part, which only reuses existing queries.
- Job Matches will read as 0 for every candidate until job sync is actually running (separate, already-known issue, not something this part can or should fix).

## Part 2 — Continue Your Journey + Career Toolkit (DONE)

### Files created
- `app/(routes)/dashboard/ContinueJourney.tsx`
- `app/(routes)/dashboard/CareerToolkit.tsx`

### Files modified
- `app/(routes)/dashboard/page.tsx` — mounted both sections between
  `ProfileSetupPrompt` and `JobsForYou`. Part 1's header/KPI code is
  untouched other than this insertion.

### How "unfinished activity" is identified
`ContinueJourney` reuses four existing queries (`api.Interview.GetUserInterviews`,
`api.StudyRoom.GetRecentSessions`, `api.StudyPlanner.GetUserStudyPlans`,
`api.ProfessionalProfile.GetOnboardingStatus`) and picks exactly one
recommendation with a fixed priority order, based only on real stored
status fields — nothing is fabricated, no session/progress is created:

1. An interview with `status === "in_progress"` (the candidate's
   `InterviewSessionTable` row already moved to `in_progress` the moment
   its ElevenLabs conversation connected — see `Interview.SaveElevenLabsConversation`).
   Most recent one → "Resume Interview" → `/interview/{id}/start`.
2. Else an interview with `status === "draft"` (questions generated, never
   started) → "Resume Interview" → `/interview/{id}/start`.
3. Else a Study Room session with `status === "in_progress"` (from
   `GetRecentSessions`) → "Enter Study Room" → `/study-room/session/{sessionId}`.
4. Else a Study Plan with `status === "active"` that has a `nextTask`
   (from `GetUserStudyPlans`'s existing `buildPlanSummary`) → "Continue
   Learning" → `/study-planner/{planId}`, showing the plan's real
   `progress`/`completedTasks`/`totalTasks`.
5. Else an incomplete professional profile (`!isProfileComplete`) →
   "Complete Profile" → `/profile/edit`, showing the real
   `profileCompletionPercent`.
6. Else a getting-started fallback: "Take your first mock interview" if
   the candidate has zero interviews ever, otherwise "Ready for another
   round?" — both → `/create-interview`.

Each step only fires once every query has resolved (no flash of a wrong
recommendation while loading). No new recommendation engine was written —
this is plain priority branching over existing query results.

**Honesty note on interview progress:** `InterviewSessionTable` has no
per-question answered-count field, so the draft/in-progress interview card
never claims something like "3 of 5 questions answered" — it only shows
the question count that was generated (`qno`), which is real data.

### Career Toolkit navigation routes (all pre-existing, none invented)
| Card | Route |
|---|---|
| Mock Interview | `/mock-interview` |
| Study Planner | `/study-planner` |
| Resume Match Analyzer | `/resume-match-analyzer` |
| Jobs | `/jobs` |
| Resume Management | `/manage-resume` |
| Practice Coach | `/practice-coach` |
| AI Study Room | `/study-room` |
| Questions Bank | `/question-bank` |

Each card is a plain `<Link>` to its module's existing page — none of the
eight modules' functionality is duplicated inside the card.

### Missing data / route dependencies
- "Resume analysis that needs completion" (listed as a possible journey
  activity in the prompt) is **not implemented** — `ResumeMatch.ts` has no
  concept of a draft/incomplete analysis; `SaveResumeMatchAnalysis` only
  ever saves a finished one. Nothing was invented to simulate this.
- Study Plan selection uses the newest *created* active plan with a
  pending task, not "most recently worked on" — there's no
  last-accessed timestamp on `studyPlans` to rank by instead.

### Outstanding issues
None blocking. Part 1's KPI cards and this part's recommendation both read
`api.Interview.GetUserInterviews` and `api.ProfessionalProfile.GetOnboardingStatus`
independently (each component owns its own `useQuery` call, matching this
codebase's existing convention, e.g. `JobsForYou`/`jobs/page.tsx` both
calling `GetCandidateMatches` independently) - Convex's client subscribes
once per identical query+args, so this isn't extra network traffic.

## Part 3 — Personalized Jobs for You (DONE)

### Finding
The Dashboard's "Jobs for You" section already existed before this
redesign effort (`app/(routes)/dashboard/JobsForYou.tsx`, from an earlier
milestone, M7/D5) and already satisfied almost everything this part asked
for: persisted-matches-first with live fallback, `JobCard` reuse (logo/
initials, title, company, location, salary, match %, closing-date badge,
direct Apply link), a 3-item cap, freshness label, and empty states. Per
"reuse existing data queries and components... do not create a separate
job matching implementation," this part edits that existing file in place
rather than building a new one.

### Files modified
- `app/(routes)/dashboard/JobsForYou.tsx` (only file touched this part)

### Data query used / recommendation selection logic (unchanged, confirmed by inspection)
- `api.jobDiscovery.GetCandidateMatches({ userId, limit: 3, matchesOnly: true })`
  — the candidate's persisted `candidateJobMatches` rows, each re-validated
  live against its `jobs` record (`isJobEligible`) so an expired or
  deactivated job never shows even if a stale match row still exists.
- Falls back to `api.Jobs.GetJobsForUser({ userId, limit: 3, matchesOnly: true })`
  only when `!hasPersistedMatches` (no persisted recommendations yet) —
  the exact same fallback condition `/jobs` page itself uses.
- Both queries already de-duplicate at the source (one row per job).

### Job fields displayed (via reused `JobCard` component, `compact` mode)
Company logo (`job.companyLogo`) with initials fallback, job title,
company name, location (`formatJobLocation`), salary (`formatSalary`,
omitted when the job posted none), match percentage (`match.score`, green
when ≥70%, otherwise the existing orange/primary tone — this threshold
styling lives in `JobCard` itself and was left untouched since `JobCard`
is shared with the main `/jobs` page), closing-date badge
(`formatDeadline`, omitted when the job set no deadline), and an Apply
button.

### Apply navigation behavior (unchanged)
`JobCard`'s Apply button is a plain `<a href={job.applyUrl} target="_blank">`
— it already opens the original application URL directly, with no
intermediate details page to preserve. Nothing here was changed.

### Freshness
`formatLastRefreshed(candidateData.lastRefreshedAt)` — the real, oldest
`generatedAt` among the candidate's current persisted matches. Only shown
when persisted matches exist (same as before), never fabricated.

### Empty / loading states
- **Loading / being generated** (new this part): previously the section
  returned `null` while `candidateData`/the live fallback were still
  resolving, so it simply didn't render during that window. It now shows
  the "Jobs for You" header, a "Finding your best matches…" line, and 3
  skeleton rows instead.
- **No active jobs at all**: unchanged — "No job openings have been
  posted yet. Check back soon."
- **Active jobs exist but none matched**: unchanged — "No strong matches
  right now" + links to complete the profile or browse all jobs.
- Minor copy-only changes for literal spec wording: "See all" → "View All
  Jobs"; "Jobs for you"/"Latest jobs" → "Jobs for You"/"Latest Jobs".

### Outstanding issues
- Per the J9 finding already on record, `jobs` sync has never actually
  run in production (`JOB_SYNC_SHARED_SECRET` unset), so in practice this
  section will show its "no job openings" empty state for every candidate
  until that's fixed — pre-existing, out of this part's scope.

## Part 4 — Learning Activity, Interview Activity, Recent Activity (DONE)

### Files created
- `app/(routes)/dashboard/ActivitySections.tsx` — Learning Activity +
  Interview Activity, side by side.
- `app/(routes)/dashboard/RecentActivity.tsx` — the merged recent-activity
  feed.

### Files modified
- `convex/StudyPlanner.ts` — added one new **read-only** query,
  `GetRecentCompletedTasks` (returns a user's completed `studyPlanTasks`
  rows, newest-`completedAt`-first, with the parent plan's title joined
  in). No existing query, mutation, schema field, or business logic was
  changed; this was necessary because no existing query exposes
  "recently completed tasks across every plan" (`GetUserStudyPlans` only
  ever returns each plan's single *next pending* task, not completed
  ones) and the application has no dedicated activity-tracking table.
  This is the only backend change across Parts 1–4.
- `app/(routes)/dashboard/page.tsx` — mounted both new sections after
  `JobsForYou`, before `ResumeMatchHistory`. Parts 1–3 are untouched
  other than this insertion.

### Learning Activity
- Source: `api.StudyPlanner.GetUserStudyPlans` (already reused in Part 2).
  Selects the first plan with `status === "active"` **and** a `nextTask`
  — the same rule Part 2's "Continue Your Journey" uses, so the two
  sections never disagree about which plan is "the" active one. A
  `completed`/`paused`/`archived` plan is never shown here, by
  construction (the `status === "active"` filter).
- Shows: plan title, `learningGoal` (only when set) as the topic line,
  real `progress`/`completedTasks`/`totalTasks`, and the real `nextTask.title`
  as "Next:".
- "Continue Learning" → `/study-planner/tasks/{nextTask.id}` (the actual
  next task's own detail page — more precise than the plan overview page
  Part 2 linked to, and still an existing route,
  `app/(routes)/study-planner/tasks/[taskId]/page.tsx`).
- Empty state (no qualifying active plan): "No active study plan right
  now." + "Open Study Planner" → `/study-planner`.

### Interview Activity
- Source: `api.Interview.GetUserInterviews` (already reused in Parts 1–2).
  Selects the first (newest) interview with `status === "completed"`.
- Shows: job title (or "Resume-based Interview"), date, a "Completed"
  badge, and a rating/score when one can be read out of the interview's
  stored `feedback`.
- **Score extraction**: `InterviewSessionTable.feedback` is `v.any()` and
  its parsing logic lives only as unexported local functions inside
  `app/(routes)/interview/[interviewId]/feedback/page.tsx`. Rather than
  duplicate or export that whole parser, `ActivitySections.tsx` has a
  small local `extractInterviewRating()` that only pulls a `rating`
  field (top-level or nested under `feedback`) and returns `null` if
  nothing recognizable is there — it never guesses a score, and it does
  not change interview evaluation logic anywhere.
- **Date caveat (documented limitation)**: `InterviewSessionTable` has no
  completion timestamp — `CompleteInterview` only patches `status`, never
  a date field. The date shown is `_creationTime` (when the interview was
  created), not when it was completed. This is the best real data
  available; it is not fabricated, but it is a known imprecision.
- "View Results" → `/interview/{id}/feedback` (existing route, same one
  `InterviewCard`'s "Feedback" button already uses).
- Empty state (no completed interviews): "No completed interviews yet." +
  "Start Mock Interview" → `/create-interview`.

### Recent Activity
No unified activity-feed table exists, and Part 4 explicitly says not to
build one. Instead, up to 5 entries are merged client-side from five
existing, already-real-timestamped sources and sorted by that real
timestamp:

| Entry type | Source | Timestamp used | Link |
|---|---|---|---|
| "Started a mock interview: …" | `api.Interview.GetUserInterviews` | `_creationTime` | `/interview/{id}/start` |
| "Resume analysis completed: …" | `api.ResumeMatch.GetUserResumeMatchAnalyses` | `createdAt` (set only when an analysis is saved, i.e. completed) | `/resume-match-analyzer?analysisId={id}` |
| "New study plan created: …" | `api.StudyPlanner.GetUserStudyPlans` | `createdAt` | `/study-planner/{id}` |
| "Completed study topic: …" | `api.StudyPlanner.GetRecentCompletedTasks` (new, read-only) | `completedAt` | `/study-planner/tasks/{id}` |
| "Resume uploaded: …" | `api.Resumes.GetUserResumes` | `uploadedAt` | `/manage-resume` |

**Documented limitation / honesty note**: the prompt's example activity
type "Completed mock interview" was *not* implemented as worded, for the
same reason as Interview Activity's date caveat above — there is no
completion timestamp to sort or display it by. Rather than omit
interviews from Recent Activity entirely, or fabricate a completion time,
this shows the interview's real, known event (its creation) instead. No
entry is invented, duplicated, or sourced from another candidate's data
(every query is scoped to the authenticated `userId`).

Loading state: a skeleton block while any of the five queries is still
resolving. Empty state: a plain "Nothing here yet…" message when all five
return no rows.

### Navigation summary (Part 4)
- Continue Learning → `/study-planner/tasks/{taskId}` (existing route).
- View Results → `/interview/{id}/feedback` (existing route).
- Start Mock Interview (Interview Activity empty state) → `/create-interview`.
- Each Recent Activity entry links to its own existing record (table
  above).

### Missing data requirements
- No completion timestamp on `InterviewSessionTable` — affects both
  Interview Activity's displayed date and Recent Activity's inability to
  show a true "interview completed" event. Fixing this would need a new
  field (e.g. `completedAt`) written by `CompleteInterview` — out of scope
  here since it's a schema/mutation change to interview execution logic,
  which this part was told not to touch.

### Outstanding issues
None blocking.

## Part 5 — Final Integration, Responsive Layout and Consistency Review (DONE)

### Review findings and fixes
Inspecting Parts 1–4 together surfaced four real inconsistencies, all
cosmetic/structural (no data or query logic changed):

1. **Heading hierarchy mismatch.** `JobsForYou` (pre-existing, from M7/D5,
   edited in Part 3) rendered its `<h2>` *inside* a `rounded-xl` card as a
   small icon-prefixed `text-base font-semibold` heading, while every
   section built in Parts 1–4 (`ContinueJourney`, `CareerToolkit`,
   `ActivitySections`, `RecentActivity`) renders a bare
   `text-xl font-bold tracking-tight` `<h2>` directly on the page, with
   the bordered card below it. **Fixed**: `JobsForYou`'s heading now sits
   above its card in the same style, with "View All Jobs" alongside it,
   same as the pattern already used elsewhere.
2. **Border radius mismatch.** `JobsForYou`'s outer card used `rounded-xl`
   while every other dashboard card (`KpiCard`, the toolkit cards, the
   Continue Your Journey card, the activity cards, Recent Activity) uses
   `rounded-2xl`. **Fixed**: changed to `rounded-2xl`.
3. **Empty-state style mismatch.** `JobsForYou`'s two empty states used
   `rounded-lg border-dashed` with no `bg-muted/40`, diverging from the
   established empty-state convention used everywhere else in this app
   (`InterviewEmptyState`, `RecentActivity`'s own empty state, the
   Study Planner's `EmptyState`): `rounded-2xl border-dashed ... bg-muted/40`.
   **Fixed**: both `JobsForYou` empty states now match that convention.
4. **Progress-bar track color mismatch.** `ContinueJourney`'s progress bar
   used a `bg-primary/15` track; `KpiCard` and `ActivitySections`' progress
   bars (and the pre-existing, non-dashboard `study-planner/PlanCard.tsx`,
   which is this app's own established convention) use a plain `bg-muted`
   track. **Fixed**: `ContinueJourney`'s track changed to `bg-muted`.

### Responsive fix
The welcome header's two action buttons ("Explore Jobs", "Start Mock
Interview") sat side by side at every width via a plain
`flex items-center gap-3` row. On a narrow phone (≤375px) that's tight
enough to risk overflow. **Fixed**: that row is now
`flex w-full flex-col ... sm:flex-row sm:items-center` — the two buttons
stack full-width below `sm:` and sit side by side exactly as before at
`sm:` and up. No other breakpoint behavior changed.

### Final page order (verified against spec's required order)
Welcome Header → Career Progress Overview → `ProfileSetupPrompt`
(pre-existing, unrelated to this redesign, left in its original position)
→ Continue Your Journey → Your Career Toolkit → Jobs for You → Learning
Activity + Interview Activity → Recent Activity → `ResumeMatchHistory`
(pre-existing, appended after, not one of the 7 required sections). The
7 sections named by the prompt appear in the exact required order;
`ProfileSetupPrompt` is an existing, unrelated banner left where it
already was rather than moved for this redesign.

### Responsive layout - verified
- **Desktop**: 4 KPI cards/row (`lg:grid-cols-4`), 4 toolkit cards/row
  (`lg:grid-cols-4`), Jobs for You as compact horizontal rows
  (`JobCard`'s own `sm:flex-row`), Learning/Interview Activity side by
  side (`lg:grid-cols-2`).
- **Tablet**: KPI grid → 2 cols (`grid-cols-2`, already true below `lg`),
  toolkit grid → 2 cols (`sm:grid-cols-2`), job rows stay readable
  (`JobCard` already wraps/truncates), activity cards stay single-column
  until `lg` (acceptable "rearrange naturally" per spec - no fixed-width
  element forces scrolling at tablet widths).
- **Mobile**: toolkit grid → 1 col, activity cards → 1 col, job rows
  stack (`JobCard`'s `flex-col`), header stacks and its two buttons now
  stack full-width (see fix above), no element anywhere uses a fixed
  pixel width that could force horizontal scroll.

### Data and state consistency - reviewed, no changes needed
- Every query across all 5 parts is called with the authenticated
  candidate's own `userId` (from `UserDetailContext`), matching this
  app's existing ownership convention everywhere else (no
  Convex-Clerk identity integration exists app-wide - see
  `convex/jobDiscovery.ts`'s own comment on this - so "pass the caller's
  own userId, query filters by it" is the established pattern, not
  something introduced here).
- **"Avoid unnecessary repeated Convex subscriptions"**: several queries
  (`GetUserInterviews`, `GetUserStudyPlans`, `GetOnboardingStatus`,
  `GetUserResumes`, `GetUserResumeMatchAnalyses`) are called independently
  from multiple dashboard components with identical arguments. This is
  **not** duplicate network traffic: Convex's React client deduplicates
  subscriptions by query+args at the WebSocket layer, so N components
  calling `useQuery` with the same reference share one live subscription
  - the same pattern this codebase already uses elsewhere (e.g.
  `jobDiscovery.GetCandidateMatches` is already called independently by
  both `/jobs/page.tsx` and `JobsForYou.tsx`, predating this redesign).
  Introducing a shared data-fetching layer to "fix" this would be the
  large frontend refactoring Part 5 explicitly says to avoid, for no
  actual performance gain.
- **"Avoid fetching full job descriptions for compact dashboard previews
  when not required"**: reviewed. `JobCard`'s `compact` prop already
  skips *rendering* `job.description`, but `GetJobsForUser`/
  `GetCandidateMatches` (shared with the full `/jobs` page, which does
  need it) still include it in the query payload. Trimming that would
  mean changing a shared, explicitly protected query ("do not change...
  Jobs functionality") for a minor payload-size optimization, not an
  actual defect - left unchanged per "do not add new backend logic
  unless an actual integration defect requires it."
- No missing-data crash risk found: every section's `undefined` (loading)
  and empty-array/null cases are handled explicitly (see Parts 1–4's own
  empty/loading states, now visually unified per the fixes above).

### Files created across the whole redesign (Parts 1–5)
- `app/(routes)/dashboard/ProgressOverview.tsx`
- `app/(routes)/dashboard/ContinueJourney.tsx`
- `app/(routes)/dashboard/CareerToolkit.tsx`
- `app/(routes)/dashboard/ActivitySections.tsx`
- `app/(routes)/dashboard/RecentActivity.tsx`
- `DASHBOARD_IMPLEMENTATION_PROGRESS.md` (this file)

### Files modified across the whole redesign (Parts 1–5)
- `app/(routes)/dashboard/page.tsx` — header copy/layout, section mounting
  and ordering.
- `app/(routes)/dashboard/JobsForYou.tsx` — loading state (Part 3) +
  heading/card/empty-state consistency pass (Part 5).
- `convex/StudyPlanner.ts` — one new read-only query, `GetRecentCompletedTasks`
  (Part 4). The only backend change in the entire redesign.

(`app/(routes)/_components/Sidebar.tsx`, the `_components/InterviewCard.tsx`
/`InterviewEmptyState.tsx`/`InterviewHistoryList.tsx` extraction, and
`app/(routes)/mock-interview/` are from the earlier "Mock Interview menu"
restructuring task, not this Dashboard redesign - listed here only because
`git status` shows them as still-uncommitted alongside this work.)

### Navigation integration (final list, all existing routes)
| Action | Destination |
|---|---|
| Start Mock Interview (header) | `/create-interview` |
| Explore Jobs (header) | `/jobs` |
| Completed Interviews KPI | `/mock-interview/history` |
| Study Plan Progress KPI | `/study-planner` |
| Resume Readiness KPI | `/manage-resume` |
| New Job Matches KPI | `/jobs` |
| Continue Your Journey action | one of `/interview/{id}/start`, `/study-room/session/{id}`, `/study-planner/{id}`, `/profile/edit`, `/create-interview` (whichever was selected) |
| Career Toolkit (8 cards) | `/mock-interview`, `/study-planner`, `/resume-match-analyzer`, `/jobs`, `/manage-resume`, `/practice-coach`, `/study-room`, `/question-bank` |
| Jobs for You "View All Jobs" / Apply | `/jobs` / the job's real `applyUrl` |
| Continue Learning (Learning Activity) | `/study-planner/tasks/{taskId}` |
| View Results (Interview Activity) | `/interview/{id}/feedback` |
| Recent Activity entries | `/interview/{id}/start`, `/resume-match-analyzer?analysisId={id}`, `/study-planner/{id}`, `/study-planner/tasks/{id}`, `/manage-resume` |

### Deployment / configuration notes
- `convex/StudyPlanner.ts`'s new `GetRecentCompletedTasks` query needs a
  normal Convex deploy (`npx convex dev` / `npx convex deploy`) to exist
  on the backend before `RecentActivity`'s "Completed study topic" rows
  can appear - this wasn't run as part of this work (per "don't test
  yourself"), so the person deploying this needs to run it.
- No environment variables, schema migrations, or other configuration
  changes are required.

## Final section-by-section status
| Section | Status |
|---|---|
| 1. Welcome Header | Done |
| 2. Career Progress Overview (4 KPIs) | Done, with one documented data-gap (Resume Readiness uses profile completeness, not a resume-specific score) |
| 3. Continue Your Journey | Done |
| 4. Your Career Toolkit (8 modules) | Done |
| 5. Jobs for You | Done, reusing the pre-existing M7/D5 implementation, now visually unified with the rest of the page |
| 6. Learning Activity + Interview Activity | Done, with one documented data-gap (no interview completion timestamp) |
| 7. Recent Activity | Done, with the same completion-timestamp gap noted above (interview entries show creation, not completion) |

## Is the Dashboard production-ready?
**Not fully** - two pre-existing, out-of-scope issues will visibly affect
what candidates see, neither introduced by this redesign:
- Job sync has never actually run in production (`JOB_SYNC_SHARED_SECRET`
  unset, per the earlier J9 finding), so "New Job Matches" and "Jobs for
  You" will show their honest empty states for every candidate until
  that's fixed.
- `convex/StudyPlanner.ts`'s new query needs a Convex deploy (see above)
  before Recent Activity's study-topic entries will appear.

Everything this redesign itself was responsible for (layout, data wiring,
navigation, responsive behavior, visual consistency) is complete and
internally consistent.
