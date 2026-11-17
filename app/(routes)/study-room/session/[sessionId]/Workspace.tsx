"use client"

/* eslint-disable @typescript-eslint/no-explicit-any */
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react"
import { useConversationClientTool, useConversationControls } from "@elevenlabs/react"
import { useMutation, useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Bot, Maximize2, Minimize2, X } from "lucide-react"
import WhiteboardPanel, { type ExcalidrawApi } from "./WhiteboardPanel"
import CodeEditorPanel, { type CodeEditorHandle, type CodeRunSummary, type CodeWriteMode } from "./CodeEditorPanel"
import NotesPanel, { type NotesHandle, type NotesInsertPosition } from "./NotesPanel"
import ResizableSplitter from "./ResizableSplitter"
import ToolApprovalBanner from "./ToolApprovalBanner"
import { WORKSPACE_TOOLS, type PendingApproval, type WorkspaceTool } from "./workspaceTypes"
import * as whiteboardTools from "./tutorTools/whiteboardTools"
import type { ApprovalOutcome, ToolResult } from "./tutorTools/whiteboardTools"

export interface WorkspaceHandle {
  openTool: (tool: WorkspaceTool) => void
}

interface WorkspaceProps {
  sessionId: string
  userId: Id<"UserTable">
  onOpenToolsChange: (hasAny: boolean) => void
}

const APPROVAL_TIMEOUT_MS = 30_000
// Phase 3 (C6) - how long a Tutor tool waits for a just-opened panel to be
// ready (Excalidraw is loaded lazily; notes/code wait for their saved data).
const READY_TIMEOUT_MS = 10_000
const MAX_PREVIEW_CHARS = 2000

type Breakpoint = "mobile" | "tablet" | "desktop"

function getBreakpoint(width: number): Breakpoint {
  if (width < 768) return "mobile"
  if (width < 1024) return "tablet"
  return "desktop"
}

// Phase 2 - stores the breakpoint itself rather than the raw width, so a
// window resize only re-renders the Workspace when it actually crosses a
// breakpoint (React bails out of a same-value state update), instead of on
// every pixel of a drag-resize. Same thresholds as before.
function useBreakpoint(): Breakpoint {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>(() =>
    getBreakpoint(typeof window !== "undefined" ? window.innerWidth : 1280)
  )
  useEffect(() => {
    function onResize() {
      setBreakpoint(getBreakpoint(window.innerWidth))
    }
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])
  return breakpoint
}

// Phase 3 (C6) - resolves with the value once `get` returns something truthy,
// or null after the timeout. Polls lightly; never blocks the main thread.
function waitFor<T>(get: () => T | null | undefined | false, timeoutMs = READY_TIMEOUT_MS): Promise<T | null> {
  return new Promise((resolve) => {
    const started = Date.now()
    const check = () => {
      const value = get()
      if (value) return resolve(value as T)
      if (Date.now() - started > timeoutMs) return resolve(null)
      setTimeout(check, 50)
    }
    check()
  })
}

const TOOL_ICON_LABEL: Record<WorkspaceTool, string> = { whiteboard: "Whiteboard", code: "Code Editor", notes: "Notes" }

// Phase 4 - registers a Tutor client tool whose handler returns a structured
// result. The SDK only types tool results as string | number, and would
// JSON-encode an object anyway, so the result is sent as a JSON string.
// Same latest-handler behaviour as useConversationClientTool itself.
function useTutorTool(name: string, handler: (args: any) => unknown) {
  useConversationClientTool(name, (args) => Promise.resolve(handler(args)).then((value) => JSON.stringify(value)))
}

interface QueuedApproval extends PendingApproval {
  id: number
  resolve: (outcome: ApprovalOutcome) => void
}

function declined(outcome: ApprovalOutcome, what: string): ToolResult {
  return outcome === "timed_out"
    ? { ok: false, status: "timed_out", message: `The learner didn't respond in time, so ${what}.` }
    : { ok: false, status: "declined", message: `The learner declined, so ${what}.` }
}

function notReady(tool: WorkspaceTool): ToolResult {
  return { ok: false, status: "failed", message: `The ${TOOL_ICON_LABEL[tool]} didn't finish opening - try again in a moment.` }
}

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

