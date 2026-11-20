# AI Study Room — Tutor Tool Usage Investigation

Read-only investigation. No application code, configuration, or schema was modified while producing
this report. Every claim below cites a file (and usually a line range/function) that was actually
read during this investigation; anything that could not be verified from the repository is explicitly
labeled "unverified from repo" / "dashboard-only" rather than stated as fact.

---

## 1. Executive summary

The learner-reported symptom — "the Tutor keeps explaining verbally without opening/using the
Whiteboard (or Notes/Code Editor)" — has **two independent, confirmed causes**, one dashboard-side and
one code-side:

1. **ElevenLabs dashboard configuration gap (unverifiable in detail, but strongly indicated).** The
   repository contains no agent-creation/tool-registration script of any kind for the Study Room agent
   (confirmed by repo-wide search — see §4). All 8 client tools, their parameter schemas, and any
   "when to use which tool" instructions must be manually added in the ElevenLabs dashboard to the
   agent identified by `ELEVENLABS_STUDY_ROOM_AGENT_ID`. `AI_STUDY_ROOM_IMPLEMENTATION_PROGRESS.md`
   (written by whoever built this feature) explicitly documents this as an outstanding manual step that
   was never done as of its last edit (2026-11-16). This investigation independently confirmed the env
   var `ELEVENLABS_STUDY_ROOM_AGENT_ID` in `.env.local` is now set to a non-empty 34-character value
   (so an agent ID has been configured at the env-var level), but **whether the 8 Client Tools and a
   tool-usage system-prompt line have actually been added inside the ElevenLabs dashboard cannot be
   confirmed from the repository** — that is dashboard-only state. If they have not been added, every
   tool call the agent might otherwise make is a dead end: the agent's LLM never calls a tool it doesn't
   know exists.
2. **A second, code-level defect that would still cause the exact same symptom even with a perfectly
   configured agent.** Every "create content" tool handler in
   `app/(routes)/study-room/session/[sessionId]/Workspace.tsx` opens its target panel and creates
   content in the *same* function call (e.g. `whiteboardAddDiagram`, `codeWrite`, `noteCreate`,
   `noteRestructure`). But opening a panel is a React state change (`openToolInternal`, line 107-111)
   that only takes effect on the *next* render; the panel's underlying instance (Excalidraw/Monaco/
   TipTap) is not actually mounted yet in that same synchronous call. Each handler explicitly checks
   for this and, on the very first call for a session where that panel has never been opened, returns a
   string like `"I opened the whiteboard - please ask me again in a moment to draw it."` instead of
   drawing anything (`Workspace.tsx:176-177`, `:294`, `:332`, `:340`). **This means the very first time
   the Tutor decides to use a content tool in a session, nothing visible happens — only the panel opens
   — and the agent must independently decide, from that returned string, to call the same tool again.**
   Nothing in the repo instructs the ElevenLabs agent to do that retry; it depends entirely on the
   agent's own LLM correctly interpreting an unexpected tool-result string. This is a real, repo-verified
   implementation defect (Category A/D, severity High), independent of and in addition to the dashboard
   gap.

Both causes must be fixed/verified for the feature to work end to end: if only the dashboard is fixed,
learners will still see a one-turn delay/failure the first time each tool-type is used per session; if
only the code is fixed, nothing happens at all because the agent never calls any tool.

All 8 tools were fully accounted for in code (names, registration, handlers, parameters). What could
not be fully accounted for is their ElevenLabs-dashboard-side configuration, which is outside repo
visibility by design.

---

## 2. Current architecture and actual runtime sequence

Verified end-to-end by reading the following files, in call order:

1. **Session shell** — `app/(routes)/study-room/session/[sessionId]/page.tsx` renders
   `StudyRoomTutorSession` (via whatever wraps it) once a session is `in_progress`.
2. **Token fetch** — `StudyRoomTutorSession.tsx:34-64` POSTs to `/api/study-room/tutor/start` with
   `{ sessionId }` on mount, then renders `<ConversationProvider><TutorCall .../></ConversationProvider>`
   (`StudyRoomTutorSession.tsx:95-99`) once a `connection` object comes back.
3. **Server-side context build** — `app/api/study-room/tutor/start/route.ts`:
   - Authenticates via Clerk (`currentUser()`, line 27) and resolves the Convex user.
   - Loads the session/room (`GetStudyRoomSession`, line 44), prior messages (`GetStudyRoomMessages`,
     line 55), and user settings (line 60).
   - Pulls optional cross-module integration context (Study Planner/Question Bank/Resume Match/Interview
     Review — lines 71-146) via `utils/studyRoom/integrationContext.ts`.
   - Calls `buildStudyRoomDynamicVariables` (`utils/studyRoomTutorContext.ts:111-153`) to build the 11
     dynamic variables (`learner_name`, `tutor_topic`, `learning_objective`, `category`,
     `difficulty_level`, `learning_preferences`, `additional_instructions`, `tutor_language`,
     `conversation_history`, `first_message`, `integration_context`) and a localized first message.
   - Requests a conversation token from ElevenLabs: `GET https://api.elevenlabs.io/v1/convai/conversation/
     token?agent_id=${ELEVENLABS_STUDY_ROOM_AGENT_ID}` (route.ts:174-177), using `ELEVENLABS_API_KEY`.
   - Returns `{ connection: { conversationToken, dynamicVariables, language, firstMessage, isResume } }`.
4. **Client join** — `TutorCall.tsx` shows a "Join Session" gate (lines 273-298) that requires a user
   gesture + `getUserMedia` before calling `conversation.startSession({ conversationToken,
   dynamicVariables, overrides: { agent: { firstMessage, language? } } })` (`handleJoin`, lines 205-228),
   then sets `hasJoined = true` (line 221).
