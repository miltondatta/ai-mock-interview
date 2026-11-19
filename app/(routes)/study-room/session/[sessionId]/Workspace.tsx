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
import { CODE_LANGUAGE_OPTIONS, WORKSPACE_TOOLS, type PendingApproval, type WorkspaceTool } from "./workspaceTypes"
import * as whiteboardTools from "./tutorTools/whiteboardTools"
import type { ApprovalOutcome, Confirm, ToolResult } from "./tutorTools/whiteboardTools"

export interface WorkspaceHandle {
  openTool: (tool: WorkspaceTool) => void
}

interface WorkspaceProps {
  sessionId: string
  userId: Id<"UserTable">
  onOpenToolsChange: (hasAny: boolean) => void
}

const APPROVAL_TIMEOUT_MS = 30_000
// Upper bound on how long a Tutor tool waits for a just-opened panel to
// report ready (Excalidraw/Monaco load lazily; notes/code wait for their
// saved data). This is only a failure cut-off - readiness itself is signalled
// by the panel (see waitForPanel below), not detected by a delay.
const READY_TIMEOUT_MS = 15_000
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

// Panel readiness (replaces Phase 3's 50ms polling). A Tutor tool that needs
// a panel opens it and registers a waiter; the panel itself signals when it
// can serve operations (WhiteboardPanel's onApiReady after the saved scene is
// restored, CodeEditorPanel/NotesPanel's onReady after their saved data is
// loaded). Closing the panel, a session change or unmount fails the waiter.
type PanelWaitFailure = "timeout" | "closed" | "cancelled"
type PanelWait<T> = { ok: true; handle: T } | { ok: false; reason: PanelWaitFailure }
type PanelWaiter = (event: "ready" | PanelWaitFailure) => void

const TOOL_ICON_LABEL: Record<WorkspaceTool, string> = { whiteboard: "Whiteboard", code: "Code Editor", notes: "Notes" }

// Phase 4 - registers a Tutor client tool whose handler returns a structured
// result. The SDK only types tool results as string | number, and would
// JSON-encode an object anyway, so the result is sent as a JSON string.
// Same latest-handler behaviour as useConversationClientTool itself.
// Any unexpected exception is turned into a structured failure result, so a
// tool error is reported to Nova instead of surfacing as an SDK error.
function useTutorTool(name: string, handler: (args: any) => unknown) {
  useConversationClientTool(name, async (args) => {
    try {
      return JSON.stringify(await handler(args ?? {}))
    } catch (e) {
      console.error(`Tutor tool ${name} failed:`, e)
      return JSON.stringify({ ok: false, status: "failed", message: "That action couldn't be completed." })
    }
  })
}

const CODE_WRITE_MODES: CodeWriteMode[] = ["replace", "append", "replace_selection", "insert_at_cursor"]

interface QueuedApproval extends PendingApproval {
  id: number
  resolve: (outcome: ApprovalOutcome) => void
}

function declined(outcome: ApprovalOutcome, what: string): ToolResult {
  if (outcome === "timed_out") return { ok: false, status: "timed_out", message: `The learner didn't respond in time, so ${what}.` }
  if (outcome === "cancelled") {
    return { ok: false, status: "cancelled", message: `The panel was closed or the study session changed before it could be done, so ${what}.` }
  }
  return { ok: false, status: "declined", message: `The learner declined, so ${what}.` }
}

