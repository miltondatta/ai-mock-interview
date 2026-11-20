# AI Study Room Implementation Progress

Last updated: 2026-11-20 (follow-up tweak: all phase sections collapsed by default - see the section
immediately below) - previously 2026-11-20 (follow-up fix: end stray "stuck In Progress" sessions
automatically, just under it) - previously 2026-11-20 (follow-up fix: duplicate rows still in Recent
Sessions/History, below that) - previously 2026-11-20 (Compact Topic List UI and Duplicate Row
Elimination, below that) - previously 2026-11-20 (Fix Automatic Whiteboard Opening on Continue and
Repeat, below that) - previously 2026-11-20 (Fix Broken and Interrupted AI Tutor Voice, below that) -
previously 2026-11-20 (Unique Session Per Topic + Duplicate Cleanup, below that) - previously
2026-11-20 (Study Planner Topic Sync, below that) - previously 2026-11-19 (Phases 1-4 + client tool
reliability pass - see the sections further down, newest first)

## Status: M1-M5 implemented in code. M2, M3 and M5 each have a manual ElevenLabs-dashboard step
## outside my reach - see all three "ACTION REQUIRED" sections below. Not tested (per explicit
## instruction). Not committed to git.

---

## FOLLOW-UP (2026-11-20): ALL PHASE SECTIONS COLLAPSED BY DEFAULT - CODE COMPLETE, NOT TESTED

Requested directly: every Learning Phase section in "My Study Rooms" should start collapsed, not just
every phase after the first one in each plan (the "Compact Topic List UI" milestone's own choice,
flagged there as a judgment call worth confirming). `app/(routes)/study-room/PlanSection.tsx` -
`PhaseSection` is now always rendered with `defaultOpen={false}` instead of `i === 0`. Purely a default-
state change; expanding/collapsing, topic rows, actions and everything else are untouched.

---

## FOLLOW-UP (2026-11-20): END STRAY "STUCK IN PROGRESS" SESSIONS AUTOMATICALLY - CODE COMPLETE, NOT TESTED

### What was reported

After the Recent Sessions duplicate-filter fix just below, the user confirmed the remaining duplicate
they saw was specifically in **Recent Sessions**, and asked for the stray "In Progress" row to actually
be ended, not just hidden. Asked which fix they wanted (hide vs. actually end it) - they chose "end
it" explicitly.

### Root cause