5. **Tool registration** — Only once `hasJoined` is true does `TutorCall` render its main UI, which
   (for the hidden/visible workspace area at lines 416-420) mounts `Workspace.tsx` — the component that
   calls `useConversationClientTool` eight times (`Workspace.tsx:383-398`). `Workspace` is wrapped in a
   `display:none`/`display:flex` toggle, not a conditional unmount, so once mounted it (and its 8
   registered tools) stay registered for the rest of the session regardless of which panel is visually
   active — confirmed by reading `TutorCall.tsx:416-420` (`{userId && <Workspace .../>}` sits inside the
   always-rendered `<div style={{display: hasOpenTools ? "flex" : "none"}}>`).
6. **Live conversation** — ElevenLabs' own hosted LLM (not this app) produces every spoken/typed Tutor
   reply, driven by the agent's dashboard system prompt + the dynamic variables above. The app makes no
   per-turn LLM call of its own for conversation content (`TutorCall.tsx` only wires `onMessage`/
   `onError`/`onDisconnect` callbacks to `useConversation`, lines 117-152).
7. **Tool call → execution → UI** — When the agent's LLM decides to call a client tool, the ElevenLabs
   JS SDK (`@elevenlabs/client`, vendored under `node_modules/@elevenlabs/client/dist/BaseConversation.js`)
   receives a `client_tool_call` event and dispatches it (see §4 for exact mechanics) to whichever
   handler was registered under that exact tool name. The handler runs in the browser, mutates
   React state / the real Excalidraw/Monaco/TipTap instance, persists via a Convex mutation, and returns
   a string that is sent back to ElevenLabs as a `client_tool_result` message.
8. **End of session** — `handleEndSession` (`TutorCall.tsx:244-256`) or a `beforeunload`→`sendBeacon`
   to `/api/study-room/tutor/end` (lines 190-200) ends the ElevenLabs session and the Convex session row.

---

## 3. Inventory of all eight tools

All 8 are registered in the same file, `app/(routes)/study-room/session/[sessionId]/Workspace.tsx`,
lines 383-398, via the real, confirmed-to-exist `useConversationClientTool` hook (`node_modules/
@elevenlabs/react/dist/conversation/ConversationClientTools.js:74-86`).

| # | Tool name | Registered at (Workspace.tsx) | Handler function | Opens its panel as a side effect? | Destructive / needs approval? |
|---|---|---|---|---|---|
| 1 | `get_workspace_context` | line 383 | `getWorkspaceContext` (356-364) | No (read-only) | No |
| 2 | `open_workspace_tool` | line 384-386 | `openWorkspaceTool` (366-370) | Yes (its entire purpose) | No |
| 3 | `create_whiteboard_diagram` | line 387-389 | `whiteboardAddDiagram` (170-235) | Yes (175), but see §6 defect | No |
| 4 | `highlight_whiteboard_elements` | line 390-392 | `whiteboardHighlight` (237-258) | **No** — see finding below | No |
| 5 | `clear_whiteboard` | line 393 | `whiteboardClear` (260-283) | No (returns early if panel closed) | **Yes** — `ToolApprovalBanner` |
| 6 | `write_code` | line 394 | `codeWrite` (287-317) | Yes (293), but see §6 defect | Yes, only on `mode:"replace"` of non-empty file |
| 7 | `create_note` | line 395 | `noteCreate` (330-336) | Yes (331), but see §6 defect | No |
| 8 | `restructure_notes` | line 396-398 | `noteRestructure` (338-354) | Yes (339), but see §6 defect | Yes, only if notes non-empty |

### Per-tool detail (points 1–11 from the brief)

For every tool: (1) name and (2) registration location are in the table above. (3) **registered with
the correct agent/session**: all 8 are registered unconditionally inside `Workspace.tsx`, which is only
ever rendered inside `TutorCall.tsx`, which is only ever rendered inside the Study Room Tutor's own
`<ConversationProvider>` (`StudyRoomTutorSession.tsx:96-98`) — there is exactly one `ConversationProvider`
instance per session, exactly one agent (`ELEVENLABS_STUDY_ROOM_AGENT_ID`), so there is no code path by
which these tools could attach to the wrong session or the Mock Interview agent. This part is correct in
code; it says nothing about whether the dashboard agent itself has matching tool entries (see §4/§6).

1. **`get_workspace_context`** — (4) no params; output: a 4-line text summary of open tools +
   Whiteboard/Code/Notes content (`Workspace.tsx:356-364`, calling `whiteboardSummary()`, `codeRead()`,
   and `notesRef.current?.getPlainText()`). (5) System-prompt instruction: **not present anywhere in
   repo** — the only description of "call this before answering about the workspace" lives in
   `AI_STUDY_ROOM_IMPLEMENTATION_PROGRESS.md`'s suggested dashboard text, never in code that's actually
   sent to ElevenLabs (dynamic variables carry no tool-usage instructions — `utils/
   studyRoomTutorContext.ts:138-150` only carries session data, never prompt text). (6) Callable
   whenever `Workspace` is mounted (i.e. after Join) — yes, with the exact-name caveat in §4. (7)
   Executes synchronously, in-browser, no network call except reading already-loaded local refs. (8)
   Result returned as `client_tool_result` (see §4). (9) Whether ElevenLabs's backend actually re-feeds
   that result into the agent's working context for the rest of the turn is **ElevenLabs server-side
   behavior, unverifiable from this repo** — assumed yes per the SDK's design (a `client_tool_result`
   message keyed by `tool_call_id`), not confirmed by a live test. (10) Panel auto-open: no — intentionally
   read-only. (11) Conditions that could prevent success: none besides the dashboard-registration gap;
   it never throws.