function notReady(tool: WorkspaceTool, reason: PanelWaitFailure): ToolResult {
  const label = TOOL_ICON_LABEL[tool]
  if (reason === "closed") return { ok: false, status: "cancelled", message: `The ${label} was closed before it finished opening, so nothing was changed.` }
  if (reason === "cancelled") return { ok: false, status: "cancelled", message: `The study session changed, so nothing was changed in the ${label}.` }
  return { ok: false, status: "failed", message: `The ${label} took too long to load, so nothing was changed. It may still be loading.` }
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
  // Tutor calls waiting for a panel to become ready, per panel.
  const panelWaitersRef = useRef<Record<WorkspaceTool, Set<PanelWaiter>>>({
    whiteboard: new Set(),
    code: new Set(),
    notes: new Set(),
  })
  // Bumped when the session changes or the Workspace unmounts. A Tutor call
  // captures it on entry and refuses to apply anything once it has moved on,
  // so a pending operation can never land in a different Study Room session.
  const epochRef = useRef(0)

  const breakpoint = useBreakpoint()

  // Restore the session's saved workspace layout exactly once - M4 adds
  // `maximizedTool` ("expanded/collapsed states") and `panelWeights`
  // ("panel sizes") on top of M3's openTools/activeTool.
  useEffect(() => {
    if (layoutLoadedRef.current || savedLayout === undefined) return
    layoutLoadedRef.current = true
    if (savedLayout) {
      // Merge rather than overwrite: a Tutor tool call may already have
      // opened a panel before the saved layout arrived, and dropping it here
      // would unmount the panel that call is waiting on.
      setOpenOrder((prev) => [...savedLayout.openTools, ...prev.filter((t) => !savedLayout.openTools.includes(t))])
      setActiveTool((prev) => prev ?? savedLayout.activeTool ?? savedLayout.openTools[0] ?? null)
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
    failPanelWaiters(tool, "closed")
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
    if (excalidrawApi) notifyPanelReady("whiteboard")
  }, [])
  // Stable for the same reason (CodeEditorPanel/NotesPanel are memoized).
  const handleCodeReady = useCallback(() => notifyPanelReady("code"), [])
  const handleNotesReady = useCallback(() => notifyPanelReady("notes"), [])

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

  // A session change or unmount (session ended / tab lost ownership) moves
  // the epoch on and settles everything still waiting - approvals and panel
  // waits - as "cancelled", so no Tutor tool call is left hanging and none
  // of them can apply its change afterwards.
  useEffect(() => {
    const queue = approvalQueueRef
    const active = activeApprovalRef
    const waiters = panelWaitersRef
    const epoch = epochRef
    return () => {
      epoch.current++
      if (approvalTimerRef.current) clearTimeout(approvalTimerRef.current)
      approvalTimerRef.current = null
      const pending = [active.current, ...queue.current]
      active.current = null
      queue.current = []
      for (const item of pending) item?.resolve("cancelled")
      setPendingApproval(null)
      for (const tool of Object.keys(waiters.current) as WorkspaceTool[]) {
        for (const waiter of [...waiters.current[tool]]) waiter("cancelled")
      }
    }
  }, [sessionId])

  // Asks the learner. An approval only counts if, by the time it arrives,
  // the call still belongs to the current session and its target is still
  // there (`stillValid`); otherwise it is reported as "cancelled" and the
  // caller applies nothing.
  async function askApproval(
    tool: WorkspaceTool,
    epoch: number,
    description: string,
    extra: { details?: string; preview?: string } = {},
    stillValid?: () => boolean
  ): Promise<ApprovalOutcome> {
    if (epochRef.current !== epoch) return "cancelled"
    const outcome = await requestApproval(tool, description, extra)
    if (outcome === "approved" && (epochRef.current !== epoch || (stillValid && !stillValid()))) return "cancelled"
    return outcome
  }

  function confirmFor(tool: WorkspaceTool, epoch: number, stillValid?: () => boolean): Confirm {
    return (description: string, details?: string) => askApproval(tool, epoch, description, { details }, stillValid)
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

  // --- Panel readiness ---------------------------------------------------------

  // The handle a Tutor operation needs, or null while that panel is closed or
  // still loading. Refs only, so these are safe from stable callbacks.
  function whiteboardHandle(): ExcalidrawApi | null {
    return excalidrawApiRef.current
  }

  function codeHandle(): CodeEditorHandle | null {
    return codeRef.current?.isReady() ? codeRef.current : null
  }

  function notesHandle(): NotesHandle | null {
    return notesRef.current?.isReady() ? notesRef.current : null
  }

  function notifyPanelReady(tool: WorkspaceTool) {
    for (const waiter of [...panelWaitersRef.current[tool]]) waiter("ready")
  }

  function failPanelWaiters(tool: WorkspaceTool, reason: PanelWaitFailure) {
    for (const waiter of [...panelWaitersRef.current[tool]]) waiter(reason)
  }

  // Opens `tool` (or brings it to the front) and resolves with its handle as
  // soon as the panel reports ready - immediately when it already is. Each
  // waiter settles exactly once: ready, panel closed, session changed, or the
  // READY_TIMEOUT_MS cut-off.
  function openAndWait<T>(tool: WorkspaceTool, getHandle: () => T | null): Promise<PanelWait<T>> {
    const epoch = epochRef.current
    openToolInternal(tool)
    const current = getHandle()
    if (current) return Promise.resolve({ ok: true, handle: current })
    return new Promise((resolve) => {
      const waiters = panelWaitersRef.current[tool]
      const waiter: PanelWaiter = (event) => {
        let result: PanelWait<T>
        if (event === "ready") {
          if (epochRef.current !== epoch) {
            result = { ok: false, reason: "cancelled" }
          } else {
            const handle = getHandle()
            if (!handle) return // signalled before the handle caught up - keep waiting
            result = { ok: true, handle }
          }
        } else {
          result = { ok: false, reason: event }
        }
        waiters.delete(waiter)
        clearTimeout(timer)
        resolve(result)
      }
      const timer = setTimeout(() => waiter("timeout"), READY_TIMEOUT_MS)
      waiters.add(waiter)
    })
  }

  // --- Workspace context (M1.1 / M3.1 / M4.1) -------------------------------

  // Live state only: each panel's content is read from its mounted instance
  // at call time; a panel that is open but still loading says so instead of
  // reporting saved or empty content.
  function getWorkspaceContext() {
    const wb = whiteboardHandle()
    const code = codeHandle()
    const notes = notesHandle()
    const open = [...openOrder]
    if (wb && !open.includes("whiteboard")) open.push("whiteboard")
    if (code && !open.includes("code")) open.push("code")
    if (notes && !open.includes("notes")) open.push("notes")
    const outline = notes?.getOutline() ?? []
    const selection = notes?.getSelectionText() ?? ""
    return {
      openTools: open.map((t) => TOOL_ICON_LABEL[t]),
      activeTool: activeTool ? TOOL_ICON_LABEL[activeTool] : null,
      awaitingLearnerApproval: !!pendingApproval,
      whiteboard: wb ? whiteboardTools.describeWhiteboard(wb) : { open: open.includes("whiteboard"), ready: false },
      codeEditor: code ? { open: true, ...code.getContext() } : { open: open.includes("code"), ready: false },
      notes: notes
        ? {
            open: true,
            empty: outline.length === 0,
            blockCount: outline.length,
            outline: outline.slice(0, 60),
            ...(outline.length > 60 ? { outlineTruncated: true } : {}),
            ...(selection ? { selectedText: selection } : {}),
          }
        : { open: open.includes("notes"), ready: false },
    }
  }

  async function openWorkspaceTool(args: any): Promise<ToolResult> {
    const raw = typeof args?.tool === "string" ? args.tool.trim().toLowerCase() : ""
    const tool = WORKSPACE_TOOLS.find((t) => t.id === raw)?.id
    if (!tool) {
      return {
        ok: false,
        status: "invalid",
        message: `"${String(args?.tool ?? "")}" isn't a workspace tool - use "whiteboard", "code" or "notes".`,
      }
    }
    const label = TOOL_ICON_LABEL[tool]
    const wait =
      tool === "whiteboard"
        ? await openAndWait(tool, whiteboardHandle)
        : tool === "code"
          ? await openAndWait(tool, codeHandle)
          : await openAndWait(tool, notesHandle)
    if (!wait.ok) {
      if (wait.reason === "timeout") return { ok: false, status: "failed", message: `The ${label} was opened but is still loading.`, tool }
      return notReady(tool, wait.reason)
    }
    return { ok: true, status: "applied", message: `The ${label} is open and ready.`, tool }
  }

  // --- Whiteboard tools ------------------------------------------------------

  // Opens the Whiteboard if needed, waits until it is ready, then runs the
  // operation. `confirm` asks the learner and only counts an approval if the
  // same Whiteboard instance is still mounted in the same session.
  function whiteboardTool(
    name: string,
    args: any,
    run: (wb: ExcalidrawApi, confirm: Confirm) => Promise<ToolResult> | ToolResult
  ) {
    return once(name, args, async () => {
      const epoch = epochRef.current
      const wait = await openAndWait("whiteboard", whiteboardHandle)
      if (!wait.ok) return notReady("whiteboard", wait.reason)
      const wb = wait.handle
      const result = await run(wb, confirmFor("whiteboard", epoch, () => excalidrawApiRef.current === wb))
      logResult("whiteboard", name, result)
      return result
    })
  }

  async function whiteboardClear(wb: ExcalidrawApi, confirm: Confirm): Promise<ToolResult> {
    const count = wb.getSceneElements().filter((el: any) => !el.isDeleted).length
    if (count === 0) return { ok: true, status: "applied", message: "The whiteboard was already empty, so there was nothing to clear." }
    const outcome = await confirm("Nova wants to clear the whiteboard. Allow it?", `${count} element(s) would be removed.`)
    if (outcome !== "approved") return declined(outcome, "nothing was cleared")
    wb.resetScene()
    // WhiteboardPanel's own onChange -> debounced, retried, conflict-safe
    // save (M4) picks this up automatically - no need to save here too.
    return { ok: true, status: "applied", message: "Cleared the whiteboard." }
  }

  // --- Code Editor tools -------------------------------------------------------

  function codeWrite(args: any): Promise<ToolResult> {
    return once("write_code", args, async () => {
      const epoch = epochRef.current
      const content = str(args?.content)
      if (content === undefined) return { ok: false, status: "invalid", message: "write_code needs `content`." }
      const rawMode = str(args?.mode)?.trim().toLowerCase()
      if (rawMode && !CODE_WRITE_MODES.includes(rawMode as CodeWriteMode)) {
        return { ok: false, status: "invalid", message: `Unknown write_code mode "${rawMode}" - use "replace" or "append".` }
      }
      const mode: CodeWriteMode = (rawMode as CodeWriteMode) || "replace"
      const filename = str(args?.filename)?.trim() || undefined
      const rawLanguage = str(args?.language)?.trim().toLowerCase() || undefined
      const language = rawLanguage && CODE_LANGUAGE_OPTIONS.some((o) => o.value === rawLanguage) ? rawLanguage : undefined

      const wait = await openAndWait("code", codeHandle)
      if (!wait.ok) return notReady("code", wait.reason)
      const target = wait.handle.inspectTarget(filename)
      if (!target) return { ok: false, status: "failed", message: "The Code Editor has no file to write to yet." }
      // inspectTarget falls back to the active file for an unknown name;
      // stop here rather than asking approval for the wrong file.
      if (filename && target.filename !== filename) {
        return {
          ok: false,
          status: "not_found",
          message: `There's no file named "${filename}" in the Code Editor, so nothing was written.`,
          files: wait.handle.getContext()?.files.map((f) => f.filename) ?? [],
        }
      }
      // Approval before overwriting the learner's existing code (whole file
      // or their selection) - they see the new code and Nova's explanation.
      const overwrites =
        (mode === "replace" && target.content.trim().length > 0) ||
        (mode === "replace_selection" && target.selectionText.trim().length > 0)
      if (overwrites) {
        const outcome = await askApproval(
          "code",
          epoch,
          mode === "replace_selection"
            ? `Nova wants to replace your selected code in ${target.filename}. Allow it?`
            : `Nova wants to replace the code in ${target.filename}. Allow it?`,
          { details: str(args?.explanation), preview: content },
          () => !!codeHandle()
        )
        if (outcome !== "approved") {
          const result = declined(outcome, "the code wasn't changed")
          logResult("code", mode, result)
          return result
        }
      }
      // Re-read the handle: after an approval wait the one captured above
      // can hold stale file state (the learner may have kept typing).
      const code = codeHandle()
      if (!code || epochRef.current !== epoch) return declined("cancelled", "the code wasn't changed")
      const written = code.writeCode({ language, content, mode, filename })
      const languageNote =
        rawLanguage && !language && written.ok ? ` The language "${rawLanguage}" isn't supported here, so the file's language was left unchanged.` : ""
      const result: ToolResult = { ...written, message: `${written.message}${languageNote}`, status: written.ok ? "applied" : "failed" }
      logResult("code", mode, result)
      return result
    })
  }

  function codeRun(args: any): Promise<ToolResult> {
    return once("run_code", args, async () => {
      const wait = await openAndWait("code", codeHandle)
      if (!wait.ok) return notReady("code", wait.reason)
      const summary = await wait.handle.runCode({ filename: str(args?.filename) })
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

  // Opens Notes if needed, waits until it is ready, then runs the operation.
  function notesOp(name: string, args: any, run: (notes: NotesHandle, epoch: number) => Promise<ToolResult> | ToolResult) {
    return once(name, args, async () => {
      const epoch = epochRef.current
      const wait = await openAndWait("notes", notesHandle)
      if (!wait.ok) return notReady("notes", wait.reason)
      const result = await run(wait.handle, epoch)
      logResult("notes", name, result)
      return result
    })
  }

  // Asks before a Notes change; resolves to the live Notes handle to apply it
  // with, or to a ready-made "not done" result.
  async function approveNotesChange(
    epoch: number,
    description: string,
    extra: { details?: string; preview?: string },
    what: string
  ): Promise<{ notes: NotesHandle } | { result: ToolResult }> {
    const outcome = await askApproval("notes", epoch, description, extra, () => !!notesHandle())
    if (outcome !== "approved") return { result: declined(outcome, what) }
    const notes = notesHandle()
    return notes ? { notes } : { result: declined("cancelled", what) }
  }

  function fromNotes(r: { ok: boolean; message: string; [k: string]: unknown }): ToolResult {
    return { ...r, status: r.ok ? "applied" : "failed" }
  }

  // --- Register every Tutor-facing client tool. Each name must match a
  // "client tool" configured on the Study Room Tutor's ElevenLabs agent -
  // see AI_STUDY_ROOM_IMPLEMENTATION_PROGRESS.md for the exact
  // names/parameters configured there.
  //
  // Results are structured objects (sent as JSON strings by useTutorTool)
  // with `ok`, `status` (applied | declined | timed_out | cancelled | failed |
  // not_found | invalid) and a human-readable `message`, plus ids/data the
  // Tutor can use in a follow-up call (e.g. nodeIds -> connect_whiteboard_elements).
  //
  // useConversationClientTool only types a handler's args as
  // Record<string, unknown>, so args are passed through as `any` and
  // validated inside each tool.

  useTutorTool("get_workspace_context", () => getWorkspaceContext())
  useTutorTool("open_workspace_tool", (args) => openWorkspaceTool(args))

  // Whiteboard
  useTutorTool("create_whiteboard_diagram", (args) =>
    whiteboardTool("create_diagram", args, (wb, confirm) => whiteboardTools.createDiagram(wb, args, confirm))
  )
  useTutorTool("highlight_whiteboard_elements", (args) =>
    whiteboardTool("highlight", args, (wb) => whiteboardTools.highlightElements(wb, args))
  )
  useTutorTool("clear_whiteboard", () => whiteboardTool("clear_whiteboard", {}, (wb, confirm) => whiteboardClear(wb, confirm)))
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
    whiteboardTool("delete_elements", args, (wb, confirm) => whiteboardTools.deleteElements(wb, args, confirm))
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
    const wait = await openAndWait("code", codeHandle)
    if (!wait.ok) return notReady("code", wait.reason)
    const a = args as any
    const r = wait.handle.readFile({
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
      const content = str(a?.content) ?? ""
      if (!content.trim()) return { ok: false, status: "invalid", message: "create_note needs `content`." }
      const heading = str(a?.heading)?.trim() || undefined
      const position: NotesInsertPosition = ["start", "after_section", "after_selection"].includes(a?.position) ? a.position : "end"
      return fromNotes(notes.insertMarkdown({ markdown: content, heading, position, section: str(a?.section) }))
    })
  )
  useTutorTool("read_notes", async (args) => {
    const wait = await openAndWait("notes", notesHandle)
    if (!wait.ok) return notReady("notes", wait.reason)
    return fromNotes(wait.handle.readNotes({ section: str((args as any)?.section) }))
  })
  useTutorTool("edit_note_section", (args) =>
    notesOp("edit_note_section", args, async (notes, epoch) => {
      const a = args as any
      const section = str(a?.section) ?? ""
      const markdown = str(a?.content) ?? ""
      const mode = a?.mode === "append" ? "append" : "replace"
      const info = notes.inspectSection(section)
      if (!info) return fromNotes(notes.editSection({ section, markdown, mode })) // reports "no such section"
      // Rewriting a section that contains the learner's own writing needs
      // their approval; appending, or rewriting Nova's own text, doesn't.
      if (mode === "replace" && info.hasLearnerContent) {
        const approval = await approveNotesChange(
          epoch,
          `Nova wants to rewrite your "${info.heading}" section. Allow it?`,
          { details: str(a?.explanation), preview: markdown },
          "the section wasn't changed"
        )
        if ("result" in approval) return approval.result
        return fromNotes(approval.notes.editSection({ section, markdown, mode }))
      }
      return fromNotes(notes.editSection({ section, markdown, mode }))
    })
  )
  useTutorTool("delete_note_section", (args) =>
    notesOp("delete_note_section", args, async (notes, epoch) => {
      const section = str((args as any)?.section) ?? ""
      const info = notes.inspectSection(section)
      if (!info) return fromNotes(notes.deleteSection(section))
      const approval = await approveNotesChange(
        epoch,
        `Nova wants to delete the "${info.heading}" section from your notes. Allow it?`,
        {
          details: `${info.blockCount} block(s)${info.hasLearnerContent ? ", including text you wrote" : ""}.`,
          preview: info.markdown,
        },
        "nothing was deleted"
      )
      if ("result" in approval) return approval.result
      return fromNotes(approval.notes.deleteSection(section))
    })
  )
  useTutorTool("restructure_notes", (args) =>
    notesOp("restructure_notes", args, async (notes, epoch) => {
      const a = args as any
      const hasContent = notes.getPlainText().trim().length > 0
      if (Array.isArray(a?.sections) && a.sections.length > 0) {
        // Preferred: reorganise existing blocks (formatting + authorship kept,
        // nothing dropped) under new headings.
        const sections = a.sections.map((s: any) => ({
          heading: str(s?.heading) ?? "",
          blockIds: Array.isArray(s?.block_ids) ? s.block_ids.map(String) : Array.isArray(s?.blockIds) ? s.blockIds.map(String) : [],
        }))
        if (!hasContent) return fromNotes(notes.reorganize({ sections }))
        const approval = await approveNotesChange(
          epoch,
          "Nova wants to reorganise your notes into sections. Allow it?",
          {
            details: `New sections: ${sections.map((s: { heading: string }) => s.heading).filter(Boolean).join(", ")}. Nothing is deleted - anything not placed goes under "Other notes".`,
          },
          "the notes weren't reorganised"
        )
        if ("result" in approval) return approval.result
        return fromNotes(approval.notes.reorganize({ sections }))
      }
      // The dashboard's shape: the complete reorganised document as
      // Markdown. Replaces everything, so the approval says so explicitly.
      const markdown = str(a?.content) ?? ""
      if (!markdown.trim()) return { ok: false, status: "invalid", message: "restructure_notes needs `content` (the complete reorganised notes)." }
      if (!hasContent) return fromNotes(notes.replaceAllWithMarkdown(markdown))
      const approval = await approveNotesChange(
        epoch,
        "Nova wants to replace your entire notes with a restructured version. Allow it?",
        {
          details: "This replaces everything currently in Notes. Prefer reorganising existing sections where possible.",
          preview: markdown,
        },
        "the notes weren't changed"
      )
      if ("result" in approval) return approval.result
      return fromNotes(approval.notes.replaceAllWithMarkdown(markdown))
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
                          <CodeEditorPanel
                            ref={codeRef}
                            sessionId={sessionId}
                            userId={userId}
                            onLearnerRun={handleLearnerRun}
                            onReady={handleCodeReady}
                          />
                        )}
                        {tool === "notes" && (
                          <NotesPanel ref={notesRef} sessionId={sessionId} userId={userId} onReady={handleNotesReady} />
                        )}
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
