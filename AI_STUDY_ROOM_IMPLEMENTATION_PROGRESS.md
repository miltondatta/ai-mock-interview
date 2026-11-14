# AI Study Room Implementation Progress

Last updated: 2026-11-14

## Status: M1-M5 implemented in code. M2, M3 and M5 each have a manual ElevenLabs-dashboard step
## outside my reach - see all three "ACTION REQUIRED" sections below. Not tested (per explicit
## instruction). Not committed to git.

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