2. **`open_workspace_tool`** — (4) param `tool: "whiteboard"|"code"|"notes"`; output: `"Opened
   {Label}."` or `"That isn't a tool I can open."` if the arg doesn't match `WORKSPACE_TOOLS`
   (`workspaceTypes.ts:3-7`). (5) No system-prompt text in repo describing when to use this versus letting
   a content tool open its own panel (see §6 — gap/ambiguity). (6)/(7) Works immediately, pure state
   update (`openToolInternal`, 107-111). (8)/(9) same caveat as above. (10) **Yes**, this is the one tool
   whose entire purpose is opening a panel with no content side effect. (11) No real failure conditions.

3. **`create_whiteboard_diagram`** — (4) params `title?`, `nodes: {id,label}[]`, `edges:
   {from,to,label?}[]`; output: a summary string, or an error string. (5) No dashboard-visible prompt
   text in repo (see §5). (6) Registered correctly; **but see the confirmed defect in §6** — on the panel's
   first open in a session it does not draw anything. (7) Builds Excalidraw skeleton elements via the
   dynamically-imported `convertToExcalidrawElements` helper and calls `api.updateScene()` additively
   (`Workspace.tsx:180-227`); the implementer's own comment (`AI_STUDY_ROOM_IMPLEMENTATION_PROGRESS.md`,
   M3 section) flags this specific helper as never verified against the installed package because it
   wasn't run — this investigation independently confirms `@excalidraw/excalidraw` **is** now present in
   `node_modules` (so `npm install` has since been run), but did not execute the app, so this helper's
   actual runtime behavior remains unverified by direct testing, only by reading its usage. (8)/(9) same
   caveat. (10) Opens the whiteboard panel, yes — but see §6 for the first-call race. (11) Fails
   gracefully (try/catch, `Workspace.tsx:231-234`) returning an apology string if `convertToExcalidrawElements`
   throws or the API ref is unavailable; also silently no-ops any edge whose `from`/`to` doesn't match a
   known node id (line 206-207).

4. **`highlight_whiteboard_elements`** — (4) param `labels: string[]`; output: `"Highlighted N
   element(s)..."` or `"I couldn't find anything..."`/`"The whiteboard isn't open."`. (5) No prompt text
   in repo. (6) Registered correctly. (7) Case-insensitive substring match against existing text elements'
   `.text`, recolors matches (`Workspace.tsx:237-258`). (8)/(9) same caveat. (10) **No** — confirmed from
   code: unlike the other 4 content tools, this handler never calls `openToolInternal`. If the whiteboard
   panel isn't already open, it returns `"The whiteboard isn't open."` and does nothing else — it will
   never open the panel for the learner, even though the tool's whole purpose ("point something out")
   implies the learner should be looking at the board. This is a real, if minor, inconsistency against
   the other whiteboard tools (flagged in §8 as a Medium finding). (11) No match found; panel closed.

5. **`clear_whiteboard`** — (4) no params; output: `"Cleared the whiteboard."` or a decline/timeout
   string. (5) No prompt text in repo. (6) Registered correctly. (7) If the board has content, calls
   `requestApproval("whiteboard", ...)` (`Workspace.tsx:265`), which shows `ToolApprovalBanner` and
   resolves "approved"/"rejected"/"timed_out" after up to 30s (`APPROVAL_TIMEOUT_MS`, line 26); only on
   "approved" does it call `api.resetScene()` (line 274). (8)/(9) same caveat. (10) No panel-open side
   effect (makes sense — nothing to show if the board is already closed/empty). (11) Can be declined or
   time out (30s) — in both cases the tool returns a string explaining that outcome rather than silently
   failing, and `logResult(...)` records it to `studyRoomToolActions` (`convex/StudyRoomWorkspace.ts`,
   `LogToolAction`, line 328) either way.

6. **`write_code`** — (4) params `language?`, `content`, `mode?: "replace"|"append"`, `filename?`;
   output: a result string from `CodeEditorHandle.writeCode` or a decline/apology string. (5) No prompt
   text in repo. (6) Registered correctly; **subject to the same first-call-opens-panel-only defect as
   #3/#7/#8 (§6)**. (7) On `mode:"replace"` of a non-empty current file, requires approval first
   (`Workspace.tsx:296-308`); `append` never asks. Delegates to `CodeEditorHandle.writeCode`
   (`CodeEditorPanel.tsx:13-16` interface) which this investigation confirmed is exposed via
   `forwardRef`/`useImperativeHandle` and persists through `UpdateCodeFile`
   (`convex/StudyRoomWorkspace.ts`, referenced at `CodeEditorPanel.tsx:35`). (8)/(9) same caveat. (10)
   Opens the Code panel — subject to §6. (11) Approval decline/timeout; `codeRef.current` null on first
   call (§6); server caps content at `MAX_CODE_LENGTH = 50_000` chars regardless of client-side trimming
   (`convex/StudyRoomWorkspace.ts:17`).

7. **`create_note`** — (4) params `heading?`, `content`; output: a result string from
   `NotesHandle.appendBlock`. (5) No prompt text in repo. (6) Registered correctly; **subject to §6's
   defect**. (7) Always additive, inserts a "🤖 Added by Nova" blockquote above the appended content per
   the implementer's own notes (`AI_STUDY_ROOM_IMPLEMENTATION_PROGRESS.md`, M3 Notes section) — this
   investigation confirmed the `NotesHandle` interface (`NotesPanel.tsx:17-21`) exposes `appendBlock` but
   did not trace its full body (outside the 80-line read window used here); the append-only behavior and
   visual distinction are taken from the implementer's documentation, not independently re-verified
   line-by-line in this pass — flagged as a minor unverified-detail, not a defect. (8)/(9) same caveat.
   (10) Opens Notes — subject to §6. (11) `notesRef.current` null on first call (§6); server caps content
   at `MAX_NOTE_LENGTH = 50_000` chars (`convex/StudyRoomWorkspace.ts:16`).

8. **`restructure_notes`** — (4) param `content`; output: result string or decline/timeout string. (5)
   No prompt text in repo. (6) Registered correctly; **subject to §6's defect**. (7) Requires approval if
   existing notes are non-empty (`Workspace.tsx:341-349`), otherwise replaces directly via
   `NotesHandle.replaceContent`. (8)/(9) same caveat. (10) Opens Notes — subject to §6. (11) Approval
   decline/timeout; same server-side length cap as #7.

