# Study Planner Implementation Progress

Last updated: 2026-11-13 (paused by explicit user request, not a quota limit)

## Status: M1, M2, M3, M4 all COMPLETE and approved-pending-review. Paused before M5 (no M5 spec has been given yet).

No further implementation work has been requested or started beyond M4. This file exists
because the user asked to pause and preserve state, not because of an error or a quota cutoff.

---

## What exists right now (all four milestones)

### M1 — Foundation & Dashboard
- Convex schema: `studyPlans`, `studyPlanPhases`, `studyPlanTasks`, `studyPlanMilestones` tables in `convex/schema.ts`.
- `convex/StudyPlanner.ts`: `GetUserStudyPlans`, `GetDashboardStats` (read-only, live-derived progress).
- Route `/study-planner` (`app/(routes)/study-planner/page.tsx`, `PlanCard.tsx`, `types.ts`): header, 4 stat cards,
  status filters (All/Active/Completed/Paused/Archived), plan cards, empty state.
- Sidebar entry "Study Planner" added in `app/(routes)/_components/Sidebar.tsx`, positioned right after "Dashboard"
  (moved there per a later user request).

### M2 — Create Study Plan (AI + Manual)
- `utils/studyPlanner/` (independent of Question Bank's AI code): `geminiClient.ts`, `schemas.ts` (Zod),
  `promptBuilder.ts`, `planGenerator.ts` (direct Gemini call, structured `responseSchema`, retry-once,
  date-range validation, duplicate-task dedup).
- `app/api/study-planner/generate/route.ts` — validates input, calls Gemini, returns the plan for **preview only**
  (never saves).
- Route `/study-planner/create` (`app/(routes)/study-planner/create/`): `page.tsx` (AI/Manual tabs),
  `CreateStudyPlanAITab.tsx`, `CreateStudyPlanManualTab.tsx`, `PlanStructureEditor.tsx` (shared phases/tasks/
  milestones editor used by both the AI preview-and-edit step and the Manual tab), `types.ts`.
- `convex/StudyPlanner.ts`: `CreateStudyPlan` mutation (plan + phases + tasks + milestones, one transaction).
- `convex/rateLimit.ts`: `studyPlanGenerate` limiter + `consumeStudyPlanGenerate`.
- Schema additions on `studyPlans`: `currentLevel`, `targetLevel`, `availableHoursPerDay`, `preferredStudyDays`,
  `learningPreferences`, `additionalInstructions`, `generationMethod`. On `studyPlanPhases`: `objectives`. On
  `studyPlanTasks`/`studyPlanMilestones`: `completionCriteria`.

### M3 — Study Plan Details & Task Management
- Route `/study-planner/[studyPlanId]` (`app/(routes)/study-planner/[studyPlanId]/`): `page.tsx`, `PhaseCard.tsx`
  (exports `TaskRow`, reused by M4), `EditPlanDialog.tsx`, `PhaseFormDialog.tsx`, `TaskFormDialog.tsx`,
  `MilestoneFormDialog.tsx`, `ConfirmDialog.tsx` (generic reusable delete confirmation), `types.ts`.
- `convex/StudyPlanner.ts` additions: `GetStudyPlanDetails` (full page payload: plan + phases-with-tasks +
  unassigned tasks + milestones + stats, live-derived, never trusts `studyPlans.progress/totalTasks/completedTasks`),
  `UpdateStudyPlan`, `SetStudyPlanStatus` (pause/resume/archive/restore), `DeleteStudyPlan` (cascades),
  `CreatePhase`/`UpdatePhase`/`ReorderPhase`/`DeletePhase` (cascades its tasks), `CreateTask`/`UpdateTask`/
  `DeleteTask`, `CreateMilestone`/`UpdateMilestone`/`DeleteMilestone`.
- Ownership helpers (`requireOwnedPlan/Phase/Task/Milestone`), `syncPlanCompletionStatus` (auto-flips a plan
  `active -> completed` when every task is done, and back `completed -> active` if one is reopened; never
  touches `paused`/`archived`; never looks at dates), `derivePhaseStatus` (live-derived, not trusted from storage).
- Schema addition: `studyPlanTasks.status` gained the `"skipped"` literal.

### M4 — Schedule, Task Details & Study Room integration
- **Key finding, confirmed by searching the whole repo:** no "AI Study Room" feature exists anywhere in this
  codebase (no route/component/Convex module) — it was only ever a reference concept in the original MagicPath
  design brief. The user was asked and explicitly chose: **"Navigation-only stub"** — a button that opens
  `/study-room?topic=...&studyPlanId=...&studyTaskId=...&planTitle=...` in a **new tab** with no page built
  behind it. No Study Room session table or other new Study Room infrastructure was created.
- Route `/study-planner/schedule` (`app/(routes)/study-planner/schedule/`): `page.tsx` (Day/Week/Month toggle,
  prev/next/today nav, legend), `DayView.tsx` (includes inline reschedule control), `WeekView.tsx`, `MonthView.tsx`
  (click a day -> jumps to Day view), `types.ts` (timezone-safe local-date helpers — grid math always uses the
  local `Date` constructor and compares raw stored date strings directly, never `new Date(isoString)` for
  matching, to avoid UTC-midnight day-shift bugs).
- Route `/study-planner/tasks/[taskId]` (`app/(routes)/study-planner/tasks/[taskId]/page.tsx`): reuses M3's
  `TaskFormDialog` and `ConfirmDialog` directly (not duplicated); shows parent phase's objectives as context;
  completion criteria/timestamp; Edit/Delete/Mark-Complete/Reopen; the Study Room link (opens new tab, deliberately
  so the user stays on this page and can decide afterward whether to mark the task complete — satisfies "optional,
  user-confirmed progress sync, never auto-complete" without inventing a fake session-return event).
- `convex/StudyPlanner.ts` additions: `GetScheduleTasks(userId, startDate, endDate)` (cross-plan, enriched with
  plan/phase titles), `GetTaskDetails(userId, taskId)` (task + parent plan + parent phase, ownership-checked).
- `convex/StudyPlanner.ts` modifications: `CreateTask` gained `scheduledTime`; `UpdateTask`'s `scheduledDate`/
  `scheduledTime` became `v.optional(v.union(v.string(), v.null()))` — `undefined` = leave alone, a string = set,
  explicit `null` = clear. This is what makes "remove a task's scheduled date without deleting the task" possible;
  it was NOT possible with the old plain-optional type (no way to distinguish "don't touch" from "clear").
- Schema additions: `studyPlanTasks.scheduledTime` (optional), index `by_user_scheduledDate` on `studyPlanTasks`
  (`['userId', 'scheduledDate']`) for the schedule queries.
- `TaskFormDialog.tsx` (M3 file, reused by M4) gained a scheduled-time field + a "Clear" button for the date;
  its `task` prop type was loosened to `Omit<TaskDetail, "order">` so the Task Details page (which doesn't have
  `order`) can pass its task object straight through without fabricating a dummy value.
- `PhaseCard.tsx` (M3 file): task rows now show scheduled time when set, and gained a "view details" icon-link to
  `/study-planner/tasks/[taskId]`.
- Dashboard (`app/(routes)/study-planner/page.tsx`): added one "Schedule" button next to "Create Study Plan" —
  the only Dashboard change, needed purely so `/study-planner/schedule` is reachable from the UI.

---

## Full file inventory (everything under the Study Planner module)

```
convex/schema.ts                                              (modified - additive only)
convex/StudyPlanner.ts                                        (new, all M1-M4 queries/mutations)
convex/rateLimit.ts                                            (modified - added studyPlanGenerate limiter)
utils/studyPlanner/geminiClient.ts                             (new)
utils/studyPlanner/schemas.ts                                  (new)
utils/studyPlanner/promptBuilder.ts                            (new)
utils/studyPlanner/planGenerator.ts                            (new)
app/api/study-planner/generate/route.ts                        (new)
app/(routes)/_components/Sidebar.tsx                           (modified - nav entry added/repositioned)
app/(routes)/study-planner/page.tsx                             (new - Dashboard)
app/(routes)/study-planner/PlanCard.tsx                         (new)
app/(routes)/study-planner/types.ts                             (new)
app/(routes)/study-planner/create/page.tsx                      (new)
app/(routes)/study-planner/create/CreateStudyPlanAITab.tsx       (new)
app/(routes)/study-planner/create/CreateStudyPlanManualTab.tsx   (new)
app/(routes)/study-planner/create/PlanStructureEditor.tsx        (new)
app/(routes)/study-planner/create/types.ts                       (new)
app/(routes)/study-planner/[studyPlanId]/page.tsx                 (new)
app/(routes)/study-planner/[studyPlanId]/PhaseCard.tsx             (new, modified again in M4)
app/(routes)/study-planner/[studyPlanId]/EditPlanDialog.tsx        (new)
app/(routes)/study-planner/[studyPlanId]/PhaseFormDialog.tsx       (new)
app/(routes)/study-planner/[studyPlanId]/TaskFormDialog.tsx        (new, modified again in M4)
app/(routes)/study-planner/[studyPlanId]/MilestoneFormDialog.tsx   (new)
app/(routes)/study-planner/[studyPlanId]/ConfirmDialog.tsx         (new, reused by M4)
app/(routes)/study-planner/[studyPlanId]/types.ts                  (new, modified again in M4)
app/(routes)/study-planner/schedule/page.tsx                       (new)
app/(routes)/study-planner/schedule/DayView.tsx                    (new)
app/(routes)/study-planner/schedule/WeekView.tsx                   (new)
app/(routes)/study-planner/schedule/MonthView.tsx                  (new)
app/(routes)/study-planner/schedule/types.ts                       (new)
app/(routes)/study-planner/tasks/[taskId]/page.tsx                 (new)
```

Unrelated files also showing as modified in `git status` (from earlier, separate bug-fix requests in this same
session, NOT part of Study Planner - do not revert these):
`.gitignore`, `app/(routes)/question-bank/DeleteCollectionDialog.tsx`,
`app/api/question-bank/answer/route.ts`, `app/api/question-bank/generate/route.ts`,
`utils/questionBank/questionAnswerer.ts`, `convex/_generated/api.d.ts` (auto-generated).

**Nothing has been committed to git.** Everything above is in the working tree only.

---

## Known open items / things to check on resume

1. **No `npx convex dev` process appears to be running.** `convex/_generated/api.d.ts` has not been
   regenerated since partway through M1 (it does not yet reflect M2/M3/M4's new functions in its own
   timestamp, though the code itself is correct and complete). **Before testing anything, start
   `npx convex dev` (or deploy) so the M2/M3/M4 schema changes and all new functions actually reach
   the Convex deployment.** This was flagged in the M2 and M3 reports too.
2. **Nothing has been tested** — per explicit instruction throughout M1-M4, no build/dev/test command was run.
   The first thing to do on resume (or whenever the user is ready) is to actually run the app and click through
   the full flow: create a plan (AI and manual), open its details, manage phases/tasks/milestones, pause/
   archive/delete a plan, view the schedule in all three modes, open a task's details page, and confirm the
   Study Room button opens `/study-room?...` (expected to 404, since that route doesn't exist by design).
3. **`/study-room` does not exist and will 404.** This is expected and was explicitly agreed with the user
   during M4 (see M4's "Study Room scope" decision above). Not a bug.
4. **No M5 (or any milestone beyond M4) has been requested.** Do not invent scope. Wait for explicit
   instructions before writing any more Study Planner code.

---

## Exact resume point

All four milestones (M1-M4) are implemented and were already reported to the user as complete, each time with
a full "Final Implementation Report" and a request for approval before continuing. The user has not yet given
feedback on M4 or requested M5 - they asked to pause instead. **There is no partially-written code or
half-finished mutation anywhere; every file listed above is in a complete, consistent state.**

To resume:
- If the user approves M4 and wants to continue, the natural next step is an M5 spec from the user (not
  invented by the assistant) - Study Planner does not currently have a defined M5 scope.
- If the user instead wants fixes/changes to M1-M4, treat those as normal bug-fix/change requests against the
  file inventory above.
- If the user just wants to verify things work, start by getting `npx convex dev` running (see item 1 above).