const Workspace = forwardRef<WorkspaceHandle, WorkspaceProps>(function Workspace(
  { sessionId, userId, onOpenToolsChange },
  ref
) {
  const sid = sessionId as Id<"studyRoomSessions">
  const savedLayout = useQuery(api.StudyRoomWorkspace.GetWorkspaceLayout, { userId, sessionId: sid })
  const saveLayout = useMutation(api.StudyRoomWorkspace.SaveWorkspaceLayout)
  const logAction = useMutation(api.StudyRoomWorkspace.LogToolAction)
  // Stable action references - subscribing to them doesn't re-render (Phase 2).
  const { sendContextualUpdate } = useConversationControls()

  const [openOrder, setOpenOrder] = useState<WorkspaceTool[]>([])
  const [activeTool, setActiveTool] = useState<WorkspaceTool | null>(null)
  const [maximizedTool, setMaximizedTool] = useState<WorkspaceTool | null>(null)
  const [weights, setWeights] = useState<Record<WorkspaceTool, number>>({ whiteboard: 1, code: 1, notes: 1 })
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null)

  const layoutLoadedRef = useRef(false)
  const excalidrawApiRef = useRef<ExcalidrawApi | null>(null)
  const codeRef = useRef<CodeEditorHandle | null>(null)
  const notesRef = useRef<NotesHandle | null>(null)
  const layoutSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Phase 3 (C7) - approval queue: one banner at a time, the rest wait their
  // turn (their 30s timeout only starts when they're shown).
  const approvalQueueRef = useRef<QueuedApproval[]>([])
  const activeApprovalRef = useRef<QueuedApproval | null>(null)
  const approvalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const approvalIdRef = useRef(0)
  // Phase 4 (M4) - identical mutating tool calls already in flight.
  const inFlightRef = useRef(new Set<string>())

  const breakpoint = useBreakpoint()

  // Restore the session's saved workspace layout exactly once - M4 adds
  // `maximizedTool` ("expanded/collapsed states") and `panelWeights`
  // ("panel sizes") on top of M3's openTools/activeTool.
  useEffect(() => {
    if (layoutLoadedRef.current || savedLayout === undefined) return
    layoutLoadedRef.current = true
    if (savedLayout) {
      setOpenOrder(savedLayout.openTools)
      setActiveTool(savedLayout.activeTool ?? savedLayout.openTools[0] ?? null)
      setMaximizedTool(savedLayout.maximizedTool ?? null)
      if (savedLayout.panelWeights) setWeights(savedLayout.panelWeights)
    }
  }, [savedLayout])

  useEffect(() => {
    onOpenToolsChange(openOrder.length > 0)
  }, [openOrder, onOpenToolsChange])

  // Debounced, consolidated layout save - fires whenever any part of the
  // layout changes, once the initial restore above has already happened
  // (otherwise the restore itself would immediately re-save what it just
  // loaded).
  useEffect(() => {
    if (!layoutLoadedRef.current) return
    if (layoutSaveTimerRef.current) clearTimeout(layoutSaveTimerRef.current)
    layoutSaveTimerRef.current = setTimeout(() => {
      saveLayout({
        userId,
        sessionId: sid,
        openTools: openOrder,
        activeTool: activeTool ?? undefined,
        maximizedTool: maximizedTool ?? undefined,
        panelWeights: weights,
      }).catch((e) => console.error("Failed to save workspace layout:", e))
    }, 500)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openOrder, activeTool, maximizedTool, weights])

  const openToolInternal = useCallback((tool: WorkspaceTool) => {
    setOpenOrder((prev) => (prev.includes(tool) ? prev : [...prev, tool]))
    setActiveTool(tool)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function closeTool(tool: WorkspaceTool) {
    const next = openOrder.filter((t) => t !== tool)
    setOpenOrder(next)
    if (activeTool === tool) setActiveTool(next[0] ?? null)
    if (maximizedTool === tool) setMaximizedTool(null)
  }

  useImperativeHandle(ref, () => ({ openTool: openToolInternal }), [openToolInternal])

  // Phase 2 - stable, so the memoized WhiteboardPanel isn't re-rendered (and
  // its effect re-run) just because the Workspace re-rendered.
  const handleWhiteboardApiReady = useCallback((excalidrawApi: ExcalidrawApi | null) => {
    excalidrawApiRef.current = excalidrawApi
  }, [])

  // Phase 4 (M3/M4) - after a run the *learner* started, tell Nova what
  // happened as a contextual update (no reply is triggered, nothing is
  // spoken), so she can explain errors without being asked to look.
  const handleLearnerRun = useCallback(
    (summary: CodeRunSummary) => {
      const parts = [
        `[Code Editor] The learner ran ${summary.filename} (${summary.language}). Result: ${summary.status}, exit code ${summary.exitCode ?? "n/a"}.`,
        summary.stdout ? `stdout:\n${summary.stdout.slice(0, 800)}` : "",
        summary.stderr ? `stderr:\n${summary.stderr.slice(0, 800)}` : "",
        summary.compileOutput ? `compiler:\n${summary.compileOutput.slice(0, 800)}` : "",
        summary.error ? `error: ${summary.error}` : "",
      ]
      try {
        sendContextualUpdate(parts.filter(Boolean).join("\n"))
      } catch {
        // No live conversation (e.g. disconnected) - the result is still in
        // get_workspace_context for later.
      }
    },
    [sendContextualUpdate]
  )

  // --- Phase 3 (C7): approval queue ----------------------------------------

  function showNextApproval() {
    if (activeApprovalRef.current) return
    const next = approvalQueueRef.current.shift()
    if (!next) {
      setPendingApproval(null)
      return
    }
    activeApprovalRef.current = next
    setPendingApproval({
      tool: next.tool,
      description: next.description,
      details: next.details,
      preview: next.preview,
      queuedBehind: approvalQueueRef.current.length,
    })
    const id = next.id
    approvalTimerRef.current = setTimeout(() => finishApproval(id, "timed_out"), APPROVAL_TIMEOUT_MS)
  }

  // Ignores stale timers/clicks: only the approval currently shown can be
  // resolved, and only once.
  function finishApproval(id: number | undefined, outcome: ApprovalOutcome) {
    const current = activeApprovalRef.current
    if (!current || current.id !== id) return
    if (approvalTimerRef.current) clearTimeout(approvalTimerRef.current)
    approvalTimerRef.current = null
    activeApprovalRef.current = null
    current.resolve(outcome)
    showNextApproval()
  }

  function requestApproval(
    tool: WorkspaceTool,
    description: string,
    extra: { details?: string; preview?: string } = {}
  ): Promise<ApprovalOutcome> {
    return new Promise((resolve) => {
      approvalQueueRef.current.push({
        id: ++approvalIdRef.current,
        tool,
        description,
        details: extra.details,
        preview: extra.preview ? extra.preview.slice(0, MAX_PREVIEW_CHARS) : undefined,
        resolve,
      })
      if (activeApprovalRef.current) {
        const behind = approvalQueueRef.current.length
        setPendingApproval((prev) => (prev ? { ...prev, queuedBehind: behind } : prev))
      }
      showNextApproval()
    })
  }

  // Unmounting (session ended / tab lost ownership) settles every waiting
  // approval so no Tutor tool call is left hanging.
  useEffect(() => {
    const queue = approvalQueueRef
    const active = activeApprovalRef
    return () => {
      if (approvalTimerRef.current) clearTimeout(approvalTimerRef.current)
      active.current?.resolve("timed_out")
      active.current = null
      for (const item of queue.current) item.resolve("timed_out")
      queue.current = []
    }
  }, [])

  function confirmFor(tool: WorkspaceTool) {
    return (description: string, details?: string) => requestApproval(tool, description, { details })
  }

  function logResult(tool: WorkspaceTool, actionType: string, result: ToolResult | { status: string; message: string }) {
    const status =
      result.status === "applied" ? "applied" : result.status === "declined" ? "rejected" : result.status === "timed_out" ? "timed_out" : null
    if (!status) return
    logAction({ userId, sessionId: sid, tool, actionType, summary: result.message.slice(0, 300), status }).catch((e) =>
      console.error("Failed to log tool action:", e)
    )
  }

  // Phase 4 (M4.7) - the same mutating call (same tool + identical args)
  // can't run twice concurrently, e.g. on a duplicated tool call.
  async function once(name: string, args: unknown, fn: () => Promise<ToolResult>): Promise<ToolResult> {
    const key = `${name}:${JSON.stringify(args ?? {})}`
    if (inFlightRef.current.has(key)) {
      return { ok: false, status: "failed", message: "That exact action is already in progress." }
    }
    inFlightRef.current.add(key)
    try {
      return await fn()
    } catch (e) {
      console.error(`Tutor tool ${name} failed:`, e)
      return { ok: false, status: "failed", message: "That action couldn't be completed." }
    } finally {
      inFlightRef.current.delete(key)
    }
  }

  // --- Phase 3 (C6): panel readiness ----------------------------------------

  function ensureWhiteboard() {
    openToolInternal("whiteboard")
    return waitFor(() => excalidrawApiRef.current)
  }

  function ensureCode() {
    openToolInternal("code")
    return waitFor(() => (codeRef.current?.isReady() ? codeRef.current : null))
  }

  function ensureNotes() {
    openToolInternal("notes")
    return waitFor(() => (notesRef.current?.isReady() ? notesRef.current : null))
  }

  // --- Workspace context (M1.1 / M3.1 / M4.1) -------------------------------

  function getWorkspaceContext() {
    const notes = notesRef.current?.isReady() ? notesRef.current : null
    const code = codeRef.current?.isReady() ? codeRef.current : null
    const outline = notes?.getOutline() ?? []
    const selection = notes?.getSelectionText() ?? ""
    return {
      openTools: openOrder.map((t) => TOOL_ICON_LABEL[t]),
      activeTool: activeTool ? TOOL_ICON_LABEL[activeTool] : null,
      awaitingLearnerApproval: !!pendingApproval,
      whiteboard: openOrder.includes("whiteboard")
        ? whiteboardTools.describeWhiteboard(excalidrawApiRef.current)
        : { open: false },
      codeEditor: code ? { open: true, ...code.getContext() } : { open: openOrder.includes("code"), ready: false },
      notes: notes
        ? {
            open: true,
            empty: outline.length === 0,
            blockCount: outline.length,
            outline: outline.slice(0, 60),
            ...(outline.length > 60 ? { outlineTruncated: true } : {}),
            ...(selection ? { selectedText: selection } : {}),
          }
        : { open: openOrder.includes("notes"), ready: false },
    }
  }

  // --- Whiteboard tools ------------------------------------------------------

  function whiteboardTool(name: string, args: any, run: (wb: ExcalidrawApi) => Promise<ToolResult> | ToolResult) {
    return once(name, args, async () => {
      const wb = await ensureWhiteboard()
      if (!wb) return notReady("whiteboard")
      const result = await run(wb)
      logResult("whiteboard", name, result)
      return result
    })
  }

  function whiteboardHighlight(args: { labels?: string[]; ids?: string[] }): ToolResult {
    const wb = excalidrawApiRef.current
    if (!wb) return { ok: false, status: "failed", message: "The whiteboard isn't open." }
    try {
      const lowerLabels = (Array.isArray(args?.labels) ? args.labels : []).map((l) => String(l).toLowerCase())
      const ids = new Set((Array.isArray(args?.ids) ? args.ids : []).map(String))
      let matched = 0
      const next = wb.getSceneElements().map((el: any) => {
        const byLabel = el.type === "text" && el.text && lowerLabels.some((l) => el.text.toLowerCase().includes(l))
        if (byLabel || ids.has(el.id)) {
          matched++
          return {
            ...el,
            strokeColor: "#eab308",
            backgroundColor: el.type === "text" ? el.backgroundColor : "#fef9c3",
            version: (el.version ?? 1) + 1,
            versionNonce: Math.floor(Math.random() * 2 ** 31),
            updated: Date.now(),
          }
        }
        return el
      })
      if (matched === 0) return { ok: false, status: "not_found", message: "Nothing on the whiteboard matched that." }
      wb.updateScene({ elements: next })
      const result: ToolResult = { ok: true, status: "applied", message: `Highlighted ${matched} element(s) on the whiteboard.` }
      logResult("whiteboard", "highlight", result)
      return result
    } catch (e) {
      console.error("Whiteboard highlight tool failed:", e)
      return { ok: false, status: "failed", message: "I wasn't able to highlight that." }
    }
  }

  async function whiteboardClear(): Promise<ToolResult> {
    const wb = excalidrawApiRef.current
    if (!wb) return { ok: false, status: "failed", message: "The whiteboard isn't open." }
    const hasContent = wb.getSceneElements().filter((el: any) => !el.isDeleted).length > 0
    if (hasContent) {
      const outcome = await requestApproval("whiteboard", "Nova wants to clear the whiteboard. Allow it?")
      if (outcome !== "approved") {
        const result = declined(outcome, "nothing was cleared")
        logResult("whiteboard", "clear", result)
        return result
      }
    }
    try {
      wb.resetScene()
      // WhiteboardPanel's own onChange -> debounced, retried, conflict-safe
      // save (M4) picks this up automatically - no need to save here too.
      const result: ToolResult = { ok: true, status: "applied", message: "Cleared the whiteboard." }
      logResult("whiteboard", "clear", result)
      return result
    } catch (e) {
      console.error(e)
      return { ok: false, status: "failed", message: "I wasn't able to clear the whiteboard." }
    }
  }

  // --- Code Editor tools -------------------------------------------------------

  function codeWrite(args: any): Promise<ToolResult> {
    return once("write_code", args, async () => {
      const content = str(args?.content)
      if (content === undefined) return { ok: false, status: "invalid", message: "write_code needs `content`." }
      const mode: CodeWriteMode = ["append", "replace_selection", "insert_at_cursor"].includes(args?.mode) ? args.mode : "replace"
      const code = await ensureCode()
      if (!code) return notReady("code")
      const target = code.inspectTarget(str(args?.filename))
      if (!target) return notReady("code")
      // Approval before overwriting the learner's existing code (whole file
      // or their selection) - they see the new code and Nova's explanation.
      const overwrites =
        (mode === "replace" && target.content.trim().length > 0) ||
        (mode === "replace_selection" && target.selectionText.trim().length > 0)
      if (overwrites) {
        const outcome = await requestApproval(
          "code",
          mode === "replace_selection"
            ? `Nova wants to replace your selected code in ${target.filename}. Allow it?`
            : `Nova wants to replace the code in ${target.filename}. Allow it?`,
          { details: str(args?.explanation), preview: content }
        )
        if (outcome !== "approved") {
          const result = declined(outcome, "the code wasn't changed")
          logResult("code", mode, result)
          return result
        }
      }
      const written = code.writeCode({ language: str(args?.language), content, mode, filename: str(args?.filename) })
      const result: ToolResult = { ...written, status: written.ok ? "applied" : "failed" }
      logResult("code", mode, result)
      return result
    })
  }

  function codeRun(args: any): Promise<ToolResult> {
    return once("run_code", args, async () => {
      const code = await ensureCode()
      if (!code) return notReady("code")
      const summary = await code.runCode({ filename: str(args?.filename) })
      const ok = summary.status === "success"
      const result: ToolResult = {
        ok,
        status: summary.status === "failed" ? "failed" : "applied",
        message: ok
          ? `${summary.filename} ran successfully.`
          : summary.status === "timeout"
            ? `${summary.filename} was stopped because it ran too long (sandbox time limit).`
            : summary.status === "stopped"
              ? "The learner stopped the run."
              : `${summary.filename} finished with status "${summary.status}".`,
        run: summary,
      }
      logResult("code", "run", { status: result.status, message: result.message })
      return result
    })
  }

  // --- Notes tools ---------------------------------------------------------------

  function notesOp(name: string, args: any, run: (notes: NotesHandle) => Promise<ToolResult> | ToolResult) {
    return once(name, args, async () => {
      const notes = await ensureNotes()
      if (!notes) return notReady("notes")
      const result = await run(notes)
      logResult("notes", name, result)
      return result
    })
  }

  function fromNotes(r: { ok: boolean; message: string; [k: string]: unknown }): ToolResult {
    return { ...r, status: r.ok ? "applied" : "failed" }
  }

  function openWorkspaceTool(args: { tool: WorkspaceTool }): ToolResult {
    if (!WORKSPACE_TOOLS.some((t) => t.id === args?.tool)) {
      return { ok: false, status: "invalid", message: "That isn't a tool I can open." }
    }
    openToolInternal(args.tool)
    return { ok: true, status: "applied", message: `Opened ${TOOL_ICON_LABEL[args.tool]}.` }
  }

  // --- Register every Tutor-facing client tool. Each name must match a
  // "client tool" configured on the Study Room Tutor's ElevenLabs agent -
  // see AI_STUDY_ROOM_IMPLEMENTATION_PROGRESS.md's "PHASE 4 ... ACTION
  // REQUIRED" tool table for the exact names/parameters to add there.
  //
  // Results are structured objects (sent as JSON strings by useTutorTool)
  // with `ok`, `status` (applied | declined | timed_out | failed | not_found |
  // invalid) and a human-readable `message`, plus ids/data the Tutor can use
  // in a follow-up call (e.g. nodeIds -> connect_whiteboard_elements).
  //
  // useConversationClientTool only types a handler's args as
  // Record<string, unknown>, so args are passed through as `any` and
  // validated inside each tool.

  useTutorTool("get_workspace_context", () => getWorkspaceContext())
  useTutorTool("open_workspace_tool", (args) => openWorkspaceTool(args as any))

  // Whiteboard
  useTutorTool("create_whiteboard_diagram", (args) =>
    whiteboardTool("create_diagram", args, (wb) => whiteboardTools.createDiagram(wb, args, confirmFor("whiteboard")))
  )
  useTutorTool("highlight_whiteboard_elements", async (args) => {
    const wb = await ensureWhiteboard()
    return wb ? whiteboardHighlight(args as any) : notReady("whiteboard")
  })
  useTutorTool("clear_whiteboard", async () => {
    const wb = await ensureWhiteboard()
    return wb ? once("clear_whiteboard", {}, whiteboardClear) : notReady("whiteboard")
  })
  useTutorTool("add_whiteboard_element", (args) =>
    whiteboardTool("add_element", args, (wb) => whiteboardTools.addElement(wb, args))
  )
  useTutorTool("update_whiteboard_element", (args) =>
    whiteboardTool("update_element", args, (wb) => whiteboardTools.updateElement(wb, args))
  )
  useTutorTool("move_whiteboard_element", (args) =>
    whiteboardTool("move_element", args, (wb) => whiteboardTools.moveElement(wb, args))
  )
  useTutorTool("delete_whiteboard_elements", (args) =>
    whiteboardTool("delete_elements", args, (wb) => whiteboardTools.deleteElements(wb, args, confirmFor("whiteboard")))
  )
  useTutorTool("connect_whiteboard_elements", (args) =>
    whiteboardTool("connect_elements", args, (wb) => whiteboardTools.connectElements(wb, args))
  )
  useTutorTool("update_whiteboard_connection", (args) =>
    whiteboardTool("update_connection", args, (wb) => whiteboardTools.updateConnection(wb, args))
  )

  // Code Editor
  useTutorTool("write_code", (args) => codeWrite(args))
  useTutorTool("run_code", (args) => codeRun(args))
  useTutorTool("read_code", async (args) => {
    const code = await ensureCode()
    if (!code) return notReady("code")
    const a = args as any
    const r = code.readFile({
      filename: str(a?.filename),
      startLine: typeof a?.start_line === "number" ? a.start_line : undefined,
      endLine: typeof a?.end_line === "number" ? a.end_line : undefined,
    })
    return { ...r, status: r.ok ? "applied" : "not_found" }
  })

  // Notes
  useTutorTool("create_note", (args) =>
    notesOp("create_note", args, (notes) => {
      const a = args as any
      const position: NotesInsertPosition = ["start", "after_section", "after_selection"].includes(a?.position) ? a.position : "end"
      return fromNotes(notes.insertMarkdown({ markdown: str(a?.content) ?? "", heading: str(a?.heading), position, section: str(a?.section) }))
    })
  )
  useTutorTool("read_notes", async (args) => {
    const notes = await ensureNotes()
    if (!notes) return notReady("notes")
    return fromNotes(notes.readNotes({ section: str((args as any)?.section) }))
  })
  useTutorTool("edit_note_section", (args) =>
    notesOp("edit_note_section", args, async (notes) => {
      const a = args as any
      const section = str(a?.section) ?? ""
      const markdown = str(a?.content) ?? ""
      const mode = a?.mode === "append" ? "append" : "replace"
      const info = notes.inspectSection(section)
      if (!info) return fromNotes(notes.editSection({ section, markdown, mode })) // reports "no such section"
      // Rewriting a section that contains the learner's own writing needs
      // their approval; appending, or rewriting Nova's own text, doesn't.
      if (mode === "replace" && info.hasLearnerContent) {
        const outcome = await requestApproval("notes", `Nova wants to rewrite your "${info.heading}" section. Allow it?`, {
          details: str(a?.explanation),
          preview: markdown,
        })
        if (outcome !== "approved") return declined(outcome, "the section wasn't changed")
      }
      return fromNotes(notes.editSection({ section, markdown, mode }))
    })
  )
  useTutorTool("delete_note_section", (args) =>
    notesOp("delete_note_section", args, async (notes) => {
      const section = str((args as any)?.section) ?? ""
      const info = notes.inspectSection(section)
      if (!info) return fromNotes(notes.deleteSection(section))
      const outcome = await requestApproval("notes", `Nova wants to delete the "${info.heading}" section from your notes. Allow it?`, {
        details: `${info.blockCount} block(s)${info.hasLearnerContent ? ", including text you wrote" : ""}.`,
        preview: info.markdown,
      })
      if (outcome !== "approved") return declined(outcome, "nothing was deleted")
      return fromNotes(notes.deleteSection(section))
    })
  )
  useTutorTool("restructure_notes", (args) =>
    notesOp("restructure_notes", args, async (notes) => {
      const a = args as any
      const hasContent = notes.getPlainText().trim().length > 0
      if (Array.isArray(a?.sections) && a.sections.length > 0) {
        // Preferred: reorganise existing blocks (formatting + authorship kept,
        // nothing dropped) under new headings.
        const sections = a.sections.map((s: any) => ({
          heading: str(s?.heading) ?? "",
          blockIds: Array.isArray(s?.block_ids) ? s.block_ids.map(String) : Array.isArray(s?.blockIds) ? s.blockIds.map(String) : [],
        }))
        if (hasContent) {
          const outcome = await requestApproval("notes", "Nova wants to reorganise your notes into sections. Allow it?", {
            details: `New sections: ${sections.map((s: { heading: string }) => s.heading).filter(Boolean).join(", ")}. Nothing is deleted - anything not placed goes under "Other notes".`,
          })
          if (outcome !== "approved") return declined(outcome, "the notes weren't reorganised")
        }
        return fromNotes(notes.reorganize({ sections }))
      }
      // Legacy shape: a whole new document. Replaces everything, so the
      // approval says so explicitly.
      const markdown = str(a?.content) ?? ""
      if (!markdown.trim()) return { ok: false, status: "invalid", message: "restructure_notes needs `sections` (preferred) or `content`." }
      if (hasContent) {
        const outcome = await requestApproval("notes", "Nova wants to replace your entire notes with a restructured version. Allow it?", {
          details: "This replaces everything currently in Notes. Prefer reorganising existing sections where possible.",
          preview: markdown,
        })
        if (outcome !== "approved") return declined(outcome, "the notes weren't changed")
      }
      return fromNotes(notes.replaceAllWithMarkdown(markdown))
    })
  )

  // --- Layout ---

  const maxVisible = breakpoint === "mobile" ? 1 : breakpoint === "tablet" ? 2 : 3
  const visibleTools =
    openOrder.length <= maxVisible
      ? openOrder
      : ([activeTool, ...openOrder.filter((t) => t !== activeTool)].filter(Boolean) as WorkspaceTool[]).slice(
          0,
          maxVisible
        )
  const overflowTools = openOrder.filter((t) => !visibleTools.includes(t))
  const effectiveVisible = maximizedTool ? [maximizedTool] : visibleTools
  // Phase 3 (C8) - open-but-not-visible tools stay mounted (display:none) so
  // their editor state, refs and Tutor context survive.
  const hiddenOpenTools = openOrder.filter((t) => !effectiveVisible.includes(t))

  function handleSplitterResize(a: WorkspaceTool, b: WorkspaceTool, deltaFraction: number) {
    setWeights((prev) => {
      const total = prev[a] + prev[b]
      const shift = deltaFraction * total
      const nextA = Math.min(Math.max(prev[a] + shift, 0.25), total - 0.25)
      return { ...prev, [a]: nextA, [b]: total - nextA }
    })
  }

  return (
    <div className="relative flex h-full w-full flex-col">
      {pendingApproval && (
        <ToolApprovalBanner
          approval={pendingApproval}
          onApprove={() => finishApproval(activeApprovalRef.current?.id, "approved")}
          onReject={() => finishApproval(activeApprovalRef.current?.id, "rejected")}
        />
      )}

      <div className="flex min-h-0 flex-1">
        {openOrder.length === 0 ? (
          <div className="flex h-full w-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
            No tools are open yet. Use the Whiteboard, Code or Notes buttons below, or ask Nova to open one for you.
          </div>
        ) : (
          <>
            {!maximizedTool && (
              <div className="flex shrink-0 flex-col gap-1 border-r border-border bg-muted/30 p-1.5">
                {openOrder.map((tool) => (
                  <button
                    key={tool}
                    type="button"
                    onClick={() => setActiveTool(tool)}
                    title={TOOL_ICON_LABEL[tool]}
                    className={`flex items-center justify-center rounded-lg px-2 py-2 text-[10px] font-semibold ${
                      visibleTools.includes(tool) ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {TOOL_ICON_LABEL[tool][0]}
                  </button>
                ))}
              </div>
            )}

            <div className="flex min-w-0 flex-1">
              {[...effectiveVisible, ...hiddenOpenTools].map((tool) => {
                const hidden = !effectiveVisible.includes(tool)
                return (
                  <div
                    key={tool}
                    className="flex min-w-0"
                    style={hidden ? { display: "none" } : { flexGrow: weights[tool], flexBasis: 0 }}
                    aria-hidden={hidden || undefined}
                  >
                    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                      <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/40 px-3 py-1.5">
                        <span className="text-xs font-semibold text-foreground">{TOOL_ICON_LABEL[tool]}</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setMaximizedTool((prev) => (prev === tool ? null : tool))}
                            aria-label={maximizedTool === tool ? "Restore panel" : "Maximize panel"}
                            className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            {maximizedTool === tool ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => closeTool(tool)}
                            aria-label="Close panel"
                            className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            <X className="size-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="min-h-0 flex-1">
                        {tool === "whiteboard" && (
                          <WhiteboardPanel sessionId={sessionId} userId={userId} onApiReady={handleWhiteboardApiReady} />
                        )}
                        {tool === "code" && (
                          <CodeEditorPanel ref={codeRef} sessionId={sessionId} userId={userId} onLearnerRun={handleLearnerRun} />
                        )}
                        {tool === "notes" && <NotesPanel ref={notesRef} sessionId={sessionId} userId={userId} />}
                      </div>
                    </div>
                  </div>
                )
              })}
              {effectiveVisible.map((tool, i) =>
                i < effectiveVisible.length - 1 ? (
                  <ResizableSplitter
                    key={`split-${tool}`}
                    onResize={(delta) => handleSplitterResize(effectiveVisible[i], effectiveVisible[i + 1], delta)}
                  />
                ) : null
              )}
            </div>
          </>
        )}
      </div>

      {overflowTools.length > 0 && !maximizedTool && (
        <div className="flex shrink-0 items-center gap-1.5 border-t border-border bg-muted/30 px-3 py-1.5">
          <Bot className="size-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Also open:</span>
          {overflowTools.map((tool) => (
            <button
              key={tool}
              type="button"
              onClick={() => setActiveTool(tool)}
              className="rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
            >
              {TOOL_ICON_LABEL[tool]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
})

// Phase 2 (C5) - memoized so TutorCall's own re-renders (Tutor mode/status
// changes, transcript messages, notices, interrupt state) don't re-render the
// Workspace and, through it, Excalidraw/Monaco/TipTap. Its props are all
// stable: sessionId/userId don't change during a session, and TutorCall
// passes the useState setter as onOpenToolsChange. The Tutor client tools
// are registered by stable name with a latest-handler ref inside the SDK
// hook, so skipping parent renders doesn't affect tool calls.
export default memo(Workspace)