**Distinguishing the five links in the chain, per tool, in one place:** for all 8 tools, "defined on the
ElevenLabs dashboard" cannot be inspected from the repo at all (flagged explicitly, not guessed) —
`AI_STUDY_ROOM_IMPLEMENTATION_PROGRESS.md`'s own account says this step was never completed as of
2026-11-16, and nothing in the repo can refresh that status. "Registered in the app" — verified true for
all 8 (`Workspace.tsx:383-398`). "The agent deciding to call it" — entirely dependent on the dashboard
system prompt, which this repo cannot see; the repo supplies zero tool-usage guidance via dynamic
variables (§5). "The app executing it" — verified working for all 8, modulo the first-call panel-mount
race for the 4 content-creation tools (§6). "The UI visibly showing the result" — verified for all
content tools once the panel is actually mounted (Excalidraw `updateScene`, Monaco file content, TipTap
document, all backed by real Convex persistence tables confirmed in `convex/schema.ts` lines
520-610 — `studyRoomWhiteboards`, `studyRoomCodeFiles`, `studyRoomNotes`, `studyRoomWorkspaceLayout`,
`studyRoomToolActions`).

---

## 4. Tool registration and execution findings

- **Registration mechanism (verified from the installed package, not just its `.d.ts`)**:
  `useConversationClientTool(name, handler)` (`node_modules/@elevenlabs/react/dist/conversation/
  ConversationClientTools.js:74-86`) stores `handler` in a `handlerRef` and, inside a `useLayoutEffect`,
  calls `registerClientTool(name, stableHandler)` from the nearest `ConversationProvider`'s context. That
  provider (`ConversationClientTools.js:21-44`) inserts the handler into two places: a persistent
  `clientToolsRegistry` Map, and `clientToolsRef.current[name]` — a **mutable property on the same object
  reference** that was handed to the ElevenLabs SDK's underlying `Conversation.startSession()` call.
- **Checked specifically whether mount-order could break registration** (Workspace only mounts *after*
  `conversation.startSession()` is called in `handleJoin`, because `hasJoined` flips state asynchronously
  — `TutorCall.tsx:211-221`): traced into `node_modules/@elevenlabs/react/dist/conversation/
  ConversationProvider.js:44-66`. `buildClientTools(sessionOptions.clientTools, clientToolsRegistry)` is
  called once, synchronously, at the exact moment `startSession` runs (line 64), and the **same object**
  is stored both as `clientToolsRef.current` (line 65) and as `sessionOptions.clientTools` passed to the
  underlying `@elevenlabs/client` SDK. Because `registerClientTool` later *mutates* that same object
  in place (`clientToolsRef.current[name] = handler`) rather than replacing it, and because
  `node_modules/@elevenlabs/client/dist/BaseConversation.js:184-195`'s `handleClientToolCall` reads
  `this.options.clientTools[tool_name]` fresh on every incoming `client_tool_call` event (not a one-time
  snapshot), **late registration (Workspace mounting after `startSession()`) is safe and does not break
  tool availability**. This was verified by reading the actual shipped `.js`, not assumed — flagged here
  specifically because it is the kind of thing that looks like a bug at a glance and is not one.
- **Exact-name matching is load-bearing.** `BaseConversation.js:185` uses
  `Object.prototype.hasOwnProperty.call(this.options.clientTools, event.client_tool_call.tool_name)` — a
  byte-for-byte string match against whatever name the dashboard sends. If a dashboard Client Tool is
  named with different casing, extra/missing underscores, or a typo relative to the 8 names in
  `Workspace.tsx`, the SDK will hit the `else` branch (`BaseConversation.js:208-223`): it calls
  `this.onError(...)` and sends back `client_tool_result` with `is_error: true` and the message
  `"Client tool with name {name} is not defined on client"`. **This failure mode is entirely invisible
  from the repo** — it can only be diagnosed by checking the dashboard's exact tool names against this
  list, or by seeing `onError` fire in the browser console during a live session (`TutorCall.tsx:140-141`
  logs it). Flagged as an outstanding question (§13), not a confirmed defect, since dashboard tool names
  cannot be read from this repo.
- **Result delivery back to ElevenLabs is verified correct in code**: every handler's return value
  (string, or `undefined` which becomes `"Client tool execution successful."` per
  `BaseConversation.js:187`) is wrapped into a `client_tool_result` message with the matching
  `tool_call_id` (`BaseConversation.js:190-195`). Whether the ElevenLabs *server* actually re-injects that
  result into the agent's conversational context before its next utterance is ElevenLabs-side behavior
  this repo cannot observe or test — presumed yes (that is the entire purpose of a typed `client_tool_result`
  message type), but explicitly unverified by a live run.