A session can end up stuck at `status: "in_progress"` forever if its tab disappeared without a clean
disconnect - most plausibly a session started before Phase 1's lease/`beforeunload` tracking existed
(see `AI_STUDY_ROOM_IMPLEMENTATION_PROGRESS.md`'s Phase 1 section), or a genuine browser crash that
never got to send its `pagehide`/`beforeunload` beacon. Nothing before this fix ever went back and
corrected such a session - `EndStudyRoomSession` only ever runs from an explicit End Session click or a
beacon that actually fires - so it sits there permanently, showing as a second "In Progress" entry
alongside whatever the learner is actually doing now.

### Fix

Added `ReconcileStaleInProgressSessions` (`convex/StudyRoom.ts`), which reuses the existing Phase 1
Tutor-lease mechanism as the "is this actually live right now" signal: for each of a user's
`in_progress` sessions (via the existing `by_user_status` index), if it's been more than 2 minutes
since its last update *and* it has no currently-live (unexpired) `studyRoomTutorLeases` row, it's
treated the same as a normal abandonment - `status: "abandoned"`, `endedAt`/`durationSeconds` set,
stale lease row (if any) removed. Nothing is deleted: the session's own transcript, notes and summary
are completely untouched, exactly like a regular `EndStudyRoomSession(reason: "abandoned")` call. The
2-minute grace period and the lease check together are what make this safe to run automatically and
often - a session the learner is genuinely using right now always has a lease renewed every 20s
(Phase 1), so it's never touched; only a session with nothing actually connected to it for a while
qualifies.

`app/(routes)/study-room/page.tsx` now calls this mutation once per dashboard load (a `useEffect` keyed
on `userId`, fire-and-forget). This makes the fix self-service and automatic - the next time the
learner opens `/study-room`, any genuinely stale session is corrected on their own action, without me
running anything against the live database myself.

### Files modified

- `convex/StudyRoom.ts` - added `ReconcileStaleInProgressSessions` (and the `STALE_IN_PROGRESS_GRACE_MS`
  constant, placed next to the existing Tutor-lease helpers it reuses).
- `app/(routes)/study-room/page.tsx` - calls it once per dashboard load.

No schema change, no change to `EndStudyRoomSession`/the lease mechanism itself, no change to any other
feature.

### Remaining limitations

- The 2-minute grace window is a judgment call, not a value the user specified - long enough that a
  session which just started (before its tab's first lease acquisition) is never mistakenly abandoned,
  short enough to self-heal quickly on the next dashboard visit.
- This only corrects sessions for the user who loads the dashboard (their own `userId`) - it doesn't
  sweep every user's stale sessions in one pass, consistent with every other function in this module
  being scoped to the calling user.
- Not tested by me (per "don't test," which this conversation's instructions have consistently asked
  for) - it will run for real the next time the affected user opens `/study-room`. First thing to
  verify then: the previously-stuck "In Progress" row in Recent Sessions should become "Abandoned" (or
  disappear entirely from Recent Sessions if its room also turns out to be a non-canonical duplicate,
  per the fix just below).

---

## FOLLOW-UP (2026-11-20): DUPLICATE ROWS STILL IN RECENT SESSIONS/HISTORY - CODE COMPLETE, NOT TESTED

### What was reported

After the "Compact Topic List UI and Duplicate Row Elimination" milestone just below, the user
reported a duplicate row was still visible in **Recent Sessions**.

### Root cause

The previous milestone's duplicate-row fix only touched `buildDashboardItems`
(`app/(routes)/study-room/types.ts`), which feeds **"My Study Rooms"**. `GetRecentSessions` and
`GetSessionHistory` (`convex/StudyRoom.ts`) are separate queries that read `studyRoomSessions`
directly by `userId` and were never updated with the same canonical-room check - so a session
belonging to an old, non-canonical duplicate room for a Study Planner task (the exact kind of leftover
`CreateStudyRoom`'s M2 canonical lookup-or-create was meant to prevent going forward) still showed up
in Recent Sessions and the full Session History, even after "My Study Rooms" itself stopped showing
the duplicate room. Confirmed by reading both queries - neither ever called
`getLatestStudyRoomForTasks`/`pickCanonicalRoom` (M2's own canonical-room helpers) at all.

### Fix

Added `resolveSessionRooms` (`convex/StudyRoom.ts`) - resolves each session's room once and, for a
room tied to a Study Planner task, checks it against that task's canonical room (reusing M2's existing
`getLatestStudyRoomForTasks`, the same function `GetStudyRoomTopics` and `CreateStudyRoom` already use,
so all of these stay in agreement about which room is "the" one). `GetRecentSessions` and
`GetSessionHistory` now filter out any session whose room fails that check before slicing to the
requested limit. Nothing is deleted - a filtered-out session row is untouched in the database and
starts appearing normally again on its own once `CleanupDuplicateStudyRooms` (M2) re-parents it onto
the canonical room.

### Files modified

- `convex/StudyRoom.ts` - added `resolveSessionRooms`; `GetRecentSessions` and `GetSessionHistory` now
  use it to filter out sessions belonging to a non-canonical duplicate room. No other function changed;
  no schema change; "My Study Rooms," Start/Continue/Repeat/Open Room, Whiteboard/Code Editor/Notes,
  the AI Tutor and Mock Interview are untouched.

### Remaining limitations

- `GetDashboardStats`'s session/room counts are still a raw count over all sessions/rooms and can still
  be inflated by old duplicates (already flagged as a known limitation in the M2 and M5 sections below)
  - not changed here since the reported symptom was specifically Recent Sessions, and the instruction
    was to avoid touching other functionality.
- This hides duplicate-room sessions from these two views; it does not merge them.
  `CleanupDuplicateStudyRooms` (M2, further below) remains how to physically reconcile the underlying
  data for a given user.
- Not tested by me (per instruction). First thing to verify on resume: reload the dashboard and confirm
  Recent Sessions no longer repeats a topic via a leftover duplicate room specifically (as opposed to a
  legitimate second attempt of the same canonical room, which is still expected to show - see the M5
  section below's note on `issue/issue03.png`).

---

## COMPACT TOPIC LIST UI AND DUPLICATE ROW ELIMINATION (2026-11-20) - CODE COMPLETE, NOT TESTED

### Brief

Two linked asks: redesign "My Study Rooms" from a grid of large cards (one per topic) into a
compact, Study-Planner-style list grouped by Learning Plan -> Learning Phase -> Topic (reference
screenshots `issue/issue02.png`, `issue/issue03.png`), and permanently eliminate the duplicate rows
the user was still seeing for the same topic/session - a code/data fix, not a frontend dedup pass.

### UI inspected and reused

- **Study Planner's phase/task presentation**
  (`app/(routes)/study-planner/[studyPlanId]/PhaseCard.tsx`) is the direct visual reference: a
  collapsible phase header (chevron, title, `completed/total tasks · progress%`, status badge) over a
  list of compact `TaskRow`s (small icon, title + description, metadata chips, small action icons on
  the right - never a large full-width button). The Study Room redesign reuses this exact shape -
  same `rounded-2xl border border-border bg-card` phase container, same chevron-rotate collapse
  interaction, same compact row padding (`p-3`/`px-3 py-2.5`) - rather than inventing a new pattern.
- **Study Room dashboard / My Study Rooms** (`app/(routes)/study-room/page.tsx`,
  `RoomCard.tsx` as it stood after M1-M4): confirmed it was still one large card per topic in a
  `grid-cols-1 lg:grid-cols-2` layout - exactly `issue/issue02.png`'s "45 topics, impossibly long
  page" symptom.
- **Existing grouping/filtering**: `GetStudyRoomTopics` (`convex/StudyPlanner.ts`, M1) already returns
  topics in plan-then-phase-then-task order with `planId`/`planTitle`/`phaseId`/`phaseTitle` on every
  row - the hierarchy the brief asks for was already present in the data, just never used for grouping
  on the frontend (M1-M4 flattened everything into one list). The All/Active/Archived filter
  (`FilterValue`/`FILTERS` in `page.tsx`) was reused unchanged - see "Search/filtering" below.
- **The canonical room/session relationship** (M2: `CreateStudyRoom`'s idempotent lookup-or-create,
  `pickCanonicalRoom`, `getLatestStudyRoomForTasks`) - read in full; this milestone's duplicate-row fix
  builds directly on it rather than replacing it (see "Duplicate-row root cause" below).
- **Recent Sessions** (`GetRecentSessions`, `SessionRow.tsx`) - confirmed unchanged and still correct:
  it legitimately lists individual session *attempts* (can repeat a room's title across rows when a
  topic was attempted more than once), each still pointing at its own real `studyRoomId` - never
  misrepresenting an attempt as a separate canonical room. `issue/issue03.png` (two rows for the same
  room, one in-progress/one completed) is exactly this intended behaviour, not the bug.
- **Astra theme/components**: reused `border-border`/`bg-card`/`bg-primary/10 text-primary` icon
  chips, the existing `TOPIC_STATUS_META` badge classes, `formatDateTime`, and the filter-chip markup
  byte-for-byte from the pre-existing dashboard header - no new color tokens or typography introduced.

### New topic grouping structure

- `app/(routes)/study-room/types.ts` adds `StudyRoomPhaseGroup`, `StudyRoomPlanGroup`,
  `GroupedStudyRoomItems` and `groupDashboardItems(items)`: buckets an already-filtered/searched
  `StudyRoomDashboardItem[]` into Plan -> Phase -> topics, computing each phase's
  `totalTopics`/`completedTopics`/`inProgressTopics`/`notStartedTopics`/`progress` (the brief's
  required phase-level stats) and each plan's topic/completion totals. Order follows whatever order
  `GetStudyRoomTopics` already returns (newest plan first, phase order, task order) - no extra
  sorting. A dashboard item with no `planId` (a standalone room - manually created, or started from
  Question Bank/Resume Match/Interview Review) has nothing to nest under and is returned separately as
  `standalone`.
- `StudyRoomDashboardItem` gained `planId`/`planTitle`/`phaseId`/`phaseTitle` (so grouping has
  something to key off) and `taskType` (drives the row's leading icon); it lost the old `subtitle`
  field (the "Phase · Plan" line every card used to repeat) since the enclosing phase/plan headers
  already carry that context once, not per row.
- **New components**: `TopicRow.tsx` (the compact horizontal row - icon, title/description, status
  badge, last-accessed/session-count line, one compact action button) replaces the old `RoomCard.tsx`
  (deleted - fully superseded, not used anywhere else); `PlanSection.tsx` (plan header + its
  `PhaseSection`s, the latter being the actual collapsible unit, directly modelled on `PhaseCard.tsx`).
  `page.tsx` renders one `PlanSection` per plan, then a flat `TopicRow` list for any `standalone` rooms
  under an "Other Study Rooms" heading (only shown when there's at least one).
- Per-topic action button: compact, bordered `text-primary` pill (`Start Learning` / `Continue` /
  `Repeat`), not the old full-width solid-primary button - directly addressing "do not use large
  full-width orange buttons for every topic." The topic title is the "Open Room" affordance (a link to
  `/study-room/{id}` when a room exists) rather than a separate button, per "clicking the topic title
  ... must open its existing canonical Study Room."
- **Topic type icon**: `GetStudyRoomTopics` now also returns `taskType` from
  `studyPlanTasks.learningResources.taskType` (video/reading/practice/quiz/project/revision) when a
  task already has generated learning resources; `TopicRow` maps it to a matching lucide icon, falling
  back to a generic icon when none has been generated yet ("when available," per the brief - this is
  never inferred from the task's title text, which would be fragile).
- **Search** (M5.3's "if useful"): a compact title-only search box next to the filter chips,
  client-side `includes()` over the already-loaded list - applied together with the existing
  All/Active/Archived filter before grouping, so neither can produce a duplicate or drop a topic the
  other wouldn't have (both just narrow the same flat list that grouping is computed from afterward).

### Duplicate-row root cause

Confirmed by reading `buildDashboardItems` (`types.ts`) as it stood after M1-M4: a room was only
excluded from the "standalone" fallback list when it was the *exact* `studyRoomId` a topic's
`GetStudyRoomTopics` row pointed at - i.e. only that task's one **canonical** room (chosen by
`pickCanonicalRoom`, M2). Any **older, non-canonical** room still sitting in `studyRooms` for that
same `studyTaskId` - a genuine duplicate created before M2's idempotent `CreateStudyRoom` existed, or
before a manually-run `CleanupDuplicateStudyRooms` pass - had no topic row pointing *at it specifically*,
so it fell through to "standalone" and rendered as its own extra row for a topic that was already
shown correctly elsewhere. This is exactly `issue/issue02.png`'s "45 rooms" for what should have been
a much smaller topic count, and is a data/query-relationship gap, not a frontend rendering bug (the
React keys were already unique per room/topic id - there was no accidental key collision, just two
real, distinct rows legitimately representing the same topic).

### Data/query corrections

- **`convex/StudyRoom.ts`**: `buildRoomSummary` now also returns the room's own `studyTaskId`
  (additive field; `GetUserStudyRooms`'s other behaviour is unchanged).
- **`app/(routes)/study-room/types.ts`**: `buildDashboardItems` now excludes a room from "standalone"
  whenever **its own `studyTaskId` matches any task Study Planner currently returns** - not just the
  one canonical `studyRoomId` a topic happens to reference. This closes the gap for *every* leftover
  duplicate for a task at once (canonical or not), using the actual stable task reference rather than
  a title match or a `Set`/`filter` pass over the already-rendered rows, per the brief's explicit "do
  not solve this only with JS Set operations." A room whose task was later deleted still surfaces
  (its `studyTaskId` no longer matches any current task) so it isn't silently lost - consistent with
  M1's original "handle a deleted/archived plan gracefully" design.
- **Existing reconciliation tooling kept, not replaced**: `FindDuplicateStudyRooms`/
  `CleanupDuplicateStudyRooms` (added in M2) remain the way to physically merge old duplicate rooms'
  sessions onto their canonical room and archive the leftover shell (transcripts/notes/summaries
  preserved, nothing deleted - see the M2 section below for the exact mechanics and how to run them).
  This milestone's dashboard fix means duplicates are no longer **visible** immediately, regardless of
  whether that cleanup has been run yet - the two are complementary: one fixes what the learner sees
  right away, the other physically reconciles the database.
- Confirmed, while investigating, that `GetStudyRoomTopics` itself cannot produce the same task twice
  (each task belongs to exactly one plan, each plan/task table row is read with a single `.collect()`
  per plan) - the only duplication source was the standalone-room fallback above, not the topics query.

### Files modified

- `convex/StudyPlanner.ts` - `GetStudyRoomTopics` also returns `taskType`.
- `convex/StudyRoom.ts` - `buildRoomSummary` also returns `studyTaskId`.
- `app/(routes)/study-room/types.ts` - `StudyRoomDashboardItem` restructured (plan/phase fields added,
  `subtitle` removed); `buildDashboardItems`'s standalone-exclusion fixed; added `StudyRoomPhaseGroup`/
  `StudyRoomPlanGroup`/`GroupedStudyRoomItems`/`groupDashboardItems`.
- `app/(routes)/study-room/TopicRow.tsx` (**new**) - replaces `RoomCard.tsx` (**deleted**).
- `app/(routes)/study-room/PlanSection.tsx` (**new**) - plan/phase grouping and collapse.
- `app/(routes)/study-room/page.tsx` - renders the grouped structure instead of a card grid; adds the
  search field; filter chips, stats cards, "Recently studied" chips and Recent Sessions untouched
  beyond what the data-source/layout change required.

No Convex schema or mutation changes; no changes to Study Planner generation, AI Tutor behaviour,
Whiteboard/Code Editor/Notes, or Mock Interview.

### Remaining limitations

- `CleanupDuplicateStudyRooms` (M2) still has to be run explicitly per user to physically merge old
  duplicate rooms' session history - this milestone only makes the dashboard stop *displaying* them;
  see that section further down for exact invocation.
- `GetDashboardStats`'s `totalRooms` count is still a raw count of `studyRooms` rows and will include
  old duplicate/merged-away rooms until cleanup is run (documented as a known limitation already in the
  M2 section) - unchanged by this milestone, since the brief's explicit ask was the topic *list*, not
  this stat.
- Search is a simple client-side title substring match over the already-loaded list - fine at the
  scale this dashboard deals in, not a server-side/fuzzy search.
- Collapsible phases default open only for the first phase of each plan (subsequent phases start
  collapsed) to keep the initial view compact for a plan with many phases - a learner with few
  phases/topics may find this slightly conservative; easy to change to "all open by default" if that
  reads better in practice.
- Not tested by me (per "Don't test yourself"). First things to verify on resume: confirm the "45
  rooms" count drops to the real topic count once duplicates from before M2 exist in the test data (or
  simulate by creating two rooms with the same `studyTaskId` directly); expand/collapse a phase;
  confirm search narrows topics within their phases without breaking grouping; confirm Start/Continue/
  Repeat and the title-click "Open Room" link all still work per row.

---

## FIX AUTOMATIC WHITEBOARD OPENING ON CONTINUE AND REPEAT (2026-11-20) - CODE COMPLETE, NOT TESTED

### Brief

Entering a Study Room via Continue Learning (or, before M2's fix, Repeat Lesson) could land the
learner with the Whiteboard already open, instead of the default "Tutor conversation only" screen -
even though they never asked for it.

### Workspace state inspected

- **`Workspace.tsx`** (`app/(routes)/study-room/session/[sessionId]/`) owns three pieces of workspace
  state: panel *visibility* (`openOrder`/`activeTool`/`maximizedTool`, all local React state, default
  `[]`/`null`/`null`), panel *sizing* (`weights`), and panel *content* - which it never holds itself;
  each panel component (`WhiteboardPanel`/`CodeEditorPanel`/`NotesPanel`) loads and saves its own
  content independently via its own Convex query/mutation (`GetWhiteboard`/`SaveWhiteboardSnapshot`,
  etc. in `convex/StudyRoomWorkspace.ts`), keyed by `sessionId` alone.
- **`studyRoomWorkspaceLayout`** (`convex/schema.ts`) is the persisted record of visibility + sizing -
  one row per *session* (`studyRoomSessionId`), holding `openTools`/`activeTool`/`maximizedTool`/
  `panelWeights`. `GetWorkspaceLayout`/`SaveWorkspaceLayout` (`convex/StudyRoomWorkspace.ts`) read/write
  it; untouched by this fix.
- **Mounting**: `TutorCall.tsx` renders `<Workspace>` unconditionally (as soon as `userId` is known),
  toggling only a CSS `display` on its wrapping `<div>` based on `hasOpenTools` - confirmed (again) that
  Workspace is a single, stable component instance for the lifetime of one `TutorCall` mount, not
  conditionally mounted per tool. `WhiteboardPanel`/`CodeEditorPanel`/`NotesPanel` themselves *are*
  mounted/unmounted as their tool enters/leaves `effectiveVisible` (derived from `openOrder`) - each
  loads its own saved content the moment it mounts, independent of anything in this fix.
  `closeTool(tool)` (`Workspace.tsx`) only updates local `openOrder`/`activeTool`/`maximizedTool` state
  and resolves any pending panel waiters - it calls no content mutation, so closing a panel was already
  confirmed not to touch its saved drawings/code/notes.
  - Also checked (since it bears directly on "closing must not lose content"): each panel's debounced
    save (`WhiteboardPanel`: 800ms via `saveTimerRef`; `CodeEditorPanel`: 600ms via `saveTimersRef`;
    `NotesPanel`: same pattern) schedules a plain `setTimeout`, never cleared on unmount - so closing a
    panel within the debounce window does not cancel or lose that pending save; the timer still fires
    using its own closure/refs after the component unmounts. No change needed here - verified already
    correct, not assumed.
- **Session initialization/restore**: a resumed `in_progress` session (e.g. after Pause -> Continue)
  reuses its *same* `sessionId`, so `GetWorkspaceLayout` legitimately finds that session's own
  previously-saved layout row. A brand-new session (Start Learning, or Repeat Lesson after M2's fix,
  which always creates a fresh session row) has no layout row at all yet. Either way, the bug (below)
  was in what `Workspace.tsx` *did* with whatever `GetWorkspaceLayout` returned, not in which session
  id was used.
- **AI Tutor client-tool registration/execution** (`Workspace.tsx`'s `open_workspace_tool` and the
  four content-creation tools, via `openAndWait`/`openToolInternal`) - read in full; unrelated to and
  unaffected by this fix (see "AI Tutor tool behaviour" below).

### Root cause

`Workspace.tsx`'s layout-restore effect applied **all** of a session's saved layout - including
`openTools`/`activeTool`/`maximizedTool` (visibility) - on mount, not just `panelWeights` (sizing):

```ts
setOpenOrder((prev) => [...savedLayout.openTools, ...prev.filter((t) => !savedLayout.openTools.includes(t))])
setActiveTool((prev) => prev ?? savedLayout.activeTool ?? savedLayout.openTools[0] ?? null)
setMaximizedTool(savedLayout.maximizedTool ?? null)
```

So continuing a session that still had the Whiteboard open from an earlier visit (e.g. the learner
opened it, then clicked Pause without closing it first) restored it open again on the very next
Continue - with no new request from the learner. Before M2's fix, Repeat Lesson reactivated that exact
same session row (`RepeatStudyRoomSession`), so it inherited the identical problem; M2 already
incidentally stopped that specific path (Repeat now always starts a fresh session row with no layout
row to restore), but the underlying restore-on-mount behavior itself was still present and still wrong
for Continue Learning - the brief calls for the default workspace on **every** entry point
unconditionally, not "unless the session happens to be fresh."

### Workspace visibility handling (the fix)

`Workspace.tsx`'s layout-restore effect no longer sets `openOrder`/`activeTool`/`maximizedTool` from
`savedLayout` at all - those already default to `[]`/`null`/`null` in this component's initial state,
which is exactly the "no tool panel automatically open" default the brief asks for, and (since
`Workspace` is a fresh component instance on every session-page mount, as confirmed above) that default
now applies unconditionally on every entry point: Start Learning, Continue Learning, Open Room, and
Repeat Lesson. The effect now only restores `panelWeights` (the relative size open panels split into -
a sizing preference, not visibility, so it isn't covered by "no panel automatically open"). The
"merge rather than overwrite" workaround the Client Tool Reliability pass added for a Tutor-opened
panel racing the saved-layout query no longer applies either - there's nothing left for a restore to
clobber, since nothing is restored. Manually opening a panel, or the Tutor opening one in response to
an explicit request ("draw a flowchart", "show me a Python example", "make revision notes"), are both
unaffected - both still go through the same `openToolInternal`/`openAndWait`, untouched by this fix.

### Content persistence handling

Unchanged, and confirmed separate from visibility by inspection (not just by convention): `Workspace.tsx`
still writes the *same* `openTools`/`activeTool`/`maximizedTool`/`panelWeights` to
`studyRoomWorkspaceLayout` on every change (`SaveWorkspaceLayout`, debounced 500ms) - saving was not
touched, only what gets *read back and applied* on mount. Each panel's own content
(`studyRoomWhiteboards`/`studyRoomCodeFiles`/`studyRoomNotes`) is untouched by this fix in every
respect: no mutation call was added, removed, or changed in `convex/StudyRoomWorkspace.ts`, and no
panel component was modified. Opening a panel still restores its previously saved content exactly as
before (each panel's own `useQuery` + one-time-apply effect, e.g. `WhiteboardPanel.tsx`'s `saved`/
`loadedRef`); closing one still never deletes anything (`closeTool` calls no content mutation, verified
above).

### Files modified

- `app/(routes)/study-room/session/[sessionId]/Workspace.tsx` - layout-restore effect no longer applies
  `openTools`/`activeTool`/`maximizedTool` from the saved layout; still applies `panelWeights`.

No Convex schema, mutation, Whiteboard/Code Editor/Notes component, or AI Tutor tool changes - exactly
matching this milestone's scope protection.

### Remaining limitations

- `panelWeights` (panel split sizing) is still restored across a resumed same-session Continue. This is
  a deliberate reading of the brief (a size preference isn't "a tool panel automatically open"), not an
  oversight - flagging it explicitly in case that reading is wrong and it should also reset.
- `openTools`/`activeTool`/`maximizedTool` are still *written* to `studyRoomWorkspaceLayout` on every
  change (unused for restore now, but harmless to keep - e.g. useful if a future feature wants to show
  "what was open when this session ended" without auto-opening it). Removing the write path entirely
  was intentionally left alone, as the brief only asked to stop the automatic *opening*.
- Not tested by me (per "Don't test yourself"). First things to verify on resume: open the Whiteboard,
  click Pause, click Continue Learning on the same session - confirm the Tutor screen comes up with
  nothing open; ask the Tutor to "draw a flowchart" afterward and confirm the Whiteboard still opens and
  the diagram still appears; reopen the Whiteboard manually afterward and confirm the earlier drawing is
  still there.

---

## FIX BROKEN AND INTERRUPTED AI TUTOR VOICE (2026-11-20) - CODE COMPLETE, NOT TESTED

### Brief

Investigate and fix the AI Tutor's voice breaking/being interrupted during an active Study Room
session. Required reading the entire audio pipeline end to end - this app's own code
(`TutorCall.tsx`, `StudyRoomTutorSession.tsx`, the session page) and the vendored SDKs it sits on
(`@elevenlabs/react` 1.13.0, `@elevenlabs/client` 1.21.0, `livekit-client` 2.22.0) - rather than
guessing. No ElevenLabs/LiveKit replacement, no Mock Interview changes; neither was touched.

### Audio pipeline components inspected

- **Connection mode confirmed from the installed package, not assumed**: `conversation.startSession()`
  (`TutorCall.tsx`) resolves to `@elevenlabs/client`'s `WebRTCConnection` (`utils/WebRTCConnection.js`),
  which creates a `livekit-client` `Room` and calls `room.connect()` - this app uses **WebRTC via
  LiveKit**, not the raw WebSocket/PCM-worklet transport (`platform/web/output.js`'s
  `MediaDeviceOutput`, read for comparison, is the *other* transport's player and isn't used here).
- **Where audio actually plays, read from the installed package**: on `RoomEvent.TrackSubscribed`,
  `WebRTCConnection` calls `WebAudioAdapter.attachRemoteTrack` (`platform/web/webAudioAdapter.js`),
  which does `const audioElement = track.attach(); ...; document.body.appendChild(audioElement)`. **The
  Tutor's actual audio playback is a plain `<audio>` element LiveKit creates and appends directly to
  `document.body` - entirely outside React's virtual DOM.** This is the single most important fact for
  this investigation: no React re-render, re-mount, or state update anywhere in this app's component
  tree can touch that element's playback, because React never manages it. Packet jitter, reordering,
  and buffering for that track are handled by the browser's native WebRTC engine underneath
  `livekit-client`, which this app (and even the ElevenLabs JS SDK) has no hook into and cannot
  meaningfully "fix" at the JS level.
- **`useConversation`/callback stability, read from the installed package**: `useStableCallbacks` +
  `useRegisterCallbacks` (`@elevenlabs/react`) wrap every `onConnect`/`onMessage`/`onError`/`onDisconnect`
  callback in a ref-backed indirection, re-synced via `useLayoutEffect` on every render. Passing new
  inline callback objects into `useConversation({...})` on every `TutorCall` render (which this app
  does) is explicitly designed for by the library and does not re-subscribe, tear down, or otherwise
  disturb the live session - confirmed by reading the hook's source, not assumed.
- **`ConversationProvider`'s `startSession`/`endSession`, read from the installed package**
  (`ConversationProvider.js`): `startSession()` is a no-op if a conversation or an in-flight start
  already exists (`if (conversationRef.current) return; if (lockRef.current) return;`) - the SDK itself
  already guards against a double-start, so this app doesn't need to. `endSession()` synchronously
  clears `conversationRef`/`conversation` state but only *starts* (does not await) the actual
  `conv.endSession()` teardown (`room.disconnect()`, removing the `<audio>` element) - **it returns no
  promise for that teardown to be awaited by a caller.**
- **`TutorCall.tsx`/`StudyRoomTutorSession.tsx`/`session/[sessionId]/page.tsx`** - read in full; see
  findings below.
- Confirmed (`grep` across the session folder) that **no file other than `TutorCall.tsx`** calls
  `useConversation`, `setVolume`, `endSession`, `sendUserActivity` or `setMuted` - Workspace.tsx and its
  three panels (Whiteboard/Code/Notes) never touch the conversation/audio controls, so they're ruled out
  as an independent source of interruption (consistent with the separate Client Tool Reliability pass
  already having left `TutorCall` untouched).
- Browser audio context lifecycle: no app code creates, suspends or recreates an `AudioContext` -
  `TutorCall.tsx` never touches the Web Audio API directly; what little `AudioContext` use exists
  (mic/output volume metering for the waveform) is entirely inside the SDK and is unaffected by anything
  in this app's render tree.

### Root cause identified

**A — Interrupt can leave Nova's audio silenced for the rest of the session (the primary, confirmed
defect).** `handleInterrupt()` calls `conversation.setVolume({ volume: 0 })` to silence Nova immediately
(there is no SDK call to actually cancel her in-flight response - documented in Phase 1 and still true in
1.21.0). Restoring that volume depended on exactly three signals: the learner's next transcribed/typed
turn (`onMessage`, role `user`), an explicit `onInterruption` event, or a 1.2s timer that **only arms
while `conversation.mode === "listening"`**. `mode` is driven by LiveKit's `ActiveSpeakersChanged`, which
tracks the *agent's published track*, independent of this app's local `setVolume` - so it is entirely
possible for `mode` to go straight from one "speaking" turn to the next **without ever passing through
"listening"** (e.g. the agent's next reply starts before the interrupted one's queued audio has fully
drained). If that happens, and the learner says nothing, **none of the three restore signals ever
fires**, `setVolume({volume:0})` is never undone, and Nova stays silent - while the UI still reports her
as "Speaking" (`conversation.mode` still flips normally) - for every subsequent turn of the session. This
matches the reported symptom precisely: the Tutor's voice "breaks"/stops mid-lesson with no further
audio, while everything else (transcript, UI) keeps working. Confirmed by tracing `conversation.mode`'s
only producer (`ConversationModeProvider`, a plain 2-value `speaking`/`listening` state with no "idle" or
timeout of its own) and `ActiveSpeakersChanged`'s handler in `WebRTCConnection.js` - not a guess.

**B — Reconnect can briefly overlap the old and new audio connections.** `handleReconnect()` calls
`conversation.endSession()` (fire-and-forget - see above, it returns nothing to await) and then
immediately proceeds to `ensureMicrophonePermission()` / `requestFreshConnection()` / `startConversation()`.
Because `endSession()`'s real teardown (disconnecting the old LiveKit room, removing its `<audio>`
element) runs asynchronously with no promise exposed, the new `startConversation()` can begin before
that teardown finishes - a window where two LiveKit rooms/audio elements could briefly coexist. This is
a secondary finding (reconnect is a deliberate, infrequent action, not something happening continuously
during a lesson) but matches the brief's "duplicate playback"/"handle reconnects without duplicate
conversation instances" concerns directly.

**C — Unrelated, but real, unnecessary re-render churn during active speech.** `GetStudyRoomSession`
(`convex/StudyRoom.ts`) reads the session document that `AppendStudyRoomMessage` patches
(`updatedAt`) on **every single conversation turn** - so the `useQuery` in
`session/[sessionId]/page.tsx` re-delivers a brand-new `data` object, and therefore a brand-new `room`
object literal, every time Nova or the learner says anything. That cascaded through
`StudyRoomSessionPage` -> `StudyRoomTutorSession` -> `TutorCall` on every turn even though neither
`sessionId` nor any field of `room` had actually changed. Confirmed this doesn't *break* audio (per the
`<audio>`-element-lives-outside-React finding above) but it is exactly the "unnecessary state
updates"/"excessive rerenders" the brief's section 5 asks to avoid, and is a clean, low-risk thing to
fix regardless.

**Ruled out, with evidence, not assumption:** React component remounting during speech (the live-call
subtree's component type/position is identical across every lease/connection state transition while a
session stays open - traced every branch in `StudyRoomTutorSession`); duplicate conversation instances
from re-renders (the SDK's own `startSession` already no-ops if one exists, see above); AudioContext
suspension/recreation by app code (no app code touches the Web Audio API); network bandwidth as the
*sole* explanation (no evidence either way was available from this repo, and - per the brief - this
wasn't assumed; A and B above are concrete, code-level causes independent of network conditions).

### Changes implemented

1. **`app/(routes)/study-room/session/[sessionId]/TutorCall.tsx`** (fixes A and B):
   - Added `INTERRUPT_HARD_TIMEOUT_MS` (8s) and `interruptHardTimeoutRef`: `handleInterrupt()` now also
     arms an unconditional fallback timer that calls `finishInterrupt()` regardless of
     `conversation.mode`, guaranteeing Nova's audio is restored within a bounded time even when the
     mode-gated settle timer never arms. `finishInterrupt()`/`resetInterrupt()` clear it; the unmount
     cleanup effect clears it too. The existing three faster restore paths (learner's turn, explicit
     `onInterruption`, the 1.2s "listening" settle timer) are unchanged - this is a safety net underneath
     them, not a replacement.
   - Added `RECONNECT_TEARDOWN_GRACE_MS` (250ms) and a `sleep()` helper: `handleReconnect()` now waits
     this long right after calling `conversation.endSession()` before proceeding to
     `ensureMicrophonePermission()`/`requestFreshConnection()`/`startConversation()`. Documented in code
     as a best-effort mitigation, not a guarantee - the SDK's `endSession()` exposes no promise for its
     real teardown, so there is nothing to await directly.
2. **`app/(routes)/study-room/session/[sessionId]/page.tsx`** (fixes C): the `room` object handed to
   `StudyRoomTutorSession` is now built with `useMemo`, keyed on `room._id`/`title`/`topic`/`objective`
   (computed ahead of the early `data === undefined`/`null` returns so the hook is never called
   conditionally) instead of a fresh object literal on every render.
3. **`app/(routes)/study-room/session/[sessionId]/StudyRoomTutorSession.tsx`** (fixes C): default export
   wrapped in `React.memo`, so with a stable `room` reference and the already-stable `sessionId` string,
   `GetStudyRoomSession`'s per-turn reactivity no longer re-renders `StudyRoomTutorSession`/`TutorCall`/
   `ConversationProvider` at all when nothing relevant changed.

Preserved untouched, as instructed: the ElevenLabs Study Room agent/voice configuration, the Mock
Interview agent and its own audio pipeline, Study Planner, billing, and everything in Workspace.tsx and
its three panels.

### Files modified

- `app/(routes)/study-room/session/[sessionId]/TutorCall.tsx`
- `app/(routes)/study-room/session/[sessionId]/page.tsx`
- `app/(routes)/study-room/session/[sessionId]/StudyRoomTutorSession.tsx`

No Convex schema, mutation, or ElevenLabs dashboard changes.

### Remaining limitations

- **B is a mitigation, not a guaranteed fix**: `@elevenlabs/react` 1.21.0's `endSession()` exposes no
  promise for its teardown, so 250ms is a judgment call, not a proven-sufficient bound. A future SDK
  version that exposes an awaitable teardown would let this be fixed properly instead of with a grace
  delay.
- **A's underlying limitation (documented in Phase 1) is unchanged**: Interrupt is still client-side
  silencing, not a true server-side cancel (1.21.0 has no API for that) - the interrupted turn's
  transcript can still appear in the chat log even though its audio was muted. This fix only guarantees
  the *silencing itself* is always undone within 8s; it doesn't make the cancellation itself more
  "real."
- Genuine network-level packet loss/jitter on the learner's own connection is outside any application or
  SDK-level fix (see "Audio pipeline components inspected" above) - if voice breaking is still reported
  after this fix, the next thing to check live (not possible from this repo) is the browser's
  `chrome://webrtc-internals` during a real session, and whether it correlates with A or B above vs.
  genuine packet loss.
- Not tested by me (per "Don't test yourself"). First things to verify on resume: trigger Interrupt and
  then stay silent - confirm Nova's audio is audible again within 8 seconds even if the UI never visibly
  shows "Listening to you" in between; click Reconnect mid-session and confirm no overlapping/duplicate
  audio is heard; confirm the live Tutor screen no longer visibly flickers/re-renders on every single
  transcript line (React DevTools' "Highlight updates" on `TutorCall` while connected is the quickest way
  to see the before/after of fix C).

---

## UNIQUE SESSION PER TOPIC + DUPLICATE CLEANUP (2026-11-20) - CODE COMPLETE, NOT TESTED

### Brief

Builds directly on "Study Planner Topic Sync" just below. That milestone made every Study Planner
topic show up on the Study Room dashboard; this one makes sure each topic only ever has **one**
canonical Study Room, that repeated clicks or concurrent requests can never create a second one, that
repeating a finished lesson never destroys the learner's previous transcript/summary, and that any
duplicates already sitting in the database from before this fix can be found and safely merged.

### Root cause found (section 1's "identify why...")

Two independent issues, both already present before this milestone:

1. **`CreateStudyRoom`'s old dedup guard was time-windowed (30 seconds), not identity-based.** It
   matched on `title + topic + studyTaskId` created in the last 30 seconds - a genuine, permanent
   duplicate could still be created any time after that window, most concretely when Study Planner's
   Task Details page offers "Start Learning in AI Study Room" again because its own `existingStudyRoom`
   lookup (`app/(routes)/study-planner/tasks/[taskId]/page.tsx`) explicitly excludes archived rooms -
   so a topic whose only room had been archived looked "never started" and a second room got created
   for the exact same task.
2. **A second, parallel, *destructive* "repeat" mechanism already existed alongside
   `StartStudyRoomSession`.** `RepeatStudyRoomSession` (added in an earlier, unrelated session before
   either of these two milestones) reactivated one specific finished session row in place by **deleting**
   its messages, whiteboard, code files, notes and tool-action log and resetting it to `in_progress` -
   silently destroying that attempt's history. It was called from three places: the M1 dashboard's
   "Repeat Lesson" action (this session's own earlier work), `SessionRow`'s "Repeat" button on Recent
   Sessions, and `SessionCompletion`'s "Repeat" button on the session-completion screen - which also, at
   the same time, showed a second "Continue Learning" button that used the *other*, non-destructive
   mechanism (`StartStudyRoomSession`) for the exact same "resume this topic" intent. That inconsistency
   - one visible action silently destroying history, a near-identical one not - is exactly the class of
   bug section 1 asked to find. Neither "Open Room" nor plain navigation ever called either mutation
   (confirmed by reading `[studyRoomId]/page.tsx`, `GetStudyRoomDetails` and `GetStudyRoomSession` - all
   read-only), so viewing a room or session never changes its status on its own (section 3's requirement
   was already true and needed no fix).

### Canonical room identity

A room's canonical identity, when it has one, is **`(userId, studyTaskId)`** - or, lacking a specific
task, **`(userId, studyPlanId)`** - using the existing `by_studyTask`/`by_studyPlan` indexes already on
`studyRooms` (no schema change). A task's `phaseId`/plan membership don't need their own place in the
key: a `studyTaskId` already uniquely belongs to exactly one phase and one plan, so keying on the task
id alone is already as specific as the brief's "plan + phase + topic" asks for, without redundantly
storing phase/plan ids that could drift out of sync with the task's own. A room with **neither**
reference (manually created, or started from Question Bank/Resume Match/Interview Review) has no
stable topic identity to key off and keeps the old create-every-time-but-dedup-briefly behavior
unchanged, per the brief's own scope protection (section 7).

`CreateStudyRoom` (`convex/StudyRoom.ts`) is now a true idempotent lookup-or-create against that
identity: given a `studyTaskId`/`studyPlanId`, it looks up every existing room for it, and - if one or
more already exist - resolves to the canonical one (see `pickCanonicalRoom` below) and returns its id
instead of inserting, reactivating the room if it had been archived. Only when none exist at all does
it insert a new row. This is **the same single mechanism** every entry point already funnels through
(Study Planner's "Start Learning" link, the Study Room dashboard's "Start Learning" card, and the
Create Study Room form all call this one mutation) - no second creation path was introduced.

**Race safety** is Convex's own transactional (OCC) commit model, not a manually-built lock: two
concurrent `CreateStudyRoom` calls for the same task both read the same `by_studyTask` index range
inside their own mutation transaction; if one of them commits an insert into that range first, the
other transaction's read set is now stale and Convex automatically retries it from scratch - on retry
it finds the just-inserted room and reuses it. This is the "database-level/transactional" guarantee
the brief asked for, native to how every Convex mutation already runs; nothing extra needed building.

**`pickCanonicalRoom`** (shared by `CreateStudyRoom`, `getLatestStudyRoomForTasks` - used by Study
Planner's `GetStudyRoomTopics` - and the two cleanup functions below, so every part of the app agrees
on the same "which room is the real one" answer) picks the room with the most session history first
(the brief's "prefer the record containing the most useful valid learning history"), then the oldest
one as a deterministic tiebreaker.

### Session lifecycle behaviour

One single mechanism now covers every "resume this topic" action everywhere in Study Room -
`StartStudyRoomSession`: if the canonical room has a live (`in_progress`) session, it's resumed as-is
(transcript/workspace restored, nothing reset); otherwise a **brand-new** session row is inserted under
the *same* canonical room - the previous session(s), whatever their status, are never touched, moved,
or wiped. "Not Started" (`StudyRoomDashboardItem` with no `studyRoomId`) is the only state that calls
`CreateStudyRoom` at all. "Completed" shows the label "Repeat Lesson" instead of "Continue Learning"
(`RoomCard.tsx`'s `getAction`), but both labels dispatch to the exact same `StartStudyRoomSession` call
- there is no behavioral difference anymore, only a clearer label matching what's about to happen.
`RepeatStudyRoomSession` is **removed** (not merely left unused) from `convex/StudyRoom.ts`, since
keeping a destructive mutation nothing calls around would just invite the same bug again later - its
three call sites were updated instead:
- `app/(routes)/study-room/RoomCard.tsx` + `page.tsx` (this session's own earlier M1 work) - already
  only ever called `StartStudyRoomSession` for "continue"; the now-dead "repeat" special case was
  removed from `handleAction`.
- `app/(routes)/study-room/SessionRow.tsx` - "Repeat" now calls `StartStudyRoomSession` with that row's
  `studyRoomId` instead of `RepeatStudyRoomSession` with that row's own `sessionId`.
- `app/(routes)/study-room/session/[sessionId]/SessionCompletion.tsx` - same swap, and the
  simultaneous, redundant "Repeat" + "Continue Learning" button pair (both doing slightly different
  things before) is now exactly one primary action per status: "Repeat" for a completed session,
  "Continue Learning" only for an abandoned one (nothing to repeat there - it starts the next attempt).

### Duplicate cleanup strategy

Two new, user-scoped Convex functions in `convex/StudyRoom.ts`, neither invoked automatically by
anything (see "How to run this" below):

- **`FindDuplicateStudyRooms(userId)`** (query, read-only) - groups the user's rooms by `studyTaskId`
  and returns every group with more than one room, each room annotated with its session count and
  which one `pickCanonicalRoom` would keep, so the report can be reviewed before changing anything.
- **`CleanupDuplicateStudyRooms(userId)`** (mutation) - for every such group, re-parents every
  duplicate's sessions onto the canonical room by patching each session's own `studyRoomId` field
  (everything scoped to a session in `convex/StudyRoomWorkspace.ts`'s tables - Whiteboard, Code Editor,
  Notes, saved layout, tool-action log - keys off `studyRoomSessionId`, not the room, so it moves
  automatically with no extra writes). **Nothing is deleted.** Each merged-away duplicate is kept,
  re-tagged `status: "archived"` and title-prefixed `[Merged into "<canonical title>"] `, so the merge
  stays visible and fully reversible (per "do not perform irreversible deletion of learning history") -
  it is never picked as a session's room again (old sessions already moved off it) and the Study Room
  dashboard's `buildDashboardItems` (`app/(routes)/study-room/types.ts`) explicitly excludes any room
  with that title tag from the merged-topic/standalone card list, so a retired duplicate can't be
  clicked back into life as if it were still a separate room. Returns a migration report:
  `{ studyTaskId, canonicalStudyRoomId, mergedStudyRoomIds, sessionsReassigned, recordsRemoved: 0 }`
  per duplicate group (`recordsRemoved` is always `0` - nothing is ever deleted by this).

**How to run this** (not done automatically, and not run by me per "don't test yourself"): from a
Convex deployment with these functions deployed, `npx convex run StudyRoom:findDuplicateStudyRooms
'{"userId":"<id>"}'` to review first, then `npx convex run StudyRoom:cleanupDuplicateStudyRooms
'{"userId":"<id>"}'` per affected user once reviewed. This only covers rooms with a `studyTaskId` (the
case this milestone's canonical identity covers) - a duplicate with only a shared `studyPlanId` and no
specific task, or two independent rooms that merely share a title, is intentionally **not** touched
(the brief explicitly says not to delete/merge based on title alone).

### Dashboard actions (section 6)

`RoomCard.tsx`'s `getAction` now derives the single primary action purely from `studyRoomStatus`
(`not_started` -> Start Learning, `in_progress`/`abandoned` -> Continue Learning, `completed` -> Repeat
Lesson) for **every** card, not just Study-Planner-linked ones - previously a standalone room (no
linked task) always showed "Continue Learning" even when its last session had actually completed, since
the old "Repeat" path needed a `latestSessionId` that standalone rooms never carried. That constraint no
longer exists now that "Repeat" and "Continue" are the same call, so standalone rooms get the correct
label too. "Open Room" is unchanged - a plain navigation link, never a mutation call, so it still never
creates or changes a session (confirmed - see "Root cause found" above). `GetRecentSessions` itself
needed no change: it was never the source of the "duplicate independent rooms for the same topic"
symptom - that was purely a consequence of duplicate *rooms* existing, which this milestone prevents
going forward and can retroactively clean up with the functions above.

### Files modified

- `convex/StudyRoom.ts` - `CreateStudyRoom` rewritten to the idempotent canonical lookup-or-create
  described above (old 30-second-window dedup kept, but only as the fallback for rooms with neither
  `studyTaskId` nor `studyPlanId`); added `pickCanonicalRoom`, `FindDuplicateStudyRooms`,
  `CleanupDuplicateStudyRooms`; `getLatestStudyRoomForTasks` (M1's helper) now resolves the same way via
  `pickCanonicalRoom` when more than one room exists for a task, instead of its own separate
  "most-recently-accessed" rule, so the dashboard and `CreateStudyRoom` never disagree about which room
  is canonical; removed `RepeatStudyRoomSession`.
- `app/(routes)/study-room/RoomCard.tsx` - `getAction` simplified (no longer needs `latestSessionId`).
- `app/(routes)/study-room/page.tsx` - `handleAction`'s dead "repeat" branch removed; no longer imports
  `RepeatStudyRoomSession`.
- `app/(routes)/study-room/SessionRow.tsx` - "Repeat" now calls `StartStudyRoomSession`.
- `app/(routes)/study-room/session/[sessionId]/SessionCompletion.tsx` - "Repeat" now calls
  `StartStudyRoomSession`; "Continue Learning" only renders for an abandoned session, so a completed one
  shows exactly one primary action ("Repeat") instead of two.
- `app/(routes)/study-room/types.ts` - `buildDashboardItems` excludes merged-away duplicate shells
  (by the `[Merged into "` title tag) from the rendered list.

### Migration details

No schema change. The merge is additive/non-destructive by construction (patches `studyRoomSessionId`
ownership and the duplicate room's own `status`/`title` only - see "Duplicate cleanup strategy" above
for the exact report shape and how to invoke it). Nothing is deleted anywhere in this milestone.

### Remaining limitations

- `CleanupDuplicateStudyRooms` must be invoked explicitly per user (not run by me, and not swept across
  all users automatically) - see "How to run this" above.
- `GetDashboardStats`' `totalRooms` count is unchanged and will include a merged-away duplicate shell as
  a "room" after cleanup runs (it's still a real row, just archived and emptied) - a minor cosmetic
  over-count, not a functional issue, left as-is rather than touching a stats query this milestone
  didn't otherwise need to change.
- Duplicates that share only a `studyPlanId` (no specific task) or share nothing but a title are
  intentionally not detected/merged by `FindDuplicateStudyRooms`/`CleanupDuplicateStudyRooms`, per the
  brief's explicit "do not delete/merge based on matching titles alone."
- Not tested by me (per "Don't test yourself"). First thing to verify on resume: click "Start Learning"
  for a topic, then immediately click it again (or open the same link in two tabs) and confirm only one
  room/session is ever created; complete a lesson and click "Repeat Lesson" and confirm the prior
  session's transcript/summary are still intact afterward (check the room detail page's Sessions list -
  both the old and new session should be listed, not one overwriting the other).

---

## STUDY PLANNER TOPIC SYNC (2026-11-20) - CODE COMPLETE, NOT TESTED

### Brief

The Study Room dashboard's "My Study Rooms" section only ever showed rooms that already
existed - a Study Planner topic the learner hadn't started yet in AI Study Room was invisible
there, even though it already existed as a `studyPlanTasks` row. The brief (reference screenshot
`issue/issue01.png`) asked for Study Planner to become the source of truth for "My Study Rooms":
every topic from every plan should show up (Not Started / In Progress / Completed), and starting a
topic from either Study Planner or the Study Room dashboard must resolve to the same room - never a
duplicate.

### Existing architecture found (read before changing anything)

- **Study Planner** (`convex/StudyPlanner.ts`, `convex/schema.ts`): `studyPlans` -> `studyPlanPhases`
  -> `studyPlanTasks` (a task's `phaseId` is optional - a task can be phase-less). A task's own
  `status` (pending/in_progress/completed/skipped) is Study Planner's own progress tracking, separate
  from anything in Study Room.
- **Study Room** (`convex/StudyRoom.ts`): `studyRooms` -> `studyRoomSessions`. A room optionally
  carries `studyPlanId`/`studyTaskId` (set when it was started from a Study Planner task - see
  `CreateStudyRoom`'s `validateOwnedRefs`), which is exactly the stable, ownership-checked reference
  the brief asked for instead of matching on topic title (title collisions across different plans are
  explicitly possible and already called out in existing comments). `by_studyTask` is an existing
  schema index on `studyRooms` - no index needed to be added.
- **Existing one-directional read**: Study Planner's Task Details page
  (`app/(routes)/study-planner/tasks/[taskId]/page.tsx`) already calls
  `api.StudyRoom.GetStudyRoomsForStudyTask` (a Study-Room-owned query) to show "this task's Study Room
  session(s)," and already builds a `/study-room/create?source=studyPlanner&studyTaskId=...&...` link
  whose prefill logic (`app/(routes)/study-room/create/page.tsx`) I had to match field-for-field so a
  topic started from either entry point produces an identical room.
- **Existing "same topic -> same room" guard**: `CreateStudyRoom` already dedupes on
  `title + topic + studyTaskId` within a 30-second window. This module's existing comments explicitly
  document that a room is never required to carry `studyPlanId`/`studyTaskId` and that losing that
  link is handled as "unavailable," never an error - so treating "no room found for this task" as
  `not_started` (rather than as a bug) matches the module's own conventions.
- **Existing `RepeatStudyRoomSession` mutation** (added in a separate, prior session - see the
  "AI Study Room Tool Usage Investigation" work above this file; unrelated to this milestone) already
  reactivates a specific finished session row rather than starting a new one. This is exactly the
  "Repeat Lesson" action the brief asked for, so no new mutation was needed for it.

### Topic synchronization approach

1. **New read-only Convex helper**, `getLatestStudyRoomForTasks` (`convex/StudyRoom.ts`, placed next
   to the existing `findStudyRoomsForStudyPlan`): given a user and a list of task ids, returns - per
   task - the most relevant linked room (if any) plus that room's most recent session's id/status.
   This is the only place Study Room's own tables (`studyRooms`, `studyRoomSessions`) are queried for
   this feature; StudyPlanner.ts never queries them directly, matching the existing
   StudyPlanner-depends-on-StudyRoom direction already established by its import of
   `deleteStudyRoomCascade`/`findStudyRoomsForStudyPlan`.
2. **New query**, `GetStudyRoomTopics` (`convex/StudyPlanner.ts`): for the caller's own non-archived
   plans, returns one "topic" per task (every phase's tasks, plus phase-less tasks), each carrying its
   plan/phase context, a derived `studyRoomStatus` (`not_started` / `in_progress` / `completed` -
   `abandoned` sessions count as `in_progress` so "Continue Learning" is still the right action), and -
   when a room already exists - that room's id, latest session id, session count and last-accessed
   time. A task with no room at all still comes back (`studyRoomStatus: "not_started"`), which is the
   brief's core requirement.
3. **Dashboard merge** (`app/(routes)/study-room/types.ts`'s new `buildDashboardItems`): combines
   `GetStudyRoomTopics` with the existing `GetUserStudyRooms` into one list - a topic that already has
   a room is shown once (topic title/description stay authoritative, per "Study Planner is the source
   of truth"), and any room with no matching topic (manually created, or started from Question
   Bank/Resume Match/Interview Review - all still fully supported) is still shown standalone, exactly
   as before. This is what keeps "don't require a session to exist before showing a topic" true while
   also not dropping any previously-visible room.
4. **One action per card, reusing three existing mutations with zero new ones**: "Start Learning" (no
   room yet) calls the existing `CreateStudyRoom` + `StartStudyRoomSession` directly (the same two
   calls `create/page.tsx`'s submit handler already makes, just invoked straight from the dashboard
   card instead of via the form) and is only ever offered when `GetStudyRoomTopics` reports no linked
   room - so a second click, or entering from Study Planner's own "Start Learning" link afterward,
   reuses the same room via the existing dedup guard rather than creating a duplicate. "Continue
   Learning" (room exists, not finished) calls the existing `StartStudyRoomSession`. "Repeat Lesson"
   (room exists, finished) calls the existing `RepeatStudyRoomSession` on that room's latest session.

### Files modified

- `convex/StudyRoom.ts` - added `getLatestStudyRoomForTasks` (new exported helper; no changes to any
  existing export's behavior).
- `convex/StudyPlanner.ts` - added `GetStudyRoomTopics` (new query) and extended the existing import
  of `./StudyRoom` to include the helper above. No existing export changed.
- `app/(routes)/study-room/types.ts` - added `TopicStatus`, `TOPIC_STATUS_META`, `StudyRoomTopic`,
  `StudyRoomDashboardItem` and `buildDashboardItems`. No existing export changed.
- `app/(routes)/study-room/RoomCard.tsx` - rewritten to render the unified `StudyRoomDashboardItem`
  (status badge + the one contextual action - Start/Continue/Repeat) instead of only a
  `StudyRoomSummary` with a single hardcoded "Continue Learning" action. Still the only place that
  renders a card in "My Study Rooms," and still only imported by `page.tsx`.
- `app/(routes)/study-room/page.tsx` - added the `GetStudyRoomTopics` query and the `CreateStudyRoom`/
  `RepeatStudyRoomSession` mutations; replaced the room-only list/filter/"Continue Learning" logic with
  the merged `items` list and a single `handleAction` dispatcher. The stat cards, "Recently studied"
  chips, the All/Active/Archived filter tabs (now filtering the merged list instead of only rooms, same
  values/labels/counts mechanism as before) and the "Recent Sessions" section were not changed beyond
  what the data-source rename required.

### Database changes

None. No schema migration - this only adds a new way of reading `studyPlans`/`studyPlanPhases`/
`studyPlanTasks`/`studyRooms`/`studyRoomSessions`, all of which already existed with the indexes this
needed (`by_user`, `by_studyPlan`, `by_studyPlan_order`, `by_studyTask`, `by_studyRoom`).

### Explicitly not done (per the brief's own scope protection / mandatory instructions)

- No duplicate-session cleanup, no audio changes (out of scope per the brief).
- No change to Study Planner generation logic, AI Tutor behaviour, Mock Interview, authentication or
  billing.
- Not tested by me (per "Don't test yourself" / existing project convention - see every other
  milestone in this file).

### Remaining implementation milestones / resume point

- **Live verification** (first thing to do on resume): open `/study-room` as a user with at least one
  Study Planner task that has never had a session, confirm it shows "Not Started" with a working
  "Start Learning" button, that clicking it lands in a live session, and that going back to that same
  task in Study Planner's Task Details screen now shows "Continue in AI Study Room" pointing at the
  same room (not a second one).
- Verify the Active/Archived filter tabs still correctly split a mix of topics-without-rooms (always
  "active"), topics-with-rooms, and pre-existing standalone rooms (including an archived one).
- Not attempted: any visual/responsive pass beyond reusing the existing card layout and Astra theme
  tokens already used by `RoomCard.tsx`/`SessionRow.tsx` - worth a manual look at phone width since no
  browser was opened during this work.

---

## CLIENT TOOL RELIABILITY PASS (2026-11-19) - CODE COMPLETE, NOT TESTED

Stage completed: all application-side work for objectives A-G is written. `tsc --noEmit` passes. ESLint
reports no new problems in the changed files (the one remaining error, `set-state-in-effect` in the layout
restore effect, was already there before this pass). **Nothing was run or tested** in a browser or against
a live ElevenLabs agent (per instruction). The ElevenLabs dashboard was not touched.

### A. Eight-tool verification (dashboard table in "ACTION REQUIRED before M3 works" vs `Workspace.tsx`)
| Tool | Registered (Study Room provider) | Args vs handler | Result |
|---|---|---|---|
| `create_whiteboard_diagram` | yes | `title`, `nodes[{id,label}]`, `edges[{from,to,label?}]` - matches; handler also accepts optional `shape`/`layout`/`direction`/`replace` | match |
| `highlight_whiteboard_elements` | yes | `labels[]` - matches (also accepts optional `ids[]`) | match |
| `clear_whiteboard` | yes | none | match |
| `write_code` | yes | `language`, `content`, `mode` (replace/append), `filename` - matches (also accepts `replace_selection`/`insert_at_cursor`, `explanation`) | match |
| `create_note` | yes | `heading`, `content` - matches (also optional `position`/`section`) | match |
| `restructure_notes` | yes | `content` - matches (also accepts the newer `sections` shape) | match |
| `get_workspace_context` | yes | none | match |
| `open_workspace_tool` | yes | `tool` = whiteboard/code/notes - matches | match |

- Names: all 8 match the dashboard exactly (spelling + case).
- Provider: tools are registered with `useConversationClientTool` inside `Workspace`, rendered by `TutorCall`
  under the Study Room's own `<ConversationProvider>` (`StudyRoomTutorSession.tsx`). The Mock Interview
  provider (`components/interview/InterviewSession.tsx`) registers no client tools - nothing leaks there.
- Result transport: the installed `@elevenlabs/client` `handleClientToolCall` sends `client_tool_result`
  with the handler's return value (string, or JSON-stringified object). Handlers return a JSON string of
  `{ ok, status, message, ...data }`.
- Discrepancies: none in names or required params. The app accepts extra optional params, and registers 11
  extra tools (`add_whiteboard_element`, `run_code`, `read_notes`, ...) that are **not** on the dashboard.
  They are harmless (never called unless configured) and are documented in the Phase 4 table below.

### Root causes found
1. **Readiness was polling** (`waitFor`, 50ms `setTimeout` loop, 10s cap): a fixed-delay mechanism, not a
   signal. A closed panel or session change was not detected; the call just ran out its timeout.
2. **Saved-layout restore overwrote `openOrder`**: if Nova opened a panel before the
   `GetWorkspaceLayout` query resolved (start of a session), the restore replaced the open list and
   unmounted the panel the tool call was waiting on, so the first call failed.
3. **Stale handles after approval**: `write_code` applied the Code Editor handle captured *before* the 30s
   approval wait (stale file state). Notes/whiteboard ops did not check the panel still existed.
4. **`write_code` with an unknown `filename`** asked approval for the *active* file (`inspectTarget` falls
   back to it), then failed after the learner approved.
5. **Highlight** only recoloured the matching text element (not the shape it labels), did not report
   which labels were unmatched, and ran outside the duplicate-call guard.
6. **`delete_whiteboard_elements`** (not on the dashboard) rebuilt the scene from a pre-approval snapshot,
   which would discard anything drawn while the banner was up.
7. `get_workspace_context` reported an open-but-loading Whiteboard as `open: false`.
8. A handler exception surfaced as an SDK `is_error` result rather than a structured message.

### Implemented panel-readiness mechanism (Objectives B/C)
- `Workspace.openAndWait(tool, getHandle)` opens/fronts the panel and returns the handle immediately if it
  is ready. Otherwise it registers a one-shot waiter in `panelWaitersRef[tool]`.
- Panels **signal** readiness: `WhiteboardPanel.onApiReady(api)` (existing; fires after the saved scene is
  restored), new `CodeEditorPanel.onReady` (effect on files loaded + active file) and new
  `NotesPanel.onReady` (after saved notes are loaded into TipTap). Both new callbacks run in passive
  effects, after `useImperativeHandle` has attached the ref, so the handle is current. Workspace passes
  stable `useCallback`s, so the memoized panels don't re-render.
- A waiter settles exactly once: `ready` (handle re-checked; keeps waiting if it isn't there yet),
  `closed` (`closeTool`), `cancelled` (session change/unmount) or `timeout` (15s failure cut-off only).
- Used by every panel tool: create diagram, highlight, clear, write/run/read code, create/read/edit/delete
  note, restructure notes, and `open_workspace_tool` (which now confirms the panel is actually ready).
- Layout restore now merges saved tools with any already opened (root cause 2).

### Session / approval handling (Objective E)
- `epochRef` is bumped on a `sessionId` change and on unmount. That cleanup settles every queued/active
  approval and every panel waiter as `cancelled` and clears the banner.
- `askApproval(...)`: an approval only counts if the epoch is unchanged and the target panel still exists
  (Whiteboard: same Excalidraw instance; Code/Notes: handle still ready). Otherwise it is `cancelled`.
- After approval, Code/Notes ops re-read the live handle before applying.
- New `ApprovalOutcome`/`ToolResult.status` value `cancelled`. It is not logged via `LogToolAction`, whose
  status validator only has applied/rejected/timed_out (Convex unchanged). The existing approve/decline,
  30s timeout, FIFO queue and duplicate-call guard (`once`) are unchanged.

### Per-tool changes (Objective D)
- `create_whiteboard_diagram`: readiness + cancellation-aware confirm (for `replace`). Logic unchanged.
- `highlight_whiteboard_elements`: moved to `whiteboardTools.highlightElements`. Matches text
  case-insensitively and also highlights the labelled container shape. Returns `highlightedIds`,
  `unmatchedLabels` and `partial`; `not_found` (ok:false) when nothing matched; `invalid` with no labels.
  Only matched elements are changed. Auto-opens the Whiteboard and waits for it.
- `clear_whiteboard`: approval unchanged. An empty board returns "already empty"; the banner shows the
  element count.
- `write_code`: unknown `mode` -> `invalid` (absent -> `replace`, as before); unknown `filename` ->
  `not_found` with the file list, before any approval; language lower-cased and an unsupported language
  reported; the live handle is used after approval.
- `create_note`: empty `content` -> `invalid` (previously inserted an empty block).
- `restructure_notes`: approval unchanged; applied through the live handle after approval.
- `get_workspace_context`: reads live panel instances only; open-but-loading panels are reported as
  `{ open: true, ready: false }`.
- `open_workspace_tool`: case-insensitive input, `invalid` for anything else, waits for ready.
- All tools: exceptions are converted to `{ ok:false, status:"failed" }` in `useTutorTool`.

### Files modified
`app/(routes)/study-room/session/[sessionId]/Workspace.tsx`, `CodeEditorPanel.tsx` (new optional `onReady`
prop), `NotesPanel.tsx` (new optional `onReady` prop), `tutorTools/whiteboardTools.ts`. No UI/layout/theme
changes, no new dependencies, no Convex/Mock Interview/auth/billing changes, TutorCall untouched.

### Remaining limitations
- Not tested end to end (no browser / live agent run).
- On the dashboard, each tool's response timeout should exceed 30s (approval) + up to 15s (panel load).
- Highlight matching is substring-based: "Testing section" won't match a box labelled "Testing". Nova
  should pass the element's label (from `get_workspace_context`).
- `write_code` cannot create a new file; a missing `filename` is reported, not created.
- Pre-existing lint error in the layout-restore effect (`react-hooks/set-state-in-effect`) left as-is.
- A Workspace that stays mounted across a `sessionId` change still won't reload that session's saved
  layout (pre-existing; out of scope).

---

## PHASE 3 + PHASE 4 (2026-11-17) - COMPLETE (code), NOT TESTED

Phase 3 had never been implemented before Phase 4 was requested; the user chose "do Phase 3 (C6/C7/C8)
first, then Phase 4" in one run. Nothing was run/tested (per instruction). One central ElevenLabs agent
still drives every tool via client tools - no new LLM agents/requests were introduced. Phase 1 (audio,
reconnect, lease) and Phase 2 (memoization, waveform isolation) are preserved; panel props stay stable.

### Files
Modified (all in `app/(routes)/study-room/session/[sessionId]/`): `Workspace.tsx` (rewritten),
`WhiteboardPanel.tsx`, `NotesPanel.tsx`, `CodeEditorPanel.tsx`, `ToolApprovalBanner.tsx`, `workspaceTypes.ts`.
New: `tutorTools/whiteboardTools.ts`, `tutorTools/notesMarkdown.ts`, `tutorTools/notesAuthorship.ts`.
Unchanged: Convex schema/functions, all API routes (incl. `/api/study-room/code/run`), TutorCall,
StudyRoomTutorSession, ElevenLabs agent config, dynamic variables, prompts, Mock Interview.

### Phase 3 (C6 / C7 / C8)
- **C6 readiness**: `waitFor()` (50ms polling, 10s cap) - tools open the panel and wait for it instead of
  replying "ask me again". Ready means: whiteboard API handed over **after the saved scene is restored**
  (`WhiteboardPanel` `restored` state - acting earlier would be overwritten by the restore); Code =
  files loaded + active file (`isReady()`); Notes = editor + saved notes loaded (`isReady()`).
- **C7 approval queue**: FIFO of approvals; one banner at a time with a "+N more" count; each one's 30s
  timeout starts only when it is shown; resolution is keyed by approval id so stale timers/clicks can't
  resolve the wrong request; every waiting approval is settled ("timed_out") on unmount.
- **C8 mounted panels**: open-but-not-visible tools (overflow on mobile/tablet, or another panel maximised)
  stay mounted with `display:none`, so Excalidraw/Monaco/TipTap keep state, refs stay valid and
  `get_workspace_context` sees them. Closing a panel still unmounts it. Layout/splitters unchanged.

### Tool result format (Milestone 4)
Every tool returns a JSON string of `{ ok, status, message, ...data }`, `status` one of
`applied | declined | timed_out | failed | not_found | invalid`, plus follow-up data (element ids, block
ids, run output) so a result can feed the next call. Identical concurrent mutating calls (same tool +
same args) are rejected while the first is in flight. Tool actions are logged via the existing
`LogToolAction` (applied/rejected/timed_out). All tool work is async on the client - the voice pipeline
is never blocked (the SDK dispatches tool calls without awaiting them).

### Milestone 1 - Whiteboard (`tutorTools/whiteboardTools.ts`)
- **Context** (`get_workspace_context.whiteboard`): shapes `{id,type,label,x,y,width,height}`, connections
  `{id,type,from,to,label}`, counts, overall bounds; labels folded into their shapes; capped at 40 each
  with `truncated`.
- **Diagrams**: layouts `flowchart` (default) / `hierarchy` (BFS layering + one barycenter pass to reduce
  crossings, `direction` down|right), `concept_map` (highest-degree node centred, neighbours in a ring,
  rest in an outer ring), `row`. Node shapes rectangle/ellipse/diamond, sized to their label. Placed below
  existing content (never on top). Arrows are computed boundary-to-boundary (rect/ellipse/diamond maths)
  and **bound** (`startBinding`/`endBinding` + shapes' `boundElements`), so they stay attached when the
  learner drags shapes. `replace: true` asks for approval first when the board has content.
- **Element ops**: add (rectangle/ellipse/diamond/text), update (label/text, stroke/background colour by
  name or hex, width/height - labels re-laid out by Excalidraw's converter, bound arrows re-routed), move
  (x/y or dx/dy; label and attached arrows follow), delete (approval always; also removes labels and
  attached arrows, cleans references), connect, update connection (label and/or re-point).
- Highlight now also accepts element `ids`; clear unchanged (approval). Changes go through `updateScene`
  with bumped element versions, so the Phase 2 save signature + existing autosave persist them.

### Milestone 2 - Notes (`tutorTools/notesMarkdown.ts`, `notesAuthorship.ts`, `NotesPanel.tsx`)
- **Sanitised Markdown**: Tutor content is parsed to TipTap JSON (headings h1-h3, paragraphs with line
  breaks, bullet/ordered/task lists incl. one-level nesting, fenced code blocks with language,
  blockquotes, horizontal rules; bold/italic/code/strike/==highlight==). It is **never** parsed as HTML -
  any markup is inserted as inert text. Links become `text (url)`.
- **Authorship**: global `author` attribute on top-level block types, rendered `data-author="tutor"` (saved
  in the HTML), styled with a primary left border + an "Added by Nova" legend in the toolbar.
  `keepOnSplit:false`, so Enter after a Tutor paragraph starts a learner paragraph. Older notes keep
  their previous "🤖 Added by Nova" blockquote markers.
- **Targeted operations** (ProseMirror range transactions; learner cursor/selection/undo preserved):
  insert (end/start/after a section/after the selection), read (whole or one section; blocks with ids
  `b<index>-<hash>` + author), rewrite/append a section, delete a section, reorganise blocks under new
  headings (nothing dropped - unplaced blocks go under "Other notes"), legacy full replace.
- **Confirmation**: rewriting a section containing learner-written text, deleting a section,
  reorganising non-empty notes, and the legacy full replace all require approval (with previews).
  Appending / adding never does. Autosave + conflict detection unchanged (same `performSave`).

### Milestone 3 - Code Editor (`CodeEditorPanel.tsx`)
- **Context** (`get_workspace_context.codeEditor`): filename, language, line count, numbered code (whole
  file up to 6000 chars, else a +-60-line window around the cursor), selection text + line range, cursor
  line/column, +-8 surrounding lines, last run summary, file list. `read_code` returns any line range
  (<= 400 lines).
- **run_code**: reuses the existing `/api/study-room/code/run` route unchanged (Piston sandbox, language
  allow-list, 20k char cap, 12s run/compile timeouts) - nothing runs on the Next.js server. Returns
  `{status: success|runtime_error|compile_error|timeout|failed|stopped, exitCode, stdout, stderr,
  compileOutput, error, signal}` (outputs capped 3000 chars). `timeout` = sandbox SIGKILL. A run already
  in progress (learner or Tutor) blocks a second one. Results are shown in the console and recorded via
  `RecordCodeRun` exactly like a manual run.
- **Learner runs reach the Tutor**: after a Run-button run, a `sendContextualUpdate` with the result is
  sent to the live conversation (no reply/speech triggered; silently skipped when disconnected).
- **write_code** modes: `replace`, `append`, `replace_selection`, `insert_at_cursor`. On the open file these
  are Monaco `executeEdits` on just the affected range (learner's cursor/selection elsewhere, scroll and
  undo kept; Ctrl+Z reverts the Tutor's edit) followed by one immediate save. Replacing non-empty code or
  a selection requires approval; the banner shows the new code and the Tutor's `explanation`.

### ACTION REQUIRED - ElevenLabs dashboard (Study Room Tutor agent only)
Tools only work once configured as **Client Tools** on the Study Room agent (not the Mock Interview agent),
with "wait for response" on and a response timeout comfortably above 30s for tools that can ask for
approval. Existing 8 tools keep their names; some gained optional parameters.

| Tool | Parameters | Notes |
|---|---|---|
| `get_workspace_context` | none | Structured state of all three tools (see above). Call before referring to ids. |
| `open_workspace_tool` | `tool` (whiteboard/code/notes) | |
| `create_whiteboard_diagram` | `nodes` [{`id`,`label`,`shape`?: rectangle/ellipse/diamond}], `edges`? [{`from`,`to`,`label`?}], `title`?, `layout`? (flowchart/hierarchy/concept_map/row), `direction`? (down/right), `replace`? (bool) | Returns `nodeIds` (your id -> element id). `replace` asks approval. |
| `highlight_whiteboard_elements` | `labels`? [string], `ids`? [string] | |
| `clear_whiteboard` | none | Approval. |
| `add_whiteboard_element` | `type` (rectangle/ellipse/diamond/text), `label`?, `x`?, `y`?, `width`?, `height`?, `strokeColor`?, `backgroundColor`? | Returns `elementId`. |
| `update_whiteboard_element` | `id`, `label`?, `strokeColor`?, `backgroundColor`?, `width`?, `height`? | |
| `move_whiteboard_element` | `id`, `x`?, `y`?, `dx`?, `dy`? | |
| `delete_whiteboard_elements` | `ids` [string] | Approval; also removes attached arrows. |
| `connect_whiteboard_elements` | `from`, `to`, `label`? | Returns `connectionId`. |
| `update_whiteboard_connection` | `id`, `label`?, `from`?, `to`? | |
| `write_code` | `content`, `mode`? (replace/append/replace_selection/insert_at_cursor), `language`?, `filename`?, `explanation`? | Approval when overwriting code/selection. |
| `run_code` | `filename`? | Returns `run` (status, stdout, stderr, ...). |
| `read_code` | `filename`?, `start_line`?, `end_line`? | |
| `create_note` | `content` (Markdown), `heading`?, `position`? (end/start/after_section/after_selection), `section`? | Additive, no approval. |
| `read_notes` | `section`? | Returns blocks with ids + author. |
| `edit_note_section` | `section`, `content` (Markdown), `mode`? (replace/append), `explanation`? | Approval if replacing learner text. |
| `delete_note_section` | `section` | Approval. |
| `restructure_notes` | `sections`? [{`heading`,`block_ids` [string]}] (preferred), or legacy `content` (Markdown) | Approval when notes aren't empty. |

Suggested system-prompt addition: "Call get_workspace_context before referring to whiteboard elements,
note blocks or code. Prefer additive and targeted actions (create_note, edit_note_section with append,
write_code with append/replace_selection, add/connect elements) over replacing content. Notes content
is Markdown. Use ids returned by earlier tool results in follow-up calls. After run_code, explain the
result; on errors, suggest a fix and offer to apply it with write_code."

### Known limitations / incomplete
- **Not tested** at all; tools also need the dashboard configuration above to be callable.
- MagicPath designs were not re-fetched; only small UI additions were made using existing components and
  theme tokens (approval banner details/preview/queue count, Notes authorship border + legend).
- Whiteboard: arrows are straight lines (no elbow routing); concept maps/flowcharts can overlap labels for
  very dense graphs; boundary maths approximates text elements as rectangles; Excalidraw undo isn't
  explicitly captured for Tutor edits.
- Notes: tags are per top-level block - learner edits *inside* a Tutor block keep the Tutor tag; headings
  deeper than h3 are clamped to h3; links are flattened to text; block ids are positional+hash and
  become stale if the learner edits between read and write (detected and reported, not guessed).
- Code: selection/cursor context and targeted edits are only for the file currently open in the editor;
  the 30s approval timeout can exceed a short dashboard tool timeout (configure >= 30s).
- An approval waiting in the queue holds its Tutor tool call open until shown and answered.

---

## PHASE 2 (2026-11-17) - Performance / rendering efficiency (C5) - COMPLETE (code), NOT TESTED

Addresses investigation defect **C5** (the waveform loop set React state every animation frame,
re-rendering TutorCall -> Workspace -> Excalidraw/Monaco/TipTap ~60x/s while connected). Rendering
only: no UI/design, schema, ElevenLabs config, prompt, dynamic-variable or tool-orchestration changes.
All Phase 1 behaviour (link-state machine, reconnect, lease ownership, mic probe, interrupt) untouched.

### Files
- `TutorWaveform.tsx` (**new**), `TutorCall.tsx`, `Workspace.tsx`, `WhiteboardPanel.tsx`,
  `CodeEditorPanel.tsx`, `NotesPanel.tsx` (all in `app/(routes)/study-room/session/[sessionId]/`).

### Waveform isolation architecture
- `TutorWaveform` (memo'd) owns the rAF loop and writes bar heights **directly to the DOM via refs** -
  no React state at all, so animating re-renders nothing (not even itself). Per-bar writes are skipped
  when a height is unchanged.
- Loop runs only while `animated` (connected and speaking/listening - TutorCall's old `isAnimated`) **and**
  `visible` (its container isn't `display:none` because a workspace tool is open). Otherwise bars rest
  at 15%. rAF is cancelled on any change/unmount; the browser already pauses rAF in background tabs.
- Data source switches via refs (no loop restart): output levels while Nova is audibly speaking, input
  levels otherwise (an Interrupt shows the learner's input) - same rule as before. Getter calls are
  wrapped so a conversation disappearing between frames just rests the bars.
- Appearance unchanged: same 10 bars, classes, 15% floor, `transition-[height] duration-100`.
- TutorCall: removed `levels` state, `rafRef`, `BAR_COUNT`, the inline `Waveform` and its effect.

### React rendering optimizations
- `Workspace` is `memo(forwardRef(...))`; its props (sessionId, userId, `setHasOpenTools`) are stable, so
  TutorCall's renders (mode/status changes, messages, notices, interrupt) no longer reach it. Tool
  handlers still see current Workspace state (they re-register their latest closure on Workspace's own
  renders via the SDK's handler ref).
- `useBreakpoint` stores the breakpoint, not the raw width -> window resizing re-renders the Workspace
  only when crossing 768/1024px, not on every pixel. Same thresholds and SSR default.
- `onApiReady` for the whiteboard is a stable `useCallback` (was an inline arrow).
- Deliberately **not** memoized: Workspace's derived `visibleTools`/`overflowTools` (tiny arrays used only
  in map), splitter/button handlers on native elements - no measurable benefit.

### Whiteboard
- `WhiteboardPanel` is `memo`'d; Excalidraw now gets stable `excalidrawAPI` and `onChange` callbacks
  (Excalidraw's own `areEqual` shallow compare was failing on the inline arrows every render).
- Debounced save goes through a latest-value `performSaveRef`, so saves still use current props.
- `onChange` calls that can't change the saved payload (pointer move, scroll, selection) no longer reset
  the save timer: skipped only if it's the **same elements array** and the same (count, version sum,
  background). Array-identity is required because the Tutor's highlight tool replaces elements with
  recoloured copies that keep their `version`. A failed save clears the signature, so the next
  interaction retries exactly as before. Restore, AI diagrams, highlight, clear and autosave unchanged.

### Code Editor
- `memo(CodeEditorPanel)`; Monaco `options` hoisted to a module constant (`@monaco-editor/react` 4.7 calls
  `updateOptions` whenever the object identity changes); `onChange` is a stable callback forwarding to the
  latest handler (the library disposes/re-subscribes its content listener whenever `onChange` changes).
  Content, cursor, selection, autosave, runs and Tutor read/write unchanged.

### Notes
- `memo(NotesPanel)`; TipTap extensions hoisted to module scope. TipTap 3.34's `useEditor` compares the
  extensions array by element identity each render, and `.configure()` returns a new instance, so the
  inline list caused `editor.setOptions()` on **every render** (i.e. ~60x/s before). Same extensions/config.
- `shouldRerenderOnTransaction: false` stated explicitly (already TipTap 3's default - no behaviour change).
- Debounced save from `onUpdate` goes through a latest-value `performSaveRef`. Tutor `appendBlock` /
  `replaceContent` / `getPlainText` unchanged.

### Audio / Phase 1 isolation
- No conversation code touched: `useConversation` callbacks, `startSession`/`endSession`, reconnect, lease
  heartbeat, mic probe and interrupt are exactly as in Phase 1. Workspace memoization can't restart the
  conversation (ConversationProvider lives in StudyRoomTutorSession, above all of this).

### Remaining performance concerns (not changed in Phase 2)
- TutorCall still re-renders on real events (mode changes, each transcript message, notices) - cheap now
  that Workspace is shielded; the chat list isn't virtualized (only matters for very long sessions).
- Dragging a splitter re-renders Workspace per mouse move (panels are memo'd, so only the flex containers
  update; Monaco relies on `automaticLayout`).
- CodeEditorPanel re-renders on each keystroke (its own `localContent` state) - pre-existing; Monaco's
  wrapper sees an identical `value` and does nothing.
- `JSON.stringify` of all whiteboard elements on each debounced save - fine for normal boards, could be
  costly for very large ones.
- C6, C7, C8 (tool-reliability defects) still open - see below.

### Before first use
No schema change in Phase 2. (Phase 1's `npx convex dev` requirement still applies if not yet done.)

### Exact starting point for Phase 3 (tool reliability)
1. **C6** - `Workspace.tsx` handlers `whiteboardAddDiagram`, `codeWrite`, `noteCreate`, `noteRestructure`
   return "ask me again" when the panel was just opened: make them await panel/ref readiness (e.g. a
   promise resolved by the panel's ref/onApiReady, with a timeout) before acting.
2. **C7** - `Workspace.tsx:requestApproval` has a single resolver/timer slot; concurrent approvals clobber
   each other -> queue them.
3. **C8** - overflow (not visible) panels are unmounted (`effectiveVisible` rendering), so their refs go
   null and `get_workspace_context` reports them closed -> keep open panels mounted but hidden.
4. ElevenLabs dashboard checks (P1/P2/P5): Conversation History termination reasons via
   `studyRoomSessions.elevenlabsConversationId`; 8 client tools configured with response timeouts >= 30s.

---

## PHASE 1 (2026-11-17) - Audio stability & session management - COMPLETE (code), NOT TESTED

Addresses investigation defects **C1, C2, C3, C4, C9, C10** from the 2026-11-17 AI Tutor
investigation report. Not run/tested (per instruction). Tool orchestration (Workspace.tsx and the
three panels) was deliberately **not** touched.

### Files modified / added
- `convex/schema.ts` - new table `studyRoomTutorLeases` (`studyRoomSessionId`, `userId`, `clientId`,
  `expiresAt`, `updatedAt`; index `by_session`). Separate table so heartbeat writes don't invalidate
  every query that reads `studyRoomSessions`.
- `convex/StudyRoom.ts` - `AcquireTutorLease` (optional `force`), `RenewTutorLease`, `ReleaseTutorLease`,
  helper `getTutorLease`, `TUTOR_LEASE_MS = 90s`; `EndStudyRoomSession` gained optional `clientId`
  (no-op if a *different* tab holds the active lease; deletes the lease when the session ends);
  `studyRoomTutorLeases` added to `SESSION_SCOPED_TABLES` (room-delete cascade).
- `app/api/study-room/tutor/start/route.ts` - accepts `clientId`; calls `AcquireTutorLease` and returns
  **409 `{code:"held_elsewhere"}`** instead of a token when another tab owns the session. No clientId ->
  old behaviour.
- `app/api/study-room/tutor/end/route.ts` - forwards `clientId` to `EndStudyRoomSession`.
- `app/api/study-room/tutor/release/route.ts` (**new**) - sendBeacon target that releases the lease.
- `app/(routes)/study-room/session/[sessionId]/StudyRoomTutorSession.tsx` - lease ownership, heartbeat,
  BroadcastChannel, takeover UI, `requestFreshConnection`.
- `app/(routes)/study-room/session/[sessionId]/TutorCall.tsx` - connection state machine, reconnect,
  disconnect UI, error notices, mic probe cleanup, interrupt.

### Connection lifecycle (C1 + C3)
TutorCall no longer reads the SDK's `status` (which becomes `"error"` on *any* `onError`). It keeps its
own `LinkState`: `idle -> connecting -> connected`, plus `reconnecting`, `disconnected`, `failed`
(mirrored in `linkStateRef` so SDK callbacks never read stale state).
- `onConnect` -> `connected`.
- `onError` while connecting/reconnecting -> `failed` (with the SDK message). While `connected` it is
  **logged + a dismissable non-blocking notice** (tool errors get their own wording); it never covers
  the screen and never touches the live audio.
- `onDisconnect` -> `disconnected` with a human-readable reason (`describeDisconnect`: agent ended it,
  connection lost + message, `max_duration_exceeded`, closed). Ignored when *we* ended the
  conversation (`intentionalEndRef`: End Session, reconnect, watchdog, unmount).
- 25s connect watchdog: a start/reconnect that never connects becomes `failed` (also covers the
  provider silently ignoring a start while an older one is still pending).
- Status badge/footer now show Connecting / Reconnecting / Disconnected / Connection failed; "Listening
  to you" is only possible while genuinely connected. Overlay shows only for reconnecting/disconnected/
  failed, with the reason and "Nova isn't listening or speaking right now". Text input, waveform,
  beforeunload beacon and the Interrupt button are all keyed off `linkState === "connected"`.
- `onInterruption` is now registered (logged + ends a pending Interrupt, see C10).

### Reconnection (C2)
`handleReconnect`: guard against double clicks (`busyRef`) -> state `reconnecting` -> mark intentional
+ `conversation.endSession()` (old conversation torn down first) -> mic permission check (C9) ->
`requestFreshConnection()` (POST `/tutor/start` again: **new token**, dynamic variables rebuilt
server-side incl. the latest `conversation_history` from Convex and the resume greeting) ->
`startConversation(fresh)` with the watchdog. Failure -> `failed` with a "Try again" button. The local
transcript survives (TutorCall isn't remounted). The original join also fails over to this path: if the
mount-time token was stale, "Try again" fetches a fresh one. If `/tutor/start` says another tab owns the
session, the parent switches to the "open in another tab" screen.

### Single active tab (C4)
- Per-tab id `TAB_CLIENT_ID` (module scope, i.e. one per JS realm/tab; not sessionStorage because
  "Duplicate tab" copies it).
- On mount `StudyRoomTutorSession` acquires the lease **before** fetching a token. Not acquired ->
  "This session is open in another tab" screen (no token, no microphone) with **Use this tab instead**
  (force takeover), **Check again**, and a link to the room page (history/saved materials stay viewable).
- Owner heartbeats every 20s (`RenewTutorLease`; fails only if *another* tab actively holds the lease,
  otherwise re-establishes a missing/stale row - covers React Strict Mode's dev-only effect re-run
  releasing it); `ok:false` -> state `lost` -> TutorCall unmounts ->
  ConversationProvider ends that tab's conversation -> "This session moved to another tab".
- BroadcastChannel `study-room-tutor`: `takeover` makes a same-browser owner re-check immediately;
  `released` makes a waiting tab re-try acquiring.
- Release: on unmount (`ReleaseTutorLease`) and on `pagehide` (sendBeacon -> `/tutor/release`).
- Crashed/closed tab without release: lease expires after 90s, then any tab can acquire; takeover is
  available immediately anyway.
- Ending: only the owning tab renders TutorCall, so only it registers the beforeunload beacon / End
  Session; both send `clientId`, and the server ignores an end request from a non-owner while another
  tab holds an active lease. Closing/refreshing a non-owning tab can no longer abandon the session.

### Microphone (C9)
`ensureMicrophonePermission()`: if `navigator.permissions` reports microphone `granted`, **no stream is
opened at all** (avoids switching Bluetooth headsets into their call profile for nothing); otherwise a
probe `getUserMedia` stream is opened and **every track stopped immediately**. ElevenLabs opens/owns its
own mic stream in `startSession` and releases it in `endSession` (which runs before every reconnect).
Used by both Join and Reconnect.

### Interrupt (C10)
The installed SDK (`@elevenlabs/react` 1.13.0 / `@elevenlabs/client` 1.21.0) exposes **no client API to
cancel the agent's current response** - the server only cuts a turn short when the learner takes the
turn (voice barge-in or a typed message), reported as an `interruption` event. Implementation using only
supported calls: `setVolume({volume:0})` silences Nova immediately, mic is unmuted if needed,
`sendUserActivity()` signals the learner is taking the floor. Audio is restored (respecting the learner's
own "mute Tutor audio" setting) on `onInterruption`, on the learner's next transcribed/typed turn
(`onMessage` role user), or after Nova has been in `listening` mode for 1.2s (WebRTC mode comes from
LiveKit's server-side active-speaker detection, so it's unaffected by the local volume). Button is
disabled ("Stopped - your turn") while an interrupt is pending, so repeat clicks can't stack.

### Remaining limitations / unresolved
- **Interrupt is client-side silencing**: if the learner says nothing, the server still finishes
  generating that (now silent) turn; its transcript still appears in the chat log. A true server-side
  cancel needs an SDK/API capability that 1.21.0 doesn't have.
- A pause > ~1.2s in the middle of Nova's interrupted reply could make the remainder audible again.
- Lease takeover across *different devices* is detected only on the next heartbeat (<= 20s), so both
  devices could be live for up to ~20s after a takeover. Same-browser takeovers are immediate.
- Chrome's intensive timer throttling of long-hidden tabs (tabs *without* audio, e.g. sitting on the
  Join screen) can delay heartbeats past 90s; that tab then just sees "moved to another tab" if someone
  else took the lease.
- `/tutor/start` still overwrites `elevenlabsConversationId` with the latest conversation (same as
  before; one row per session, not a history).
- Refreshing the *owning* tab still abandons the session (pre-existing behaviour, intentionally kept).
- Not addressed (out of Phase 1 scope): C5 (60fps re-render of the whole workspace from the waveform
  loop), C6/C7/C8 (tool first-call race, approval-slot race, unmounted overflow panels), P1/P2/P5 checks
  in the ElevenLabs dashboard (max duration / silence timeout / tools configured).

### Before first use
Run `npx convex dev` (or deploy) so `studyRoomTutorLeases` and the new mutations exist.

### Exact starting point for Phase 2
Performance + tool reliability, in this order:
1. **C5** - move the rAF waveform into its own small component (only running while visible) so
   `setLevels` no longer re-renders TutorCall/Workspace/Excalidraw ~60x/s; `React.memo(Workspace)`;
   stable `excalidrawAPI`/`onChange` callbacks in `WhiteboardPanel.tsx:122-125`.
2. **C6** - `Workspace.tsx` tool handlers: await panel mount/ref readiness instead of returning "ask me
   again" (`whiteboardAddDiagram`, `codeWrite`, `noteCreate`, `noteRestructure`).
3. **C7** - queue approvals in `Workspace.tsx:requestApproval` (single resolver/timer slot today).
4. **C8** - keep overflow panels mounted-but-hidden so refs/context stay valid.
5. Dashboard verification (P1/P2/P5): check terminated conversations in ElevenLabs Conversation History
   using `studyRoomSessions.elevenlabsConversationId`; confirm the 8 client tools + response timeouts
   >= 30s.

---

## PAUSED HERE (2026-11-16) - resume point for tomorrow

Session paused mid-work at the user's request. Everything below this point and down to the next
`---` is new since the last pause; the rest of this file (M1-M5, the 2026-11-15 greeting fix, all
"ACTION REQUIRED" sections) is unchanged and still accurate. Two things to pick up tomorrow:

### A. Duplicate Study Rooms bug - fixed in code, not yet verified

**What was observed**: the Dashboard showed two Study Room cards with identical title/topic/
objective, each with its own single session (not one room with two sessions - two separate
`studyRooms` rows).

**Root cause**: "Start Learning" (`app/(routes)/study-room/create/page.tsx`) calls two mutations
back to back - `CreateStudyRoom` then `StartStudyRoomSession` - and neither had any
duplicate-submission protection server-side. The form's own `saving` state + disabled button only
guards against a double-click on the *same mounted form instance*; it cannot stop a second,
independent submission from a different page load (e.g. the first request felt slow/stuck, the
learner navigated back and re-clicked a "Start Learning in AI Study Room" link, or resubmitted a
fresh copy of the form, while the first request was still quietly completing in the background).
Both submissions succeed independently, each creating its own room + session.

**Fix applied** (`convex/StudyRoom.ts`, both mutations - no UI code changed):
- `CreateStudyRoom`: before inserting, now checks whether this same user already created a room
  with the same trimmed `title` + `topic` (and the same linked Study Planner `studyTaskId`, when
  present) within the last 30 seconds. If found, returns that existing room's id instead of
  inserting a near-duplicate.
- `StartStudyRoomSession`: before inserting, now checks whether the target room already has an
  `in_progress` session started within the last 30 seconds. If found, returns that existing
  session's id instead of inserting a second one - otherwise a deduplicated room from the fix above
  could still end up with two sessions.
- Window chosen (30s) is meant to catch rapid accidental retries, not block a learner who
  intentionally starts a second, genuinely new room on the same topic later.

**Not yet done**: not tested (per "don't test myself"). On resume: try the actual repro (start
creating a room, and - ideally on a throttled/slow connection - navigate back and submit again
before the first one would have finished) and confirm only one room+session results. Also worth
just confirming the two existing duplicate rooms from the screenshot still need manual cleanup -
this fix prevents *new* duplicates, it does not merge or delete the ones already created.

### B. Tutor-operated Whiteboard/Code/Notes during live sessions - code is written, dashboard setup is the remaining gap

This isn't a new bug - it's the same outstanding item M3's "ACTION REQUIRED" section (further down
this file) has flagged since M3 was built, restated here because it came up again and is an easy
thing to lose track of:

- **The code side is fully implemented**: 8 ElevenLabs "Client Tools" (`get_workspace_context`,
  `open_workspace_tool`, `create_whiteboard_diagram`, `highlight_whiteboard_elements`,
  `clear_whiteboard`, `write_code`, `create_note`, `restructure_notes`), registered via
  `useConversationClientTool` in `Workspace.tsx`, each operating on the real mounted Excalidraw/
  Monaco/TipTap instance, persisting through Convex, and gating destructive actions behind
  `ToolApprovalBanner` (Approve/Decline, 30s auto-decline). During a live conversation, it's the
  **ElevenLabs agent's own LLM** that decides when to call one of these, based on its system
  prompt - nothing client-side parses tutor speech to trigger them.
- **What's still missing is two manual ElevenLabs-dashboard steps**, not code (see M3's "ACTION
  REQUIRED" section below for the full table/wording to paste in):
  1. Add all 8 Client Tools to the Study Room agent's configuration (name + parameter schema).
  2. Add a line to the agent's system prompt telling it these tools exist and when to use them.
- Until both are done, the three panels still work fine for **manual** use by the learner - only
  the Tutor's own ability to act on them during speech is gated on this.

### Quick checklist for tomorrow

1. Add the 8 Client Tools + system-prompt line to the Study Room ElevenLabs agent (M3's "ACTION
   REQUIRED" below has the exact table and wording).
2. Re-verify the 2026-11-15 greeting fix's remaining dashboard items (also still open, see that
   section): `{{first_message}}` field, "First message" override enabled, agent set to speak first,
   a voice assigned.
3. Manually delete/merge the two duplicate Study Rooms already created (the code fix only prevents
   new ones).
4. Try the duplicate-room repro described in part A above to confirm the fix holds.
5. Once the Tutor actually speaks and has its tools, do a real end-to-end pass: confirm it opens/
   draws on the Whiteboard, writes code, and takes notes unprompted when the conversation calls for
   it.

---

## FIX (2026-11-15): AI Tutor connected but never spoke / never started the tutorial

### Root cause

The Study Room Tutor agent's dashboard "First message" field is the literal variable reference
`{{first_message}}` (this was always the documented design - see M2's "ACTION REQUIRED" above,
written before this agent existed). ElevenLabs does **only** literal `{{var}}` substitution on that
field before TTS - the LLM never sees or translates it - so if the `first_message` dynamic variable
isn't present in the session's `dynamicVariables` payload, ElevenLabs has nothing to substitute and
the agent never produces an opening line (silently, not an error - the websocket stays connected).
The user confirmed this directly: setting a dashboard "Test Value" for `first_message` made the agent
speak in ElevenLabs' own test console, and without one it reported "Missing required dynamic
variables in first message: {'first_message'}".

Auditing the actual runtime payload (`app/api/study-room/tutor/start/route.ts` ->
`utils/studyRoomTutorContext.ts` -> `StudyRoomTutorSession.tsx` -> `TutorCall.tsx`'s
`conversation.startSession()`) confirmed the `first_message` key was **already** being included in
`dynamicVariables` end to end - `buildStudyRoomDynamicVariables` already set `first_message:
firstMessage` and `connection.dynamicVariables` was passed through unmodified at every hop. So the
*variable* was never actually missing from this app's own requests. Two real, separate gaps existed
alongside it, which is what was actually fixed:

1. **The greeting was hardcoded English regardless of the session's language**
   (`buildWelcomeMessage` in `utils/studyRoomTutorContext.ts` previously ignored `language` entirely),
   contradicting "use the selected Study Room language" and meaning any learner using a non-English
   `tutor_language` still heard/received an English `first_message`.
2. **The greeting never mentioned the selected difficulty level**, even though the dynamic-variable
   contract (and the agent's own system prompt) treats difficulty as a first-class piece of session
   context.
3. **No defensive fallback for an empty learner name inside the greeting builder itself** - it relied
   entirely on the caller (`route.ts`'s `convexUser.name || "there"`) never changing, instead of being
   correct on its own.

### Files modified

- `utils/studyRoomTutorContext.ts` - `buildWelcomeMessage` rewritten as a language- and
  difficulty-aware generator (see "First Message generation logic" below). `buildStudyRoomDynamicVariables`
  updated to pass `difficulty` and the already-resolved `language` into it. No dynamic variable *names*
  were renamed or removed - `first_message` (and every other key) is unchanged, per "use the exact
  variable names defined in ElevenLabs."
- `AI_STUDY_ROOM_IMPLEMENTATION_PROGRESS.md` - this section.

No other file needed a code change: `app/api/study-room/tutor/start/route.ts`,
`StudyRoomTutorSession.tsx` and `TutorCall.tsx` already built and forwarded `dynamicVariables` and
`overrides.agent.firstMessage` correctly (verified against the proven-working
`components/interview/InterviewCall.tsx`/`InterviewSession.tsx` pattern, which uses the exact same
`conversationToken` + `dynamicVariables` + `overrides.agent.{firstMessage,language}` shape and the
exact same `{{first_message}}`-dashboard-field trick, per that file's own code comments). Per
instruction, `components/interview/*`, `app/api/interview/*`, `convex/Interview.ts` and
`utils/elevenlabsContext.ts` were **not** touched - `utils/studyRoomTutorContext.ts` continues to only
import `normalizeLanguageCode` from the latter, unchanged.

### Dynamic variable changes

None of the 10 dynamic variable **names** changed (`learner_name`, `tutor_topic`,
`learning_objective`, `category`, `difficulty_level`, `learning_preferences`,
`additional_instructions`, `tutor_language`, `conversation_history`, `first_message`,
`integration_context` - unchanged, still exactly what M2/M5's "ACTION REQUIRED" sections told you to
enable on the agent). Only the **value** of `first_message` is now computed differently (localized +
difficulty-aware instead of English-only); every other variable's value logic is untouched.

### First Message generation logic

`buildWelcomeMessage` now:
- Resolves the session's language down to one of 8 built-in greeting languages (`en`, `bn`, `hi`,
  `es`, `fr`, `de`, `ar`, `zh` - the same set `utils/elevenlabsContext.ts` already supports for the
  Interview feature), falling back to English for any other language code so the greeting is never
  empty or broken for an unsupported language - `tutor_language` itself still carries the real
  requested code either way, so the agent can still attempt to converse in it even when the *greeting
  wording* falls back.
- Picks a resume-specific template (`RESUME_GREETING`) when `conversation_history` is non-empty
  (continuing a session), or a fresh-session template (`FRESH_GREETING`) otherwise, each hand-written
  per language rather than machine-translated at runtime (this file deliberately never calls an LLM -
  see its own top-of-file comment).
- Injects the learner's name (guarded with a `"there"` fallback inside the function itself now, not
  only at the caller), the topic, an optional objective clause (omitted entirely when there's no
  objective, in every language), and a localized difficulty word (`DIFFICULTY_WORD`, separate from the
  English-only `DIFFICULTY_LABEL` still sent as `difficulty_level` for the system prompt to read
  directly).
- Always returns a non-empty string and never interpolates `undefined`/`null` - every optional input
  is coalesced to `""` before use, matching rules 3's explicit requirements.

### Remaining configuration requirements (outside this session's reach - same constraint as every
prior milestone's "ACTION REQUIRED")

1. **Confirm the agent's dashboard "First message" field is exactly the literal text
   `{{first_message}}`** (per M2's original setup instructions) - this fix assumes that's already true
   per the user's own report; if it was changed to something else while debugging, it must be set back
   to this exact literal string.
2. **Confirm "First message" is enabled under the agent's Security -> Overrides settings.** If it
   isn't, `overrides.agent.firstMessage` is silently dropped by ElevenLabs and the dashboard-side
   `{{first_message}}` field (now correctly fed by this app either way) is the only thing standing
   between silence and a greeting - so this one matters even with the code fix in place.
3. **Confirm the agent is configured to speak first**, not to wait for the learner to speak first (an
   agent-level conversation-flow setting, separate from the override permission above). If the agent
   waits for the user, no first-message override or dynamic variable will ever cause it to speak
   automatically - this is the one failure mode that genuinely cannot be fixed from this app's code.
4. **Confirm a voice is assigned on the agent's Voice tab** - an agent with no TTS voice selected
   produces no audio even when it does generate a response.
5. Per rule 6, dashboard "Test Values" (like the one used to confirm the root cause above) must not be
   relied on for production - they only apply inside ElevenLabs' own test console, never to real
   sessions started by this app. Remove any Test Value set on `first_message` once the above is
   confirmed working end-to-end, so a stale Test Value never masks a real regression later.

Not tested (per explicit instruction) - on resume, start a fresh session and confirm Nova speaks the
localized greeting automatically; then resume an existing session and confirm the "welcome back"
variant; then, if a non-English `tutor_language` is in use, confirm the greeting itself is in that
language and not English.

---

## ACTION REQUIRED before M2 works: create the Study Room Tutor's ElevenLabs agent

I cannot create or configure agents on your ElevenLabs account myself (that would be an external,
billable action on your account taken without a live confirmation, and "don't test yourself" rules out
even a trial run) - the Mock Interview agent was clearly set up the same way, by hand, in the ElevenLabs
dashboard. All the application code that talks to this agent is done and wired up; it just needs an
agent id.

1. In the ElevenLabs dashboard, create a **new** Conversational AI agent (do not edit the existing Mock
   Interview agent - they must stay completely separate, which is also why a new `ELEVENLABS_AGENT_ID`-style
   variable is used below instead of reusing the existing one).
2. Set its **First message** field to the literal text `{{first_message}}` (same trick the Interview agent
   uses - the server always computes and sends the real greeting via `overrides.agent.firstMessage`, so the
   dashboard field is just a passthrough). Under Security, enable the **"First message" override**.
3. Give it a system prompt along these lines (adjust wording/voice/persona to taste - this is a starting
   point, not something that must be pasted verbatim):

   > You are Nova, an adaptive AI tutor running inside a one-on-one study session. The learner is
   > {{learner_name}}. The topic for this session is {{tutor_topic}}, under the category {{category}}
   > (leave this out if empty). Their learning objective: {{learning_objective}} (if empty, infer a
   > sensible objective for the topic). Their current level: {{difficulty_level}}. Their stated learning
   > preferences: {{learning_preferences}} (if empty, use a balanced mix of explanation and examples).
   > Additional instructions from the learner: {{additional_instructions}} (if empty, ignore).
   > If {{conversation_history}} is non-empty, this is a continuation of an earlier conversation with this
   > same learner on this same topic - briefly acknowledge picking back up, then continue naturally; do not
   > repeat your introduction. Teach interactively, not as a Q&A bot: introduce concepts progressively,
   > explain with concrete examples suited to {{difficulty_level}}, periodically ask a question to check
   > understanding, evaluate the learner's answer, and adjust your depth based on how they do - if they
   > struggle, re-explain more simply; if they do well, go deeper or move on. Keep responses conversational
   > and not too long. Respond in {{tutor_language}} if it is not English.
4. Enable the **Dynamic Variables** the prompt above references: `learner_name`, `tutor_topic`, `category`,
   `learning_objective`, `difficulty_level`, `learning_preferences`, `additional_instructions`,
   `tutor_language`, `conversation_history`, `first_message`. (These are sent by
   `app/api/study-room/tutor/start/route.ts` on every session start - see
   `utils/studyRoomTutorContext.ts` for exactly how each one is built.)
5. Pick whichever LLM/voice/model the dashboard offers, same as any other agent - nothing in this app's
   code depends on which one you choose.
6. Copy the new agent's id and set it as `ELEVENLABS_STUDY_ROOM_AGENT_ID` in your environment (see
   "Environment variables" below). The existing `ELEVENLABS_API_KEY` is reused as-is - no new API key is
   needed.

Until this is done, starting any Study Room session will show "The AI Tutor is not configured yet."
(the 500 response `app/api/study-room/tutor/start/route.ts` returns when the env var is missing) instead
of a crash - this was deliberate so the rest of the app keeps working either way.

---

## ACTION REQUIRED before M3 works: two things outside this session's reach

### 1. `npm install` - new dependencies were added to `package.json`, not installed

Four libraries were added to `dependencies` (Whiteboard, Code Editor, Notes - see "Libraries added"
below for why each was chosen). They are **not yet in `node_modules`** - installing packages is a
command I don't run myself, same as every other milestone. Run:

```
npm install
```

before opening any Study Room session - without this, every M3 page will fail to compile/render.

### 2. Configure 8 Client Tools on the Study Room Tutor's ElevenLabs agent

M3 gives the Tutor real control over the Whiteboard, Code Editor and Notes via ElevenLabs'
**Client Tools** feature (`useConversationClientTool`, confirmed in
`node_modules/@elevenlabs/react/dist/conversation/ConversationClientTools.d.ts` - these run in the
browser, so they can reach into the Excalidraw/Monaco/TipTap instances actually mounted on the page).
Like creating the agent itself in M2, adding tools to an existing agent's configuration is a dashboard
action on your ElevenLabs account that I can't perform. On the **same** Study Room Tutor agent from
M2 (not the Mock Interview one), add a Client Tool for each row below (Agent settings -> Tools -> Add
Tool -> Client):

| Tool name | Parameters | What it does |
|---|---|---|
| `get_workspace_context` | none | Read-only. Returns which tools are open plus a summary of the Whiteboard/Code Editor/Notes content, so the Tutor can answer questions about them without guessing. |
| `open_workspace_tool` | `tool` (string: `whiteboard`/`code`/`notes`) | Opens that panel for the learner. |
| `create_whiteboard_diagram` | `title` (string, optional), `nodes` (array of `{id, label}`), `edges` (array of `{from, to, label?}`) | Adds a labeled box-and-arrow diagram to the whiteboard. Additive only - never removes existing content. |
| `highlight_whiteboard_elements` | `labels` (array of strings) | Changes the color of whiteboard text/shapes whose label matches, to point something out. |
| `clear_whiteboard` | none | **Destructive** - asks the learner to approve first (a banner with Approve/Decline appears; 30s timeout auto-declines). |
| `write_code` | `language` (string, optional), `content` (string), `mode` (`replace` or `append`), `filename` (string, optional) | Writes to the active code file. `replace` on a non-empty file asks for approval first; `append` never does. |
| `create_note` | `heading` (string, optional), `content` (string) | Appends an AI-labeled block to Notes (never overwrites). |
| `restructure_notes` | `content` (string) | **Destructive** - replaces the entire Notes document; asks for approval first if there's existing content. |

Each handler is registered in `app/(routes)/study-room/session/[sessionId]/Workspace.tsx`. Tell the
agent's system prompt (from M2's ACTION REQUIRED) that it has these tools and when to use them - e.g.
add a line like: "You can see and act on the learner's Whiteboard, Code Editor and Notes using your
tools - call `get_workspace_context` before answering anything about them, and always prefer additive
actions (`create_whiteboard_diagram`, `write_code` with `mode: append`, `create_note`) over destructive
ones unless the learner clearly wants a full replacement."

Until these are configured, the three tool panels still work perfectly for manual use (the learner can
open/use/save them by hand) - only the Tutor's own ability to act on them is gated on this step, exactly
like M2's voice/text gating was on the agent's existence.

---

## ACTION REQUIRED for M5: add one Dynamic Variable to the Study Room Tutor agent

M5 adds a new `integration_context` dynamic variable (built server-side in `app/api/study-room/tutor/
start/route.ts` from whichever source module a room was optionally started from - Study Planner/
Question Bank/Resume Match Analyzer/Interview Review). It is sent on every session start exactly like
`conversation_history` already is, but the agent's system prompt needs to actually reference it:

1. On the same Study Room Tutor agent from M2/M3, add `integration_context` to the enabled Dynamic
   Variables list (Agent settings -> the same place `conversation_history` etc. were added).
2. Add a line to the system prompt such as: "If {{integration_context}} is non-empty, it contains
   context from another part of the app the learner came from (a Study Planner task, selected Question
   Bank questions, a Resume Match Analyzer gap analysis, or past Interview Review feedback) - use it to
   focus the lesson, but treat it as context to work from, not as fact about the learner you must repeat
   verbatim. If it's empty, ignore it."

Until this is added, integrated sessions still work (the room is created with its reference stored, and
the dashboard/room/task pages all show the "linked from X" badges correctly either way) - only the
Tutor's own awareness of that context depends on this one prompt addition.

## What exists right now (M1)

### A. Navigation
- Added "AI Study Room" entry to `app/(routes)/_components/Sidebar.tsx`'s `MenuOptions`, positioned right
  after "Practice Coach" and before "Question Bank" (grouping it with the other AI-interactive tools). Uses
  the `Bot` icon from `lucide-react`. All existing entries are untouched and still work.

### B. AI Study Room Dashboard (`/study-room`)
- `app/(routes)/study-room/page.tsx`: header with title/description + "Create Study Room" button, 4 overview
  stat cards (Total Study Rooms, Active Sessions, Completed Sessions, Recent Learning Activity = sessions in
  the last 7 days), "My Study Rooms" section with All/Active/Archived status filter pills, room cards grid,
  "Recent Sessions" section (cross-room, newest first), a welcoming empty state for zero rooms, a loading
  skeleton for the stat cards while queries are resolving, and a basic error state (shown if the
  "Continue Learning" mutation throws, with a "Try again" action).
- `app/(routes)/study-room/RoomCard.tsx`: title, topic, objective, last-accessed date, session count, an
  "In Progress" badge only when the room has a live session, "Open Room" (link to detail page) and
  "Continue Learning" (starts a new session and navigates to it) actions.
- `app/(routes)/study-room/SessionRow.tsx`: room title/topic, date, duration, status badge, and either
  "Continue" (links straight to the existing in-progress session) or "View Room" (completed/abandoned).
- `app/(routes)/study-room/types.ts`: shared types, `SESSION_STATUS_META`, `DIFFICULTY_LABELS`,
  `formatDateTime`, `formatDuration`.

### C. Create Study Room (`/study-room/create`)
- `app/(routes)/study-room/create/page.tsx`: title, learning topic (with the 6 example-topic suggestion
  chips from the approved MagicPath design), optional subject/category, optional learning objective,
  knowledge-level selector (Beginner/Intermediate/Advanced, defaults to Beginner), optional learning
  preference chips (Visual diagrams / Hands-on coding / Conceptual explanations / Step-by-step pacing),
  optional additional instructions, inline validation (title + topic required, red error banner), and
  Cancel/"Start Learning" actions. Submitting creates the room **and** immediately starts its first session
  (matching the approved design's single "Start Learning" CTA), then redirects to the session placeholder
  page below - no AI Tutor functionality runs.

### D. Room and Session Management
- `app/(routes)/study-room/[studyRoomId]/page.tsx`: room detail - info card (objective, category, difficulty,
  preferences, additional instructions), "Start New Session" action, a "more actions" menu (Rename /
  Archive-Unarchive / Delete, same custom-dropdown pattern as Study Planner's details page), and a list of
  every session that belongs to this room with date/duration/status and a "Continue" link for any session
  still in progress.
- `app/(routes)/study-room/[studyRoomId]/RenameRoomDialog.tsx`: shadcn Dialog + Input, title-only rename.
- `app/(routes)/study-room/[studyRoomId]/ConfirmDialog.tsx`: own copy (not imported from Study Planner, to
  keep the two modules independent as instructed) - used for both the archive/unarchive and delete
  confirmations.
- `app/(routes)/study-room/session/[sessionId]/page.tsx`: the landing page after starting or continuing a
  session. Shows room title/topic/objective, a "Session in progress" badge, and an explicit "End Session"
  button (the only way a session ever leaves `in_progress`). This is **the required M1 placeholder** -  it
  explicitly states "the full AI Tutor experience ... arrives in the next milestone" and implements no
  voice, Whiteboard, Code Editor, Notes, transcript or summary functionality. Once ended, the same page shows
  a "session has ended" state with duration and a link back to the room.

### Convex (`convex/StudyRoom.ts`, new file - independent module, does not import or query any
Study Planner / Question Bank / Interview table)
- Ownership helpers `requireOwnedRoom` / `requireOwnedSession` (same "missing id and someone else's id both
  read as not-found" pattern as `StudyPlanner.ts`).
- Queries: `GetUserStudyRooms`, `GetDashboardStats`, `GetRecentSessions`, `GetStudyRoomDetails`,
  `GetStudyRoomSession`.
- Mutations: `CreateStudyRoom`, `RenameStudyRoom`, `SetStudyRoomStatus` (archive/unarchive),
  `DeleteStudyRoom` (cascades its sessions), `StartStudyRoomSession`, `EndStudyRoomSession`.
- Every function takes `userId` explicitly from the caller and checks ownership, matching this app's
  existing Clerk-to-Convex pattern (`UserDetailContext`, populated in `app/Provider.tsx` from the
  authenticated Clerk session - unchanged, reused as-is, no duplicate user records).

### Convex schema (`convex/schema.ts`, additive only - nothing existing was changed)
- `studyRooms`: `userId`, `title`, `topic`, `objective?`, `category?`, `difficulty?`
  (beginner/intermediate/advanced), `learningPreferences?`, `additionalInstructions?`, `status`
  (active/archived), `lastAccessedAt?`, `createdAt`, `updatedAt`. Indexes: `by_user`, `by_user_status`.
- `studyRoomSessions`: `studyRoomId`, `userId`, `status` (in_progress/completed/abandoned), `startedAt`,
  `endedAt?`, `durationSeconds?`, plus three `v.optional(v.any())` placeholder fields - `transcript`,
  `workspaceState`, `summary` - reserved for M2+ (never read or written in M1). Indexes: `by_studyRoom`,
  `by_user`, `by_user_status`.

---

## Key architectural decisions (deviations worth flagging)

1. **Room status is `active`/`archived` only - never "Active/Completed/Paused" like a room card in the
   approved MagicPath mock.** A room is a reusable container the learner returns to for more sessions; it
   doesn't make sense for the *room* to be "completed". Session-level status (`in_progress` / `completed` /
   `abandoned`) carries that meaning instead, and room cards show an "In Progress" badge only when a live
   session exists. This was called out explicitly in the Dashboard section above rather than silently
   diverging from the reference.
2. **"Start Learning" in the Create Study Room form creates the room AND starts its first session in one
   step**, landing on the session placeholder page - matching the approved design's single CTA while staying
   entirely inside M1's boundaries (no tutor logic runs on that page).
3. **No subscription/plan gating was added.** The existing codebase has no per-feature usage-limit pattern
   anywhere in `app/(routes)` (checked - only the admin panel manages plan *definitions*), so none was
   invented for Study Room either, per "do not change existing subscription plans ... or billing behavior."
4. **No new `error.tsx` / `loading.tsx` Next.js route boundaries** - no other module in this codebase uses
   them, so loading/error states are handled inline in each page component instead, consistent with the rest
   of the app.
5. Followed `proxy.ts` (this project's Next 16 replacement for `middleware.ts`) as-is - `/study-room*` was
   already covered by the default "everything requires a signed-in Clerk session" rule, so no change was
   needed there.

---

## Full file inventory (everything under the AI Study Room module)

```
convex/schema.ts                                                      (modified - additive only, M1+M2+M3)
convex/StudyRoom.ts                                                   (new in M1, extended in M2)
convex/StudyRoomWorkspace.ts                                          (new - M3)
utils/studyRoomTutorContext.ts                                        (new - M2)
app/(routes)/_components/Sidebar.tsx                                  (modified - nav entry added, M1)
app/api/study-room/tutor/start/route.ts                               (new - M2)
app/api/study-room/tutor/end/route.ts                                 (new - M2)
app/api/study-room/code/run/route.ts                                  (new - M3)
app/(routes)/study-room/page.tsx                                      (new - Dashboard, M1)
app/(routes)/study-room/RoomCard.tsx                                   (new - M1)
app/(routes)/study-room/SessionRow.tsx                                 (new - M1)
app/(routes)/study-room/types.ts                                       (new - M1)
app/(routes)/study-room/create/page.tsx                                (new - M1)
app/(routes)/study-room/[studyRoomId]/page.tsx                         (new - M1)
app/(routes)/study-room/[studyRoomId]/RenameRoomDialog.tsx             (new - M1)
app/(routes)/study-room/[studyRoomId]/ConfirmDialog.tsx                (new - M1)
app/(routes)/study-room/session/[sessionId]/page.tsx                   (new in M1, rewritten in M2)
app/(routes)/study-room/session/[sessionId]/types.ts                   (new - M2)
app/(routes)/study-room/session/[sessionId]/StudyRoomTutorSession.tsx  (new - M2)
app/(routes)/study-room/session/[sessionId]/TutorCall.tsx              (new in M2, extended in M3)
app/(routes)/study-room/session/[sessionId]/workspaceTypes.ts          (new - M3)
app/(routes)/study-room/session/[sessionId]/Workspace.tsx              (new - M3)
app/(routes)/study-room/session/[sessionId]/WhiteboardPanel.tsx        (new - M3)
app/(routes)/study-room/session/[sessionId]/CodeEditorPanel.tsx        (new - M3)
app/(routes)/study-room/session/[sessionId]/NotesPanel.tsx             (new - M3)
app/(routes)/study-room/session/[sessionId]/ResizableSplitter.tsx      (new - M3)
app/(routes)/study-room/session/[sessionId]/ToolApprovalBanner.tsx     (new - M3)
app/(routes)/study-room/session/[sessionId]/SaveStatusBadge.tsx        (new - M4)
app/(routes)/study-room/session/[sessionId]/retryAsync.ts              (new - M4)
app/(routes)/study-room/session/[sessionId]/SessionCompletion.tsx      (new - M4)
app/(routes)/study-room/history/page.tsx                               (new - M4)
app/(routes)/study-room/history/HistorySessionRow.tsx                  (new - M4)
convex/StudyRoomWorkspace.ts                                          (extended - M4, conflict detection + RecordCodeRun)
utils/studyRoom/geminiClient.ts                                       (new - M4)
utils/studyRoom/summarySchema.ts                                      (new - M4)
utils/studyRoom/summaryPromptBuilder.ts                               (new - M4)
utils/studyRoom/summaryGenerator.ts                                   (new - M4)
app/api/study-room/summary/generate/route.ts                          (new - M4)
app/(routes)/study-room/page.tsx                                      (modified - M4, learning-time stat + recent topics + history link)
app/(routes)/study-room/types.ts                                      (modified - M4, DashboardStats/SessionHistoryEntry fields)
app/(routes)/study-room/[studyRoomId]/page.tsx                         (modified - M4, "View" link for ended sessions)
app/(routes)/study-room/session/[sessionId]/page.tsx                  (rewritten - M4, now renders SessionCompletion)
app/(routes)/study-room/session/[sessionId]/TutorCall.tsx              (modified - M3 workspace integration unchanged by M4)
app/api/study-room/tutor/end/route.ts                                 (modified - M4, ends as "abandoned" not "completed")
package.json                                                          (modified - 4 new deps, M3 only - M4 added none)
```

Note: `convex/StudyRoom.ts` (extended again - M4: `GetSessionHistory`, `GetDashboardStats` additions,
`EndStudyRoomSession`'s new `reason` arg, `BeginSummaryGeneration`/`SaveSessionSummary`/
`MarkSummaryFailed`/`GetSessionSummary`) and `convex/schema.ts` (additive-only again - M4 fields listed
below) are also modified, as in every prior milestone.

No other files were touched - in particular, `components/interview/*`, `app/api/interview/*`,
`convex/Interview.ts` and `utils/elevenlabsContext.ts` are completely unmodified (the last is only
*imported from*, for its generic `normalizeLanguageCode` helper). Nothing has been committed to git -
everything above is in the working tree only.

---

## MagicPath references used

| Screen | Reference | Used for M1? |
|---|---|---|
| AI Study Room Dashboard | https://designs.magicpath.ai/v1/brave-shade-2879 | Yes (M1) - layout, stat cards, room cards, recent sessions, empty state. Unchanged in M2. |
| Create Study Room | https://designs.magicpath.ai/v1/eagerly-land-8410 | Yes (M1) - form fields, topic chips, knowledge-level selector. Unchanged in M2. |
| Active Study Room | https://designs.magicpath.ai/v1/safely-noon-3735 | Yes (M2) - avatar, status badge, waveform, welcome message, tool-shortcut row, bottom control bar |
| Study Room Workspace | https://designs.magicpath.ai/v1/readily-star-5506 | Yes (M3) - panel arrangement, resize/maximize/close, responsive breakpoints |
| Tutor Conversation & Transcript | https://designs.magicpath.ai/v1/sturdy-cliff-7270 | Yes (M2) - the slide-over text chat panel, message bubbles, tutor/learner distinction |
| Whiteboard / Code Editor / Notes Tools | https://designs.magicpath.ai/v1/softly-rock-5733, https://designs.magicpath.ai/v1/sweet-bay-9059, https://designs.magicpath.ai/v1/sturdy-rock-1702 | Yes (M3) - toolbar/panel layout for each tool |
| Lesson Summary | https://designs.magicpath.ai/v1/steady-shadow-8159 | Yes (M4) - summary section layout, topics/concepts/definitions/examples, observed-vs-assessed grouping |
| Session Completion | https://designs.magicpath.ai/v1/solid-flood-4301 | Yes (M4) - completion header, saved-workspace indicators, transcript/notes access, the 4 action buttons |

The app's real color theme (`app/globals.css` - orange primary, cream background, same card/border/radius
tokens already used by Study Planner and Question Bank) was used throughout, not a new palette - the
MagicPath designs' own light theme already matched it exactly (confirmed during the MagicPath design phase
itself), so no visual decisions needed to be reconciled here.

---

## What exists right now (M2)

### AI Tutor architecture
- **A completely separate ElevenLabs agent** from the Mock Interview feature. New env var
  `ELEVENLABS_STUDY_ROOM_AGENT_ID` (see "ACTION REQUIRED" above); reuses the existing
  `ELEVENLABS_API_KEY`. Nothing under `components/interview/`, `app/api/interview/`, `convex/Interview.ts`
  was touched - the Interview agent's id, prompt, settings and live calls are completely unaffected.
- **No separate LLM call is made for live conversation**, and this is intentional, not a gap: exactly like
  the Interview feature, the actual conversational responses are produced by the ElevenLabs Conversational
  AI agent's own configured LLM, reached through the same real-time WebRTC session - this app has never
  called an LLM directly per-turn for live voice, and Study Room follows that same existing architecture
  rather than inventing a second one. "Reuse the existing LLM provider integration" is satisfied by reusing
  that delegation pattern.
- `utils/studyRoomTutorContext.ts`: builds the dynamic variables (topic, objective, category, difficulty,
  preferences, additional instructions, language, a condensed `conversation_history` of up to the last 20
  turns for a resumed session) and the topic-aware welcome first message. Only imports
  `normalizeLanguageCode` from `utils/elevenlabsContext.ts` - everything else is new and Study-Room-only.

### Active Study Room interface (`/study-room/session/[sessionId]`, when the session is `in_progress`)
- `StudyRoomTutorSession.tsx`: fetches a connection token from `/api/study-room/tutor/start` (loading/error/
  retry), then renders `TutorCall` inside `<ConversationProvider>` - mirrors
  `components/interview/InterviewSession.tsx`'s pattern exactly.
- `TutorCall.tsx`: the full Active Study Room UI matching the approved design - room title/topic header,
  Nova avatar, a status badge (Connecting / Listening to you / Thinking / Speaking / Connection lost), a
  **real** voice-activity waveform (sampled every frame from the SDK's own `getInputByteFrequencyData()` /
  `getOutputByteFrequencyData()`, not a CSS animation), the topic-aware welcome message, three disabled
  Whiteboard/Code/Notes shortcut buttons labeled "Available in Milestone 3", a slide-over text conversation
  panel, and a persistent bottom bar (Interrupt, Chat toggle, Mic mute, Tutor-audio mute, End Session).
- A gesture-gated "Join Session" screen requests microphone access before `startSession()` is ever called -
  same reasoning as `InterviewCall.tsx` (browser mic-permission UX plus avoiding React Strict Mode's
  dev-only double-mount tearing down a session that started from a mount effect).
- A connection-lost overlay (`status === "error"`) offers a "Reconnect" button that re-runs the same join
  flow, fetching a fresh token and feeding the agent the conversation so far via `conversation_history`.

### Voice interaction
- Real-time, via `@elevenlabs/react`'s `useConversation` (same package/hook the Interview feature uses).
  Mic permission denial is caught and shown inline. `conversation.mode` ("speaking"/"listening") drives the
  status badge and waveform; `status` ("disconnected"/"connecting"/"connected"/"error") drives the
  join/connecting/reconnect states.
- **"Interrupt" is implemented honestly, not faked**: the SDK exposes no "force-stop the agent's TTS"
  control. Clicking Interrupt unmutes the mic (if muted) and calls the real `sendUserActivity()` SDK method -
  ElevenLabs' own voice-activity detection then naturally lets the learner barge in, exactly like a real
  conversation. This is documented here so it's never mistaken for a fabricated capability.
- Mute/unmute via `conversation.setMuted()`; a separate Tutor-audio mute via `conversation.setVolume()`.

### Text interaction
- `conversation.sendUserMessage(text)` injects a typed message into the **same live session** - voice and
  text are two input channels on one conversation, never two separate ones, so switching between them never
  loses context. A "thinking" indicator (animated dots) shows between the learner's turn and the Tutor's
  reply. Every message (voice or text, either direction) is timestamped and distinguished by role/background
  color in the chat panel.

### Adaptive teaching behavior
- This lives in the ElevenLabs agent's own system prompt (see "ACTION REQUIRED" for the recommended prompt
  text covering progressive explanation, examples, assessment questions, feedback and difficulty
  adjustment) plus the dynamic variables this app feeds it every session start. No code-side "teaching
  logic" exists or is needed beyond building and sending that context correctly.

### Convex persistence (M2 additions)
- New table `studyRoomMessages`: `studyRoomSessionId`, `userId`, `role` (tutor/learner), `text`, `source`
  (voice/text, learner-only), `createdAt`. Indexed `by_session` and `by_session_createdAt`. No raw audio is
  ever stored - only transcribed text, exactly as instructed.
- `studyRoomSessions` gained `elevenlabsConversationId` (set on connect, overwritten on each reconnect).
- New queries/mutations in `convex/StudyRoom.ts`: `SaveStudyRoomElevenLabsConversation`,
  `AppendStudyRoomMessage`, `GetStudyRoomMessages`. `GetStudyRoomSession`'s `room` payload was extended with
  `category`/`difficulty`/`learningPreferences`/`additionalInstructions` (needed by the Tutor context
  builder). Every M1 record and query remains valid and unchanged - this was purely additive.
- The M1 `studyRoomSessions.transcript` placeholder field is now superseded/unused (see the schema comment)
  in favor of the dedicated `studyRoomMessages` table - a deliberate refinement, not an oversight.

### Session management (M2)
- Start: `/study-room/create` or "Continue Learning" (M1, unchanged) -> lands on
  `/study-room/session/[sessionId]` -> Tutor connects automatically once the learner clicks "Join Session".
- Continue/Resume: reopening an `in_progress` session's URL re-runs the exact same flow, with
  `conversation_history` giving the agent context from every prior turn.
- Pause: simply navigating away (or muting) leaves the session `in_progress` with its history intact -
  there is no separate "pause" state beyond this, which is an intentional simplification (see "Known open
  items" below).
- End: the "End Session" button calls `conversation.endSession()` then the existing M1
  `EndStudyRoomSession` Convex mutation directly; a `beforeunload` -> `sendBeacon("/api/study-room/tutor/end")`
  handler (mirroring `InterviewCall.tsx`) catches a closed/refreshed tab so a session never stays
  `in_progress` forever by accident.
- Ending a session never touches Study Planner, and conversation history is left fully intact in
  `studyRoomMessages` for M4's summary feature to read later.

## What exists right now (M3)

### Libraries added (and why)

- **Whiteboard: Excalidraw** (`@excalidraw/excalidraw`), not tldraw. tldraw's SDK requires a commercial
  license (or shows a permanent "Made with tldraw" watermark) for production use beyond non-commercial/
  eval use - that doesn't fit a paid SaaS product. Excalidraw is MIT-licensed with no such requirement
  and already covers nearly every required feature out of the box (zoom/pan, selection, freehand draw,
  shapes, text, arrows/connectors, eraser, color/line-style controls, undo/redo, export).
- **Code Editor: Monaco** via `@monaco-editor/react`. Loads the Monaco runtime from a CDN by default (no
  custom webpack/worker configuration needed in Next.js) - this means the Code Editor needs normal
  internet access to load the first time, which is an accepted tradeoff for avoiding build-config risk
  in a milestone that can't be tested before handing off.
- **Notes: TipTap** (`@tiptap/react` + `@tiptap/starter-kit` + `@tiptap/extension-task-list` +
  `@tiptap/extension-task-item` + `@tiptap/extension-highlight` + `@tiptap/extension-placeholder`) -
  StarterKit covers headings/paragraphs/bold/italic/lists/code blocks/blockquotes; the four extra
  packages add checklists and text highlighting, which StarterKit doesn't include.
- **No new resizable-panel library** - `ResizableSplitter.tsx` is a small hand-rolled drag handle instead,
  to keep the dependency footprint consistent with the rest of the app (which has no other heavy layout
  library).
- **Code execution: Piston** (`https://emkc.org/api/v2/piston`), a free, public, purpose-built "run
  untrusted code safely" service - no API key needed, so nothing is exposed to the browser either way.
  `app/api/study-room/code/run/route.ts` proxies to it (never executes on the Next.js server itself),
  resolving each language's current version from Piston's own `/runtimes` endpoint instead of hardcoding
  version strings that go stale. Overridable via an optional `PISTON_API_URL` env var if a self-hosted
  instance is ever preferred.

### Multi-panel Workspace (`Workspace.tsx`)

- Renders inside `TutorCall.tsx`'s main area, toggled with the existing centered-avatar view via CSS
  `display` (both stay mounted at all times - switching never unmounts Excalidraw/Monaco/TipTap, so
  content and undo history survive switching back and forth, satisfying "preserve each tool's content
  when switching panels").
- The three tool shortcut buttons from M2 (previously disabled, "Available in Milestone 3") now call
  `workspaceRef.current.openTool(...)` to open a real panel.
- Up to 3 panels open at once; a hand-rolled `ResizableSplitter` between adjacent open panels lets the
  learner drag to resize (flex-grow weights, not pixel widths). Each panel header has maximize/restore
  and close buttons.
- Responsive breakpoints (matching the Part 6 MagicPath design): **mobile** (<768px) shows exactly one
  open tool at a time with a side icon-rail to switch; **tablet** (768-1023px) shows at most 2
  side-by-side, with an "Also open" chip row for any 3rd; **desktop** (>=1024px) shows all open tools
  side by side. Implemented with a `window.innerWidth` + `resize` listener, same technique as the
  MagicPath-approved workspace design.
- Layout (which tools are open, which is active) is persisted per-session via
  `GetWorkspaceLayout`/`SaveWorkspaceLayout` (debounced) so reopening a session restores the same
  panels, not just their content.

### Whiteboard (`WhiteboardPanel.tsx`)

- Wraps Excalidraw (loaded client-only via `next/dynamic`, since it touches `window` at import time).
  Debounced (800ms) `onChange` -> `SaveWhiteboardSnapshot`; the saved scene is re-applied once on load.
- AI Tutor integration lives in `Workspace.tsx`, operating on the real `ExcalidrawImperativeAPI` handed
  up via the `excalidrawAPI` prop callback: `create_whiteboard_diagram` builds a node-and-arrow layout
  with Excalidraw's own documented `convertToExcalidrawElements` skeleton helper (dynamically imported
  only at call time, so it's never touched during any server-side render pass) and adds it additively;
  `highlight_whiteboard_elements` recolors matching existing elements; `clear_whiteboard` calls
  `resetScene()` **after learner approval** via the shared `ToolApprovalBanner`.
- **This is the one piece of M3 most worth a hands-on check before trusting it**: `@excalidraw/excalidraw`
  was never installed or run in this session (per "don't test yourself"), so `convertToExcalidrawElements`'s
  exact behavior is based on Excalidraw's documented public API, not a verified `.d.ts` read like M2's
  ElevenLabs integration was. The diagram-generation tool is wrapped in try/catch and fails gracefully
  with a spoken-back error string rather than crashing if anything about that assumption is off - ask
  the Tutor to draw a simple diagram first thing after `npm install`.

### Code Editor (`CodeEditorPanel.tsx`)

- Monaco editor with file tabs (multiple files per session, `+` to add, `x` to close), a language
  dropdown (12 languages, each mapped to both a Monaco syntax id and a Piston execution id), Run/Stop
  (aborts the in-flight fetch), a console panel showing stdout/stderr/exit code/compile errors, Copy, and
  Clear (clears the console output, not the code). Content is debounce-saved (600ms) per file via
  `UpdateCodeFile`; a default `main.py` file is created automatically the first time a session's Code
  Editor is opened.
- AI Tutor integration: `write_code` (replace or append) and a read path (`get_workspace_context`
  includes the active file's content and last run result) exposed via a `forwardRef`/`useImperativeHandle`
  handle (`CodeEditorHandle`). `replace` on a non-empty file requires learner approval first; `append`
  never does, matching the "preserve existing content unless approved" rule.
- The Tutor never triggers a run itself in this milestone - only the learner's own Run button executes
  code. This was a deliberate scope narrowing (not asked for explicitly, but "Help correct errors" /
  "Review code" only need read access to the code and its last output, not the ability to re-run it
  unprompted) - flagged here so it isn't mistaken for an oversight.

### Notes (`NotesPanel.tsx`)

- TipTap editor with a toolbar (bold/italic/bullet+numbered lists/checklist/code block/highlight),
  editable title, a save-state indicator ("Saving..."/"Saved"), a lightweight search (scrolls to and
  briefly highlights the first DOM match - not a full find-all, kept simple since TipTap has no built-in
  search), Copy (plain text), and Export (converts the document to Markdown via a small hand-written
  HTML->Markdown walker and downloads a `.md` file).
- AI-generated content is visually distinguished: `create_note` inserts a small blockquote line
  ("🤖 Added by Nova") immediately above the appended content, using TipTap's standard blockquote node
  rather than a custom schema extension (safer - no custom node type to get wrong without testing).
- AI Tutor integration: `create_note` (always additive) and `restructure_notes` (replaces the whole
  document - **requires learner approval** if there's existing content), both exposed via the same
  `forwardRef`/`useImperativeHandle` pattern as the Code Editor.

### Central AI Tutor tool orchestration

- No second AI engine was created for the tools - every tool call is a **Client Tool** on the exact same
  Study Room Tutor ElevenLabs agent from M2, registered with the real, confirmed-to-exist
  `useConversationClientTool(name, handler)` hook (`node_modules/@elevenlabs/react/dist/conversation/
  ConversationClientTools.d.ts`) inside `Workspace.tsx`, which is always mounted once a session is joined
  (regardless of which panel is visible), so the tools are available to the agent for the whole session.
- 8 tools total - 1 read-only (`get_workspace_context`), 1 pure navigation (`open_workspace_tool`), and 6
  that mutate a tool's content. Every mutating handler validates its own inputs defensively, then calls
  the same Convex mutation a manual edit would use - `requireOwnedSession` enforces ownership server-side,
  and `StudyRoomWorkspace.ts` additionally caps note/code length server-side regardless of what the
  client already trimmed ("validate every action on the server" from the spec).
- **Destructive actions require explicit learner approval**: `clear_whiteboard`, `write_code` with
  `mode: "replace"` on non-empty content, and `restructure_notes` on non-empty content each call
  `requestApproval(tool, description)`, which shows `ToolApprovalBanner` and returns a Promise that
  resolves "approved"/"rejected"/"timed_out" (30s auto-decline so a live voice turn never hangs
  indefinitely waiting on the UI). Additive actions (`create_whiteboard_diagram`,
  `highlight_whiteboard_elements`, `write_code` with `mode: "append"`, `create_note`) never ask, matching
  "preserve existing content unless the learner approves replacement."
- Every tool call's outcome (applied/rejected/timed_out) is logged via `LogToolAction` into the new
  `studyRoomToolActions` table - nothing currently reads this back in the UI; it exists as an audit trail
  for a future milestone.

### Convex persistence (M3 additions)

- New tables: `studyRoomWhiteboards` (one Excalidraw scene snapshot per session), `studyRoomCodeFiles`
  (one row per file/tab, ordered), `studyRoomNotes` (one TipTap document per session),plus
  `studyRoomWorkspaceLayout` (which tools are open/active) and `studyRoomToolActions` (the audit trail
  above). All scoped to `studyRoomSessionId`, not the room - reopening a session restores exactly that
  session's workspace; a new session in the same room starts every tool empty, same as
  `studyRoomMessages` already works.
- New module `convex/StudyRoomWorkspace.ts` (split from `StudyRoom.ts` purely for file size) - same
  independence rules, same `userId`-scoped ownership pattern via its own `requireOwnedSession` helper.
- Every M1 and M2 table/query/mutation is untouched; this was purely additive.

## What exists right now (M4)

### Session History (`/study-room/history`)

- New page, linked from the Dashboard's "Recent Sessions" header ("View All Sessions"). Search (by room
  title/topic/category), a date filter (All time/Last 7/Last 30 days), and status pills
  (All/In Progress/Completed/Abandoned), all client-side over `GetSessionHistory` (new query - every
  session across every room, newest first, enriched with room title/topic/category and `summaryStatus`).
  Loading skeleton, "no sessions yet" empty state, and a distinct "no results for this filter" state.
- `HistorySessionRow.tsx` links every row straight to `/study-room/session/[sessionId]` regardless of
  status (unlike the Dashboard's own `SessionRow`, which sends a completed session to its room page first -
  left as-is as a deliberately small footprint, since the Dashboard's existing "Recent Sessions" behavior
  already satisfies "open previous sessions" and wasn't asked to be redesigned).
- Fixed one real gap this surfaced: `app/(routes)/study-room/[studyRoomId]/page.tsx`'s own session list
  only ever linked `in_progress` sessions ("Continue") and had **no link at all** for completed/abandoned
  ones - a direct conflict with "allow users to open previous sessions." Added a "View" link for those,
  reusing the exact same `Link`/styling already there for "Continue." This is the one existing-screen
  change in M4 beyond what the milestones explicitly called for, and it's a one-line gap-fix, not a
  redesign.

### Dashboard additions (`/study-room`)

- Added a 5th stat card, **Total Learning Time** (`formatDuration` over `GetDashboardStats`'s new
  `totalLearningSeconds`, summed from every session's real `durationSeconds` - never estimated), and a
  **Recently studied** chip row (`recentTopics` - up to 5 distinct room topics from the most recent
  sessions). Both computed live in `GetDashboardStats`, not a new denormalized counter anywhere.
- Nothing else on the Dashboard changed - same stat-card grid, same My Study Rooms/filters/empty/loading/
  error states as M1.

### Complete Workspace Persistence (M4 hardening of M3's save paths)

- **Save/saved/save-error indicators**: new shared `SaveStatusBadge.tsx` ("Saving...", "Saved", or
  "Save failed - retry" with a retry button) now shown in all three tools - Whiteboard (top-right corner
  over the canvas), Code Editor (next to the language dropdown, per open file), and Notes (next to the
  title, replacing M3's plain text label).
- **Retry with backoff**: `retryAsync.ts` (3 attempts, exponential backoff) wraps every save call in all
  three tools - "handle network interruptions and reconnection" without a bespoke retry loop per tool.
- **Skip unchanged saves**: each tool now tracks the last *successfully saved* content and compares
  before scheduling a network call at all - a debounce firing with no real change (e.g. clicking into and
  back out of the editor) no longer writes to the database.
- **Conflict detection** ("prevent accidental overwriting of newer saved content"): `SaveWhiteboardSnapshot`,
  `UpdateCodeFile` and `SaveNotes` now take an optional `expectedUpdatedAt`; if the stored row's
  `updatedAt` is newer than that (something else wrote more recently - another tab, or a Tutor tool
  action), the save is skipped server-side and the client gets `{ok:false, conflict:true}` back instead of
  blindly overwriting, surfacing the save-error state rather than losing the other write. This is a
  lightweight last-write-wins guard, not a merge/CRDT - documented as adequate for this module's actual
  scenario (one learner, one session) rather than overbuilt for multi-device simultaneous editing.
- **Code Editor execution history**: `studyRoomCodeFiles.lastRun` (stdout/stderr/exitCode/ranAt) now
  persists the *most recent* run per file via a new `RecordCodeRun` mutation, called right after
  `/api/study-room/code/run` returns (success or failure, never for a Stop-triggered abort). Reopening a
  session, or just switching tabs, shows that file's last output again instead of a blank console - a
  full per-run history table was deliberately not built ("where appropriate" in the spec, and nothing
  asked for a run-by-run log).
- **Whiteboard canvas settings**: the saved snapshot now also includes `appState.viewBackgroundColor`,
  restored on reopen (M3 only ever saved `elements`).
- **Workspace layout**: `maximizedTool` and `panelWeights` (M3 defined a `panelSizes` field but never
  actually wired it up) are now genuinely saved/restored, alongside M3's `openTools`/`activeTool` - a
  single debounced effect in `Workspace.tsx` persists all four together whenever any of them change.
- **Tutor conversation persistence** was already complete as of M2/M3 (`studyRoomMessages`'
  role/text/source/createdAt is exactly the "conversation messages/history/interaction metadata" asked
  for here) - nothing new was added for it in M4, which is a deliberate "already satisfied," not a gap.

### AI-Generated Lesson Summary

- **Architecture**: a direct Gemini call (`utils/studyRoom/geminiClient.ts`, mirroring
  `utils/questionBank/geminiClient.ts` exactly - same `GEMINI_API_KEY`, its own
  `GEMINI_STUDY_ROOM_MODEL` override, defaulting to `gemini-2.5-flash`), triggered from a new API route
  (`app/api/study-room/summary/generate`), never from the ElevenLabs Tutor pipeline. "Reuse the existing
  LLM provider integration" is satisfied by reusing this app's one other direct-Gemini pattern (Question
  Bank), not by inventing a third approach.
- **Structured output**: `utils/studyRoom/summarySchema.ts` (zod) + a matching Gemini `responseSchema`
  (`summaryGenerator.ts`, same `responseMimeType: "application/json"` pattern as
  `questionGenerator.ts`) - `overview`, `topicsCovered`, `keyConcepts`, `definitions`, `examples`,
  `qaExchanges` (real question/response pairs lifted from the transcript), `understoodWell`,
  `areasForImprovement`, `misunderstandings`, `revisionTopics`, `nextActivities`. Every array may be
  empty - the prompt (`summaryPromptBuilder.ts`) explicitly instructs the model to return an empty array
  rather than invent content for a category the transcript doesn't support, which is what "do not invent
  learner performance" and "generate only when sufficient information is available" require at generation
  time, not just as UI copy.
- **Inputs**: the full transcript (`studyRoomMessages`), plus up to 3 code files' content (truncated),
  a plain-text excerpt of Notes (HTML tags stripped server-side), and any text labels found on the
  whiteboard - so the summary can reference what was actually built, not only what was said out loud.
- **Minimum-data gate**: the route refuses to call Gemini at all (`{ insufficient: true }`) when a
  session has fewer than 4 total messages or zero learner messages - "generate only when sufficient
  session information is available" enforced before spending an LLM call, not after.
- **Duplicate-generation guard**: `BeginSummaryGeneration` only transitions a session's
  `summaryStatus` to `"generating"` from `"none"`/`"failed"` (auto-trigger) or from any state when
  `force: true` (an explicit "Regenerate" click) - never from `"generating"` itself, so two concurrent
  requests can't both start a generation ("duplicate summaries are avoided"). The summary always lives on
  the same `studyRoomSessions` row, patched in place - never a second record.
- **UI distinguishes observed vs. AI-assessed**: the Session Completion screen's "From Your Conversation"
  section (topics/concepts/definitions/examples/Q&A) is presented as what happened; "Tutor's Assessment
  (AI-generated, not a grade)" and "Recommended Next Steps" are visually separated and labeled as the
  model's own judgment, not fact.
- **Regenerate**: a "Regenerate" button appears once a summary is `"ready"`, calling the same route with
  `force: true`.

### Session Completion Screen (`SessionCompletion.tsx`, rendered by `session/[sessionId]/page.tsx`
whenever a session's status is `completed` or `abandoned`)

- Branches its messaging: a success-toned header for `completed` ("Nice work! You've completed this
  learning session.") vs. a warning-toned one for `abandoned` ("This session ended unexpectedly - but
  don't worry, everything you worked on was saved.") - same component, same data, different framing,
  since both are "the session's over" states that need the same summary/transcript/notes access.
- Title/topic/duration header, three saved-content indicators (Whiteboard/Code/Notes, each checked
  against the real `StudyRoomWorkspace` queries - "no fabricated completeness"), the Learning Summary
  section described above, collapsible "Lesson Notes" (read-only rendered HTML, only shown if Notes has
  content) and "Complete Transcript" sections, and the four actions: **Review the Session** (expands both
  collapsible sections and scrolls to them), **Continue Learning** (starts a new session in the *same*
  room via the existing `StartStudyRoomSession`), **Study Room Dashboard**, and **Start Another Study
  Room** (-> `/study-room/create`, a *different* room). Nothing about ending a session or viewing its
  completion page ever deletes or touches its saved Whiteboard/Code/Notes/transcript content.

### Learning Progress

- Entirely the Dashboard additions described above (Total Learning Time, Recently studied topics) plus
  the already-existing stat cards (Total Study Rooms, Active/Completed Sessions, Recent Learning
  Activity) - all computed live from `studyRooms`/`studyRoomSessions`, nothing artificial, and nothing
  outside the Study Room module was touched (the main app dashboard and other modules' own stats are
  untouched, per instruction).

### Session Lifecycle and Data Integrity

- **`abandoned` is now actually used**: `EndStudyRoomSession` takes an optional `reason`
  (`"completed"` default, `"abandoned"`) - the explicit "End Session" button still ends a session as
  `completed`; the `beforeunload`/`sendBeacon` path (tab closed/refreshed mid-session, from M2) now ends
  it as `abandoned` instead. `abandoned` was defined in the M1 schema but never actually set until now.
- No new `"created"`/`"paused"` statuses were added - `StartStudyRoomSession` already creates a session
  directly into `in_progress` (there's no meaningful gap between "created" and "active" for this
  feature), and "Paused" was already flagged as an intentional simplification in M2 (navigating away/
  muting, no dedicated status) - M4's "where supported"/"where applicable" wording was read as permission
  to leave both as they already were rather than inventing new states nothing has a use for yet.
- **Ownership**: every M4 function (`GetSessionHistory`, the summary mutations/query, the workspace
  conflict-detection changes) goes through the same `requireOwnedSession`/explicit `userId !== `
  ownership check as every prior milestone's functions - no new access pattern was introduced.
- **No duplicate completion records**: `EndStudyRoomSession`'s pre-existing `if (status !== "in_progress")
  return` guard already means a session can only leave `in_progress` once, regardless of `reason` or how
  many times it's called afterward (e.g. a late `sendBeacon` arriving after an explicit End Session click
  is a no-op) - unchanged from M1/M2, still holds.
- **No duplicate summaries**: covered above (`BeginSummaryGeneration`'s guard).
- Ending a session, abandoning a session, and viewing its completion page never delete or modify any
  saved Whiteboard/Code/Notes/transcript content - only `status`/`endedAt`/`durationSeconds`/summary
  fields change.

## What exists right now (M5)

All four integrations are **optional, reference-only, one-directional-at-read-time**: a room stores at
most a small set of ids (`studyPlanId`/`studyTaskId`/`questionBankCollectionId`/
`questionBankQuestionIds`/`resumeMatchAnalysisId`/`interviewReviewId`, all new optional fields on
`studyRooms`), never a copy of the source data. The Tutor's actual context is pulled live from each
source module's own existing, already-ownership-checked query at session-start time
(`app/api/study-room/tutor/start`), via new pure builders in `utils/studyRoom/integrationContext.ts`
(+ `interviewFeedbackParser.ts` for Interview Review's messy feedback blob) and combined into one
`integration_context` dynamic variable - no second AI engine, same single ElevenLabs agent as M2/M3.

- **Study Planner**: the task page's existing (previously dead) "Start Learning in AI Study Room" link
  now goes to `/study-room/create?source=studyPlanner&...`, which prefills the form and shows a "Linked
  from" banner; the Convex `CreateStudyRoom` mutation stores `studyPlanId`/`studyTaskId` after
  independently verifying both belong to the caller. The task page also shows a new "Study Room sessions
  started from this task" section (`api.StudyRoom.GetStudyRoomsForStudyTask`), and ending a Study Room
  session never calls any Study Planner mutation - task completion stays 100% learner-driven.
- **Question Bank**: a new "Select questions to practice with AI Tutor" mode on the Question Bank page
  (checkboxes added to `QuestionCard` as an opt-in prop, zero change when not used) with a floating
  "Practice N Questions with AI Tutor" button that opens Create Study Room with the collection + selected
  question ids. The Tutor is told to ask them one at a time and give feedback after each.
- **Resume Match Analyzer**: a "Create Learning Session" button appears once an analysis is saved
  (either just-saved or opened from history - never for an unsaved result, since there'd be nothing to
  reference yet). Only `jobTitle`/matched/missing skill names/focus areas are passed to the Tutor - never
  the resume file or full job description text.
- **Interview Review**: a "Create Study Room to Improve These Areas" link on the feedback dialog, shown
  only when that interview has feedback. `interviewFeedbackParser.ts` extracts low-scoring areas and
  suggestions only (never the full transcript), and the context explicitly tells the Tutor this is
  AI-generated feedback, not a certified assessment.
- **Linked-source display**: `resolveLinkedSource` (in `convex/StudyRoom.ts`) resolves each reference to
  a label + link, gracefully marking it "no longer available" if the source record was deleted (never an
  error, never cascades anything). Shown on the Study Room detail page as badges, and in the Create form
  as the "Linked from..." banner.
- Every reference is validated independently server-side (`validateOwnedRefs`) before being stored - an
  invalid or foreign id is silently dropped rather than blocking room creation.

### Known limitations / resume point for a future milestone

- The M5 "ACTION REQUIRED" Dynamic Variable addition above has not been done (can't be done by me).
- None of M5 has been tested end-to-end (per "don't test yourself") - on resume, try each of the 4 entry
  points once the dynamic variable is added, and confirm a deleted source record (e.g. delete a saved
  Resume Match analysis) still shows the room/session fine with a graceful "no longer available" badge.
- No M6 has been requested - do not invent further scope.

## Explicitly NOT implemented (per instructions)

- Any other cross-module integration beyond the four named in M5.
- Any modification to the Mock Interview agent, its prompts, settings, or live calls.
- The Tutor triggering a code run itself (read-only access to the last run result instead - see "Code
  Editor" in the M3 section above).
- A full-text "find all + replace" search inside Notes (the simple scroll-to-first-match implementation
  from M3 is what exists).
- A dedicated "Paused" session status or UI (see "Session Lifecycle" above - an intentional, flagged
  simplification, not an oversight).
- Automatically marking any Study Planner task as completed (there is still no Study Planner integration
  at all, so this was never at risk, but it's worth restating per the explicit instruction).

## Known open items / things to check on resume

1. **The ElevenLabs Study Room agent does not exist yet** - see "ACTION REQUIRED" at the very top of this
   file. Nothing voice/text-related can be tested until that's done and `ELEVENLABS_STUDY_ROOM_AGENT_ID` is
   set.
2. **No `npx convex dev` process needs to be started manually** - one already appears to be running (it
   auto-picked up `convex/StudyRoom.ts` into `convex/_generated/api.d.ts` during M1, and should do the same
   for the M2 additions and the schema changes). Confirm it's still running before testing; if not, start
   it.
3. **Nothing has been tested** - per explicit instruction ("Don't test yourself"), no build/dev/lint/test
   command was run, and no mic/microphone access was attempted. Once the agent exists, the first thing to do
   on resume is: start a session, click Join Session, allow mic access, confirm Nova greets with the
   topic-aware welcome message, speak a question and confirm a Listening -> Thinking -> Speaking status
   transition with a moving waveform, open the chat panel and send a typed message mid-voice-session, mute/
   unmute, try Interrupt while Nova is speaking, close the tab mid-session and confirm it shows as ended on
   reopen (not stuck `in_progress`), end a session normally, reopen an ended session and confirm its
   transcript displays, and resume an in-progress session later and confirm Nova's `conversation_history`-
   aware "Welcome back" framing feels right (its system prompt should actually use that variable - see
   "ACTION REQUIRED").
4. **"Pause" has no dedicated UI beyond navigating away / muting** - flagged as an intentional
   simplification above, not an oversight. If a more explicit pause affordance is wanted, that's a small,
   isolated addition to `TutorCall.tsx`.
5. **`npm install` has not been run** - `@excalidraw/excalidraw`, `@monaco-editor/react`,
   `@tiptap/react` and its 4 extension packages are only in `package.json`, not `node_modules`. Nothing
   M3-related will even compile until this runs.
6. **The 8 Client Tools have not been added to the ElevenLabs agent** - see M3's "ACTION REQUIRED". The
   three tool panels work standalone either way; only the Tutor's own ability to act on them needs this.
7. **The whiteboard diagram tool is the single most "verify by hand" piece of this milestone** - it
   relies on Excalidraw's documented `convertToExcalidrawElements` helper, which could not be confirmed
   against the installed package's actual `.d.ts` the way every ElevenLabs API call in M2 was (the
   package wasn't installed in this session). It's wrapped defensively, but test it first.
8. **`GEMINI_API_KEY` must be set for M4's summary generation** - it's not new (Question Bank already
   requires it), but if it was never configured, `/api/study-room/summary/generate` will fail with "The AI
   provider returned an empty response"-style errors. No new key/account is needed if Question Bank
   already works.
9. **The summary/completion flow has not been tested** - per "don't test yourself," no session was ever
   actually completed/abandoned and viewed. On resume: finish a real session (enough back-and-forth to
   clear the 4-message/1-learner-turn minimum), confirm the completion page auto-triggers a summary and it
   renders sensibly (and, importantly, that it *doesn't* claim understanding or mastery the transcript
   doesn't support), click Regenerate, close a tab mid-session and confirm the resulting session shows as
   "Abandoned" (not "Completed") in History/the room page, and click through all four completion actions
   (Review/Continue/Dashboard/Start Another).
10. **The optimistic-concurrency conflict path is unexercised** - it only matters if the same session is
    open in two tabs/devices at once, which is easy to simulate (open the same session's Whiteboard in two
    tabs, edit in both) but wasn't done here.
11. **No M5 (or any milestone beyond M4) has been requested.** Do not invent scope - Study Planner,
    Question Bank, Resume Match Analyzer and Interview Review integrations all need their own explicit
    spec before any code is written for them.

---

## Environment variables required (names only, no values here)

| Variable | New in | Purpose |
|---|---|---|
| `ELEVENLABS_API_KEY` | existing | Reused as-is for the Study Room Tutor's token minting |
| `ELEVENLABS_STUDY_ROOM_AGENT_ID` | **M2 - new, not yet set** | The Study Room Tutor's own agent id (see M2's "ACTION REQUIRED") |
| `ELEVENLABS_AGENT_ID` | existing | Unchanged - still only the Mock Interview agent |
| `NEXT_PUBLIC_CONVEX_URL` | existing | Reused as-is |
| `NEXT_PUBLIC_ELEVENLABS_LANGUAGE_OVERRIDE_ENABLED` | existing | Reused as-is - same flag now also gates whether Study Room sends `overrides.agent.language` |
| `PISTON_API_URL` | **M3 - optional, not required** | Overrides the default public Piston instance (`https://emkc.org/api/v2/piston`) for code execution, if a self-hosted one is ever preferred. No value needed to make M3 work. |
| `GEMINI_API_KEY` | existing (Question Bank) | Reused as-is for Study Room lesson-summary generation |
| `GEMINI_STUDY_ROOM_MODEL` | **M4 - optional, not required** | Overrides the summary-generation model, default `gemini-2.5-flash` |

---

## Exact resume point

M1-M4 are fully implemented in code per the spec above and have not yet been reviewed or tested by the
user. There is no partially-written code or half-finished mutation - every file in the inventory is in a
complete, consistent state. Three things stand between this and a fully working feature, all outside the
code itself: the ElevenLabs agent's existence (M2), its 8 Client Tools (M3), and running `npm install`
for M3's dependencies. M4 added no new required setup beyond confirming `GEMINI_API_KEY` is set.

To resume:
- Run `npm install` (M3's new dependencies - M4 added none).
- Create the ElevenLabs agent and set `ELEVENLABS_STUDY_ROOM_AGENT_ID` if not already done (M2's "ACTION
  REQUIRED"), then add the 8 Client Tools (M3's "ACTION REQUIRED").
- Click through M2's test flow, then M3's (both under "Known open items" above), then M4's (items 8-10
  above): complete and abandon a session each, check the auto-generated summary's honesty, Regenerate,
  check History's search/filters, check the Dashboard's new Total Learning Time/Recently Studied, and
  spot-check the save-status badges and a conflict (two tabs) in at least one tool.
- If the user wants fixes/changes to M1-M4, treat those as normal bug-fix/change requests against the
  file inventory above.
- If the user wants to continue, the natural next step is an M5 spec from the user (not invented by the
  assistant) - Study Planner/Question Bank/Resume Match Analyzer/Interview Review integrations, per the
  original milestone plan's own M5 boundary.
