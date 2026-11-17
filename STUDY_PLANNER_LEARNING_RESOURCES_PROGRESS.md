# Study Planner – Task Learning Resources (progress log)

Last updated: 2026-11-17. Status: **implementation COMPLETE, untested** (user rule: don't test yourself).

Request: make Study Planner tasks actionable with real (verified, never fabricated) learning resources on the
Task Details screen; keep AI Study Room optional; never auto-complete tasks; don't change unrelated behaviour.

## Root cause (investigation result)
- `studyPlanTasks` (convex/schema.ts) only stored title/description/priority/duration/date/completionCriteria.
  No task type, URL, resource or content field existed.
- `utils/studyPlanner/schemas.ts` (GeneratedTaskSchema) + `planGenerator.ts` response schema only ask Gemini
  for those same text fields. `promptBuilder.ts` tells the model to "mix learning activities", so it writes titles
  like "Watch: ..." - but nothing ever asked for, discovered, verified or stored an actual resource.
- Task Details (`app/(routes)/study-planner/tasks/[taskId]/page.tsx`) could therefore only render description +
  phase objectives + completion criteria. The only learning path was the optional Study Room link.

## What was done (all done)
- [x] `convex/schema.ts`: exported `taskLearningResourcesValidator`; optional `studyPlanTasks.learningResources` (additive).
- [x] `convex/StudyPlanner.ts`: `GetTaskDetails` additionally returns `learningResources` (top-level, not inside
      `task`) and plan `learningGoal/currentLevel/targetLevel`; new `SaveTaskLearningResources` mutation
      (touches only `learningResources`, never status).
- [x] `convex/rateLimit.ts`: `studyTaskResources` limiter (40/day) + `consumeStudyTaskResources`.
- [x] `utils/studyPlanner/resourceDiscovery.ts`: Gemini Google-Search grounding (+ YouTube Data API when
      `YOUTUBE_API_KEY` is set). URLs only from grounding metadata / YouTube API, every one resolved + verified
      (YouTube via oEmbed = exists + embeddable; articles via live fetch, title read from the page). AI only
      writes the practice/project guide and quiz (URLs stripped, labelled "AI-generated").
- [x] `app/api/study-planner/task-resources/route.ts` (POST {taskId}).
- [x] `app/(routes)/study-planner/tasks/[taskId]/LearningResourcesSection.tsx` + mounted in page.tsx
      (auto-discovers once on first visit, Refresh button, stale-title notice, explicit "unavailable" states).
- [x] Study Room link now also passes `objectives`, `difficulty`, `context`; `study-room/create/page.tsx`
      prefills objective / difficulty / additional instructions from them (studyPlanner branch only).

- [x] Layout follow-up: Task Details page widened to `max-w-6xl`; task details card (left) and Learning
      resources card (right) sit in a `lg:grid-cols-2` grid, stacking on smaller screens.

## To do on resume / before first use
1. Run `npx convex dev` (or deploy) so the schema change + new functions reach Convex.
2. Optional: add `YOUTUBE_API_KEY` (YouTube Data API v3) to `.env.local` for more reliable video discovery.
   Without it, videos come only from grounded Google Search results.
3. Manually test: open a "Watch: ..." task -> resources load -> embedded player plays; a quiz/revision task
   shows the quiz; a practice/project task shows the guide; Refresh; Mark Complete still manual only.