- **Confirmed defect — panel-mount race on every content-creation tool** (Category A/D, **High**
  severity): see the Executive Summary and §6 for full detail; evidenced at `Workspace.tsx:170-235`
  (`whiteboardAddDiagram`), `:287-317` (`codeWrite`), `:330-336` (`noteCreate`), `:338-354`
  (`noteRestructure`) — each calls `openToolInternal(tool)` (a `setState`) and then, in the *same*
  synchronous call, checks a ref (`excalidrawApiRef.current`, `codeRef.current`, `notesRef.current`) that
  is only populated once the corresponding panel component actually mounts and its own effect/callback
  fires (`WhiteboardPanel.tsx:69-73`'s `onApiReady` effect; `CodeEditorPanel`/`NotesPanel`'s
  `useImperativeHandle`). Because React state updates don't re-render synchronously inside the same
  function, that ref is still `null`/stale on this first call, every single time a tool is used to open a
  panel that was closed. The code handles this gracefully (no crash — a spoken-back "please ask me
  again" string) rather than silently failing, but it does not retry automatically; it is left entirely
  to the ElevenLabs agent's own LLM judgment whether to call the tool again after hearing that result.
- **Confirmed inconsistency** (Category A, **Medium** severity): `highlight_whiteboard_elements`
  (`Workspace.tsx:237-258`) does not call `openToolInternal`, unlike every other content tool. If the
  whiteboard is closed, calling this tool silently does nothing but return `"The whiteboard isn't open."`
  — the Tutor cannot use it to open the board and point something out in one step, unlike
  `create_whiteboard_diagram`, `write_code`, `create_note`, and `restructure_notes`, all of which at least
  attempt to open their panel.

---

## 5. Tutor system prompt and tool-selection analysis

- **No system prompt text exists in this repository at all**, for either the base Tutor persona or
  tool-selection guidance. The *only* place any system-prompt wording appears is as a suggested, "paste
  this in by hand" string inside `AI_STUDY_ROOM_IMPLEMENTATION_PROGRESS.md` (M2's "ACTION REQUIRED"
  section and M3's "ACTION REQUIRED" section) — this is documentation describing what should be typed
  into the ElevenLabs dashboard, not code that is sent to ElevenLabs at runtime.
- **What this app actually sends to ElevenLabs at runtime** is exclusively the 11 *dynamic variables*
  built by `buildStudyRoomDynamicVariables` (`utils/studyRoomTutorContext.ts:111-153`) — topic, objective,
  category, difficulty, preferences, additional instructions, language, conversation history, first
  message, and integration context. **None of these carry any instruction about tool usage** — they are
  pure session/lesson data, confirmed by reading the full function body (lines 138-150). There is no
  `overrides.agent.prompt` override sent from `TutorCall.tsx:211-220` either — only `firstMessage` and
  optionally `language` are overridden; the system prompt itself is never touched per-session, it is
  whatever is saved on the dashboard agent permanently.
- **Conclusion, directly against the brief's table**: the Tutor has **no real, repo-verifiable
  instructions** for "explain with a diagram" → open whiteboard, "draw a flowchart" → whiteboard,
  "explain this code step by step" → code editor, "make revision notes" → notes, etc. Whatever behavior
  exists for these phrases today depends entirely on:
  1. Whether a human has pasted tool-usage instructions into the dashboard system prompt (per M3's
     "ACTION REQUIRED" suggested wording) — **unverifiable from the repo**, and the implementation
     progress doc's own account says this had not been done as of its last update.
  2. Generic LLM judgment from the base persona prompt alone, which (per the *suggested* M2 wording,
     itself unverified as actually saved to the dashboard) talks about "introduce concepts
     progressively... explain with concrete examples... ask a question to check understanding" — i.e.
     conversational/pedagogical framing with **no mention of the Whiteboard/Code Editor/Notes tools at
     all** in the base-persona text. Even if that exact text were pasted in, it alone would not satisfy
     the table in the brief — a second, tool-specific line is what M3's "ACTION REQUIRED" section
     separately prescribes, and per the same progress doc, that line was also not yet added.
- This is the single most direct explanation for the reported symptom at the "intelligence" level (as
  opposed to the "execution" level covered in §6): **if the dashboard system prompt has no line telling
  the agent that these 8 tools exist and when a diagram/notes/code-walkthrough would help**, the agent's
  LLM has no basis to ever decide to call them, regardless of how well the client-side code works.

---

## 6. Automatic panel activation analysis

- **Tool execution and panel-opening are not architecturally separate** — they are deliberately combined
  inside each content-creation handler (`whiteboardAddDiagram`, `codeWrite`, `noteCreate`,
  `noteRestructure` all call `openToolInternal(tool)` as their first action). This is the right intent
  (the brief's target flow wants "requests panel open → invokes content-creation tool" to feel like one
  step from the learner's perspective) but the implementation does not actually achieve it in one tool
  call — see the confirmed defect above. **A panel does need to be mounted first**, and content tools do
  not wait for that to happen; they detect the not-yet-mounted case and bail out with an apology string
  instead of, e.g., deferring the write via a `useEffect` keyed on the ref becoming available, or
  retrying automatically after a short delay.
- **Hidden (CSS `display:none`) panels can receive updates.** Confirmed: `TutorCall.tsx:416-420` keeps
  `Workspace` mounted via `display` toggling, not conditional rendering, and `Workspace.tsx` itself keeps
  all *opened* tools mounted simultaneously (`effectiveVisible.map(...)`, lines 458-491) — switching
  which tool is "active" only changes which panel is visually emphasized/sized, not whether it's mounted.
  So once a panel has been opened at least once in a session, subsequent tool calls against it work
  immediately, with no re-render race, because its ref is already populated. The race is specifically a
  **first-open-per-session** problem, not a general hidden-panel problem.
- **Activation state sync with the Tutor**: `openOrder`/`activeTool`/`maximizedTool`/`panelWeights` are
  pure client React state, persisted to Convex (`GetWorkspaceLayout`/`SaveWorkspaceLayout`,
  `convex/StudyRoomWorkspace.ts`, debounced save in `Workspace.tsx:91-105`) so a reopened session restores
  the same layout. The Tutor has no separate "view" into this state beyond what `get_workspace_context`
  reports back as text (`Workspace.tsx:356-364`) — there is no live push of "panel X just opened" back
  into the agent's context; the Tutor only learns about state changes through the return value of the
  tool call it itself just made (or a subsequent `get_workspace_context` call).
- **Mobile single-panel-at-a-time behavior**: `useBreakpoint()` (`Workspace.tsx:28-40`) computes
  `maxVisible = 1` under 768px (line 402), and `visibleTools`/`effectiveVisible` (lines 403-411) cap what
  is actually rendered to that limit, showing the rest as an "Also open" overflow chip row
  (lines 505-520). This does not interfere with *tool execution* — a tool handler operates on its ref
  regardless of whether that panel happens to be the currently-visible one on a narrow screen, since all
  opened panels stay mounted (confirmed above). It could, however, mean the learner doesn't *see* the
  result of a tool call immediately on mobile if the Tutor just opened a panel that isn't the
  currently-visible slot — a UX nuance, not a functional break, and not independently re-verified against
  a live mobile viewport (no app run was performed).
- **Is there a documented "Phase 3 panel-readiness" mechanism?** No such named mechanism exists anywhere
  in the repo (searched; not found). The closest equivalent is the ad-hoc "please ask me again in a
  moment" fallback strings described above, which is a workaround, not a readiness-gating mechanism.
- **Does a dedicated `open_workspace_tool`-type tool exist?** **Yes** — this is explicitly tool #2,
  `open_workspace_tool` (`Workspace.tsx:366-370`, registered at line 384-386). So the gap the brief asks
  about ("if not, say so explicitly") does not apply here; the tool exists and is pure navigation (opens
  a panel, no content side effect). What's missing is not the tool itself but (a) any system-prompt
  instruction telling the agent to call it before/instead of a content tool when a panel just needs to be
  shown, and (b) the content tools' own self-sufficiency on a cold (never-opened) panel (§ above).

---

## 7. Voice versus text behavior

- **Same code path for tool-selection and execution.** `conversation.sendUserMessage(text)` (typed input,
  `TutorCall.tsx:240`) and real speech both feed the *same* live ElevenLabs conversation object created by
  one `conversation.startSession()` call; there is exactly one `useConversation()` instance
  (`TutorCall.tsx:117-152`) and one set of 8 registered client tools shared by both. There is no separate
  "text mode" vs. "voice mode" branch anywhere in `Workspace.tsx` or `TutorCall.tsx` for tool dispatch —
  confirmed by reading both files in full; `pendingTextSourceRef` (line 87, 239) only exists to label a
  learner message as `"text"` vs `"voice"` for transcript/analytics purposes (`onMessage` handler, lines
  118-139), it has no effect on whether/how a tool call is processed.
- **No evidence of tool calls being dropped during active speech.** The ElevenLabs SDK's
  `handleClientToolCall` (`BaseConversation.js:184-223`) is a top-level websocket/datachannel event
  handler independent of whether the agent is currently speaking; nothing in this app's own code
  (`Workspace.tsx`, `TutorCall.tsx`) gates, queues, or defers tool execution based on `conversation.mode`
  ("speaking"/"listening"). This is based on reading the actual message-dispatch code, not an assumption,
  but it does not rule out ElevenLabs-server-side timing behavior (e.g. whether the agent's own LLM is
  less likely to decide to call a tool mid-utterance) — that is outside repo visibility.
- **No evidence the Tutor is coded to explicitly wait for/narrate tool results.** The app returns a
  descriptive string from every tool (e.g. `"Added a diagram titled \"X\" with 3 node(s)."`,
  `Workspace.tsx:228`) specifically so the agent's LLM has something concrete to narrate, but whether the
  agent's dashboard prompt instructs it to actually read that result aloud, versus just moving on, is
  dashboard-side and unverifiable here.
- **"Interrupt" is honestly implemented, not faked** (worth noting since it affects perceived
  responsiveness around tool use): `handleInterrupt` (`TutorCall.tsx:230-233`) unmutes the mic and calls
  the real `conversation.sendUserActivity()` SDK method; there is no "force-stop TTS" API exposed by the
  SDK, confirmed by its absence from `ConversationControls.js`'s exported action list (lines 76-110).

---

## 8. Confirmed defects and root causes (A–G, with severity)

**A — Confirmed implementation defects**

1. **Panel-mount race defeats first-use of every content-creation tool in a session.** Evidence:
   `Workspace.tsx:170-235` (`whiteboardAddDiagram`), `:287-317` (`codeWrite`), `:330-336` (`noteCreate`),
   `:338-354` (`noteRestructure`); root cause traced to `openToolInternal` being a React `setState` (lines
   107-111) whose effect (mounting `WhiteboardPanel`/`CodeEditorPanel`/`NotesPanel` and populating their
   refs) only happens on a later render, not inside the same function call. Observed behavior (from code):
   first call opens the panel and returns an apology string with no content created. Expected behavior
   (per the brief's target flow): "requests panel open → invokes content-creation tool" should feel like
   one step. Why it causes the problem: the agent is left having to decide, purely from a text result it
   wasn't told to expect, whether to retry — which is unreliable without an explicit prompt instruction
   that also doesn't exist (§5). **Severity: High.**
2. **`highlight_whiteboard_elements` does not open the whiteboard**, unlike its sibling content tools.
   Evidence: `Workspace.tsx:237-258` has no `openToolInternal` call, contrasted with
   `whiteboardAddDiagram`'s line 175. Observed: calling this tool while the board is closed does nothing
   but return `"The whiteboard isn't open."`. Expected: the tool's purpose ("point something out") implies
   it should be able to bring the board into view. **Severity: Medium.**

**B — Missing capabilities**

1. No tool exists for the agent to run code itself — this is **documented as an intentional scope
   decision**, not an oversight (`AI_STUDY_ROOM_IMPLEMENTATION_PROGRESS.md`, "Code Editor" section under
   M3: "The Tutor never triggers a run itself in this milestone"). Confirmed consistent with the 8-tool
   list — there is no 9th `run_code`-style client tool anywhere in `Workspace.tsx`. **Severity: Low**
   (explicitly scoped out, not a bug).
2. No mechanism exists for the agent to be told, mid-conversation, that a panel it opened is now actually
   ready (i.e., no retry/callback once `excalidrawApiRef`/`codeRef`/`notesRef` populate) — this is the
   root cause of A.1 above, listed separately here as the missing capability (an "on-ready" hook or an
   automatic one-shot retry) that would fix it. **Severity: High** (same underlying issue as A.1, flagged
   again here as a capability gap per the brief's taxonomy).

**C — ElevenLabs agent prompt/configuration problems (repo-visible only as an absence)**

1. **No tool-usage instructions are sent to the agent from code**, confirmed by the full read of
   `buildStudyRoomDynamicVariables` (`utils/studyRoomTutorContext.ts:111-153`) — only lesson/session data
   is sent, never anything about the 8 tools. Whatever tool-usage guidance exists (if any) is 100%
   dashboard-resident and was, per the implementer's own last-known account
   (`AI_STUDY_ROOM_IMPLEMENTATION_PROGRESS.md`, "PAUSED HERE" section, item B, and the M3 "ACTION
   REQUIRED" section), never actually added as of 2026-11-16. **This investigation cannot confirm or
   deny whether a human has since added it** — flagged as "possible / unverified from repo," not stated
   as a current fact. **Severity: Critical if still missing** (nothing downstream matters if the agent
   never decides to call a tool), but confidence is "likely, based on the feature's own documented
   history" rather than "confirmed by this investigation."
2. Similarly unverifiable: whether all 8 Client Tools have been added to the dashboard agent at all, and
   whether their dashboard parameter schemas (names/types) match what `Workspace.tsx` expects. A name
   mismatch would surface as `BaseConversation.js:208-223`'s "not defined on client" error path (§4) —
   **possible, unverified from repo.**

**D — Tool registration or execution problems**

- Covered by A.1/A.2 above; no additional distinct finding beyond what's already stated under A.
- The exact-string-match requirement between dashboard tool names and the 8 names in `Workspace.tsx`
  (§4) is a structural fragility worth naming here even though it's not a confirmed current bug:
  **Severity: Medium (as a fragility), unverified whether it is currently manifesting.**

**E — Workspace UI/panel activation problems**

- The panel-mount race (A.1) is as much a panel-activation problem as an execution one; cross-referenced
  here rather than duplicated. **Severity: High** (same finding).
- Mobile's 1-panel-visible cap does not block execution, only visibility of a non-active panel's result
  (§6) — **Severity: Low**, and not independently confirmed against a running mobile viewport.

**F — Context synchronization problems**

- No confirmed defect found. `get_workspace_context` gives the agent an on-demand read of current state;
  the Tutor has no autonomous push notification of state changes, which is a design choice (poll-on-
  demand) rather than a broken sync mechanism. Convex persistence and optimistic-concurrency conflict
  handling (`convex/StudyRoomWorkspace.ts`'s `checkNotStale`, lines 30-33, and each save mutation's
  `expectedUpdatedAt` parameter) were read and appear internally consistent, though not exercised live.

**G — Voice/text interaction differences**

- No confirmed defect found (§7) — both input modes share one conversation object, one tool registry, no
  branching logic.

---

## 9. Missing capabilities

- A `run_code` client tool for the agent to execute code itself — intentionally out of scope per the
  implementer's own notes, not something this investigation is recommending be added without a new spec,
  just confirming its absence is deliberate.
- Any mechanism for a content tool to "wait" for its panel to finish mounting rather than failing once and
  relying on the agent to retry (this is the fix implied by A.1/B.2, not a new capability on top of what
  was asked for).
- No tool exists to let the agent *ask* the learner something structured (e.g. a quiz/check-understanding
  UI) — out of scope for this investigation (not one of the 8 tools, not referenced anywhere as planned),
  mentioned only because the brief's target-architecture discussion touches "ask a question to check
  understanding," which today is handled purely conversationally, with no dedicated tool.

---

## 10. Recommended target architecture

Per the brief's intended flow — *learner asks → Tutor identifies intention → decides if a tool improves
the explanation → selects tool(s) → requests panel open → invokes content-creation tool → app executes →
result appears in workspace → result returned to Tutor → Tutor explains/guides* — the current code is
already structurally close to this (tool-calling model, not an app-side classifier), and that choice is
sound. Two changes would close the remaining gaps without a redesign:

1. **Fix the panel-mount race (§6/8.A.1) so a single tool call reliably produces visible content.**
   Concretely (describing the shape of a fix for planning purposes only — not implemented here, per
   instructions): each content-creation handler could await the panel's readiness (e.g. a promise that
   resolves once `onApiReady`/`useImperativeHandle` fires, with a short timeout) instead of checking a
   ref once and giving up. This removes the dependency on the agent's own LLM correctly retrying from an
   unexpected text result.
2. **Make `open_workspace_tool` and the 6 content/read tools work together as the brief's flow describes**
   by giving the dashboard system prompt explicit tool-selection guidance (per M3's "ACTION REQUIRED"
   suggested wording, expanded to explicitly cover the table in this brief's §3: "diagram" →
   `create_whiteboard_diagram`, "flowchart" → same, "code step by step"/"write and execute" →
   `write_code` + narrate (never `run_code`, since it doesn't exist), "revision notes"/"summarize" →
   `create_note`/`restructure_notes`, "both" → call more than one tool in the same turn if useful). This
   is dashboard-only content; nothing in the repo can enforce it.
3. **Tool selection should remain agent-driven (ElevenLabs' own LLM + tool-calling), not an app-side
   intent classifier.** Trade-off analysis: an app-side classifier (regex/keyword or a secondary small-LLM
   call on every learner utterance, then forcibly triggering a tool) would guarantee the "diagram" keyword
   always opens a whiteboard, at the cost of (a) a second LLM/latency hop per turn, (b) losing the
   conversational judgment the brief explicitly wants ("use judgment, not open tools for every question"),
   and (c) duplicating logic that ElevenLabs' tool-calling already does natively. A **hybrid** — keep
   tool-selection in the agent's own LLM (current architecture, correct direction), but harden the
   client-side execution path (fix #1 above) and make the dashboard prompt explicit and example-rich
   (fix #2) — gets the reliability benefit of a classifier (the tool call, once decided, actually works)
   without its downsides. This investigation recommends the hybrid's "harden execution + strengthen
   prompt" half; it does not recommend adding an app-side classifier, since the existing architecture's
   agent-driven model already matches the brief's own stated preference for judgment over blanket
   triggering.

---

## 11. Prioritized implementation roadmap (planning only — nothing here was implemented)

1. **Confirm dashboard state first** (no code change): check whether the ElevenLabs dashboard agent
   behind `ELEVENLABS_STUDY_ROOM_AGENT_ID` currently has all 8 Client Tools defined with names/schemas
   matching `Workspace.tsx:383-398`, and whether its system prompt contains tool-usage guidance. This is
   the cheapest possible next step and determines whether §8/C's "Critical, unverified" item is actually
   still open — everything else is wasted effort if the agent still has zero tools configured.
2. **Fix the panel-mount race (§8.A.1)** before anything else code-side, since it affects all 4
   content-creation tools and is the one defect that would still break the feature even with a perfect
   dashboard configuration. Highest leverage, single root cause, four call sites.
3. **Fix `highlight_whiteboard_elements`'s missing auto-open (§8.A.2)** — small, isolated, same pattern
   already used by its siblings.
4. **Strengthen the dashboard system prompt** with explicit per-request-type tool guidance (§10, item 2)
   — dashboard-only, no code change, but should happen after #2/#3 so the prompt's examples describe
   behavior that actually works end-to-end once tested.
5. **Live end-to-end verification** (not performed in this investigation per its read-only mandate): join
   a real session, ask for a diagram/flowchart/notes/code-walkthrough per the brief's table, and confirm
   each opens its panel and populates content within the same or very next Tutor turn.

Ordering rationale: step 1 is free and determines scope; steps 2-3 are code fixes that matter regardless
of dashboard state and are prerequisites for step 4's prompt examples to be truthful; step 5 is the only
way to close the "unverified from repo" items in §13.

---

## 12. Files and ElevenLabs dashboard settings that would need changes

**Repo files** (concrete paths, for whoever implements the roadmap above):
- `app/(routes)/study-room/session/[sessionId]/Workspace.tsx` — lines 170-235, 287-317, 330-336, 338-354
  (panel-mount race fix for the 4 content tools); lines 237-258 (`highlight_whiteboard_elements` auto-open
  fix).
- No other application file needs a code change to address the confirmed findings in this report;
  `TutorCall.tsx`, `StudyRoomTutorSession.tsx`, `utils/studyRoomTutorContext.ts`, `app/api/study-room/
  tutor/start/route.ts`, `WhiteboardPanel.tsx`, `CodeEditorPanel.tsx`, `NotesPanel.tsx`, and
  `convex/StudyRoomWorkspace.ts` were all read and found internally consistent with their stated purpose.

**ElevenLabs dashboard (cannot be changed or even read from this repo — call out explicitly)**:
- The Study Room Tutor agent identified by `ELEVENLABS_STUDY_ROOM_AGENT_ID` (confirmed set to a
  non-empty value in `.env.local`, exact value not disclosed in this report): verify/add all 8 Client
  Tools (names must byte-match `Workspace.tsx:383-398`'s 8 strings) with their parameter schemas per §3's
  table.
- That same agent's system prompt: verify/add explicit tool-usage guidance per §5/§10.
- Everything else about that agent (voice, LLM choice, first-message override toggle, dynamic variables
  enabled list) per `AI_STUDY_ROOM_IMPLEMENTATION_PROGRESS.md`'s own "ACTION REQUIRED" sections — this
  investigation did not re-verify those toggles since they are outside this task's specific tool-usage
  question, and are dashboard-only regardless.

---

## 13. Outstanding questions that cannot be answered from repository inspection alone

1. Does the ElevenLabs dashboard agent (`ELEVENLABS_STUDY_ROOM_AGENT_ID`) currently have all 8 Client
   Tools configured, with names exactly matching `Workspace.tsx`'s 8 strings and correct parameter
   schemas? **Unverifiable from repo.**
2. Does that agent's system prompt currently contain any tool-usage guidance at all (even a partial or
   outdated version of M2/M3's suggested wording)? **Unverifiable from repo.**
3. If tools are configured, do their dashboard parameter schemas match the TypeScript shapes
   `Workspace.tsx` expects (e.g. `nodes: {id,label}[]` for `create_whiteboard_diagram`)? A mismatch
   wouldn't necessarily error client-side (JS is permissive at the boundary) but could produce malformed
   calls. **Unverifiable from repo.**
4. Does ElevenLabs' backend actually re-inject a `client_tool_result`'s string into the agent's
   subsequent-turn context (assumed per SDK design, per §4), and does the dashboard LLM reliably act on an
   unexpected "please ask me again" result by retrying? **Cannot be tested without a live session — out
   of scope for a read-only, no-self-test investigation.**
5. Does the agent currently "wait" appropriately for a tool result before continuing to speak, or does
   ElevenLabs' turn-taking model ever let it talk past/ignore a pending tool call? This is a live timing
   question about ElevenLabs' own orchestration, not something the client SDK's source exposes.
6. Real end-to-end behavior on a narrow/mobile viewport when the Tutor opens a panel that isn't the
   currently-visible one (§6/§8.E) was reasoned about from code only; not observed in a running app.
7. Whether `@excalidraw/excalidraw`'s `convertToExcalidrawElements` behaves exactly as
   `whiteboardAddDiagram` assumes (the implementer's own flagged risk, `AI_STUDY_ROOM_IMPLEMENTATION_
   PROGRESS.md`, M3) — the package is now installed (confirmed via `node_modules/@excalidraw`), but this
   investigation did not run the app to exercise that code path.

No marker below is needed — this investigation completed all 13 requested sections using direct evidence
from the files cited throughout.
