"use client"

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react"
import { useConversationClientTool } from "@elevenlabs/react"
import { useMutation, useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Bot, Maximize2, Minimize2, X } from "lucide-react"
import WhiteboardPanel, { type ExcalidrawApi } from "./WhiteboardPanel"
import CodeEditorPanel, { type CodeEditorHandle } from "./CodeEditorPanel"
import NotesPanel, { type NotesHandle } from "./NotesPanel"
import ResizableSplitter from "./ResizableSplitter"
import ToolApprovalBanner from "./ToolApprovalBanner"
import { WORKSPACE_TOOLS, type PendingApproval, type WorkspaceTool } from "./workspaceTypes"

export interface WorkspaceHandle {
  openTool: (tool: WorkspaceTool) => void
}

interface WorkspaceProps {
  sessionId: string
  userId: Id<"UserTable">
  onOpenToolsChange: (hasAny: boolean) => void
}

const APPROVAL_TIMEOUT_MS = 30_000

function useBreakpoint(): "mobile" | "tablet" | "desktop" {
  const [width, setWidth] = useState(() => (typeof window !== "undefined" ? window.innerWidth : 1280))
  useEffect(() => {
    function onResize() {
      setWidth(window.innerWidth)
    }
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])
  if (width < 768) return "mobile"
  if (width < 1024) return "tablet"
  return "desktop"
}

const TOOL_ICON_LABEL: Record<WorkspaceTool, string> = { whiteboard: "Whiteboard", code: "Code Editor", notes: "Notes" }

const Workspace = forwardRef<WorkspaceHandle, WorkspaceProps>(function Workspace(
  { sessionId, userId, onOpenToolsChange },
  ref
) {
  const sid = sessionId as Id<"studyRoomSessions">
  const savedLayout = useQuery(api.StudyRoomWorkspace.GetWorkspaceLayout, { userId, sessionId: sid })
  const saveLayout = useMutation(api.StudyRoomWorkspace.SaveWorkspaceLayout)
  const logAction = useMutation(api.StudyRoomWorkspace.LogToolAction)

  const [openOrder, setOpenOrder] = useState<WorkspaceTool[]>([])
  const [activeTool, setActiveTool] = useState<WorkspaceTool | null>(null)
  const [maximizedTool, setMaximizedTool] = useState<WorkspaceTool | null>(null)
  const [weights, setWeights] = useState<Record<WorkspaceTool, number>>({ whiteboard: 1, code: 1, notes: 1 })
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null)

  const layoutLoadedRef = useRef(false)
  const excalidrawApiRef = useRef<ExcalidrawApi | null>(null)
  const codeRef = useRef<CodeEditorHandle | null>(null)
  const notesRef = useRef<NotesHandle | null>(null)
  const approvalResolverRef = useRef<((approved: boolean) => void) | null>(null)
  const approvalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const layoutSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  type ApprovalOutcome = "approved" | "rejected" | "timed_out"

  function requestApproval(tool: WorkspaceTool, description: string): Promise<ApprovalOutcome> {
    return new Promise((resolve) => {
      approvalResolverRef.current = (approved) => resolve(approved ? "approved" : "rejected")
      setPendingApproval({ tool, description })
      approvalTimerRef.current = setTimeout(() => {
        approvalResolverRef.current = null
        setPendingApproval(null)
        resolve("timed_out")
      }, APPROVAL_TIMEOUT_MS)
    })
  }

  function resolveApproval(approved: boolean) {
    if (approvalTimerRef.current) clearTimeout(approvalTimerRef.current)
    approvalResolverRef.current?.(approved)
    approvalResolverRef.current = null
    setPendingApproval(null)
  }

  function logResult(tool: WorkspaceTool, actionType: string, summary: string, status: "applied" | "rejected" | "timed_out") {
    logAction({ userId, sessionId: sid, tool, actionType, summary, status }).catch((e) =>
      console.error("Failed to log tool action:", e)
    )
  }

  // --- Whiteboard tool functions (operate on the real Excalidraw instance
  // via the API captured from WhiteboardPanel's excalidrawAPI callback) ---

  function whiteboardSummary(): string {
    const api = excalidrawApiRef.current
    if (!api) return "The whiteboard is currently closed."
    try {
      const elements = api.getSceneElements().filter((el: any) => !el.isDeleted)
      if (elements.length === 0) return "The whiteboard is empty."
      const texts = elements
        .filter((el: any) => el.type === "text")
        .map((el: any) => el.text)
        .filter(Boolean)
      return `The whiteboard has ${elements.length} element(s)${
        texts.length ? `, including: ${texts.slice(0, 12).join(", ")}` : ""
      }.`
    } catch {
      return "Couldn't read the whiteboard right now."
    }
  }

  async function whiteboardAddDiagram(args: {
    title?: string
    nodes: { id: string; label: string }[]
    edges: { from: string; to: string; label?: string }[]
  }): Promise<string> {
    openToolInternal("whiteboard")
    const api = excalidrawApiRef.current
    if (!api) return "I opened the whiteboard - please ask me again in a moment to draw it."
    if (!Array.isArray(args.nodes) || args.nodes.length === 0) return "I need at least one node to draw a diagram."
    try {
      const { convertToExcalidrawElements } = await import("@excalidraw/excalidraw")
      const existing = api.getSceneElements()
      const nodeWidth = 170
      const nodeHeight = 64
      const gapX = 90
      const baseY = 120 + Math.floor(existing.length / 6) * 180
      const positions: Record<string, { x: number; y: number; cx: number; cy: number }> = {}
      args.nodes.forEach((n, i) => {
        const x = 80 + i * (nodeWidth + gapX)
        positions[n.id] = { x, y: baseY, cx: x + nodeWidth / 2, cy: baseY + nodeHeight / 2 }
      })

      const skeletons: any[] = args.nodes.map((n) => ({
        type: "rectangle",
        x: positions[n.id].x,
        y: positions[n.id].y,
        width: nodeWidth,
        height: nodeHeight,
        backgroundColor: "#fff7ed",
        strokeColor: "#f97316",
        strokeWidth: 2,
        label: { text: n.label, fontSize: 15 },
      }))

      ;(args.edges ?? []).forEach((e) => {
        const a = positions[e.from]
        const b = positions[e.to]
        if (!a || !b) return
        skeletons.push({
          type: "arrow",
          x: a.cx,
          y: a.cy,
          points: [
            [0, 0],
            [b.cx - a.cx, b.cy - a.cy],
          ],
          strokeColor: "#78716c",
          strokeWidth: 2,
          ...(e.label ? { label: { text: e.label, fontSize: 12 } } : {}),
        })
      })

      if (args.title) {
        skeletons.unshift({ type: "text", x: 80, y: baseY - 36, text: args.title, fontSize: 20, strokeColor: "#1f2937" })
      }

      const newElements = convertToExcalidrawElements(skeletons)
      api.updateScene({ elements: [...existing, ...newElements] })
      const summary = `Added a diagram${args.title ? ` titled "${args.title}"` : ""} with ${args.nodes.length} node(s).`
      logResult("whiteboard", "create_diagram", summary, "applied")
      return summary
    } catch (e) {
      console.error("Whiteboard diagram tool failed:", e)
      return "I wasn't able to draw that on the whiteboard just now."
    }
  }

  function whiteboardHighlight(args: { labels: string[] }): string {
    const api = excalidrawApiRef.current
    if (!api) return "The whiteboard isn't open."
    try {
      const lowerLabels = (args.labels ?? []).map((l) => l.toLowerCase())
      let matched = 0
      const next = api.getSceneElements().map((el: any) => {
        if (el.type === "text" && el.text && lowerLabels.some((l) => el.text.toLowerCase().includes(l))) {
          matched++
          return { ...el, strokeColor: "#eab308", backgroundColor: "#fef9c3" }
        }
        return el
      })
      if (matched === 0) return "I couldn't find anything on the whiteboard matching that."
      api.updateScene({ elements: next })
      logResult("whiteboard", "highlight", `Highlighted ${matched} element(s).`, "applied")
      return `Highlighted ${matched} element(s) on the whiteboard.`
    } catch (e) {
      console.error("Whiteboard highlight tool failed:", e)
      return "I wasn't able to highlight that."
    }
  }

  async function whiteboardClear(): Promise<string> {
    const api = excalidrawApiRef.current
    if (!api) return "The whiteboard isn't open."
    const hasContent = api.getSceneElements().filter((el: any) => !el.isDeleted).length > 0
    if (hasContent) {
      const outcome = await requestApproval("whiteboard", "Nova wants to clear the whiteboard. Allow it?")
      if (outcome !== "approved") {
        logResult("whiteboard", "clear", "Clear whiteboard declined by learner.", outcome)
        return outcome === "timed_out"
          ? "The learner didn't respond in time, so nothing was cleared."
          : "The learner declined clearing the whiteboard."
      }
    }
    try {
      api.resetScene()
      // WhiteboardPanel's own onChange -> debounced, retried, conflict-safe
      // save (M4) picks this up automatically - no need to save here too.
      logResult("whiteboard", "clear", "Whiteboard cleared.", "applied")
      return "Cleared the whiteboard."
    } catch (e) {
      console.error(e)
      return "I wasn't able to clear the whiteboard."
    }
  }

  // --- Code Editor tool functions ---

  async function codeWrite(args: {
    language?: string
    content: string
    mode?: "replace" | "append"
    filename?: string
  }): Promise<string> {
    openToolInternal("code")
    if (!codeRef.current) return "I opened the Code Editor - please ask me again in a moment."
    const mode = args.mode === "append" ? "append" : "replace"
    const current = codeRef.current.readCode()
    if (mode === "replace" && current && current.content.trim().length > 0) {
      const outcome = await requestApproval(
        "code",
        `Nova wants to replace the code in ${current.filename}. Allow it?`
      )
      if (outcome !== "approved") {
        logResult("code", "replace", `Replace ${current.filename} declined by learner.`, outcome)
        return outcome === "timed_out"
          ? "The learner didn't respond in time, so the code wasn't changed."
          : "The learner declined this code change."
      }
    }
    const result = codeRef.current.writeCode({
      language: args.language,
      content: args.content,
      mode,
      filename: args.filename,
    })
    logResult("code", mode, result, "applied")
    return result
  }

  function codeRead(): string {
    const current = codeRef.current?.readCode()
    if (!current) return "The Code Editor is currently closed."
    const lastRun = current.lastRun
      ? `\nLast run - exit code ${current.lastRun.exitCode ?? "n/a"}. stdout: ${current.lastRun.stdout.slice(0, 400)} stderr: ${current.lastRun.stderr.slice(0, 400)}`
      : ""
    return `File ${current.filename} (${current.language}):\n${current.content.slice(0, 1500)}${lastRun}`
  }

  // --- Notes tool functions ---

  function noteCreate(args: { heading?: string; content: string }): string {
    openToolInternal("notes")
    if (!notesRef.current) return "I opened Notes - please ask me again in a moment."
    const result = notesRef.current.appendBlock({ heading: args.heading, content: args.content })
    logResult("notes", "append", `Added note${args.heading ? ` (${args.heading})` : ""}.`, "applied")
    return result
  }

  async function noteRestructure(args: { content: string }): Promise<string> {
    openToolInternal("notes")
    if (!notesRef.current) return "I opened Notes - please ask me again in a moment."
    const current = notesRef.current.getPlainText()
    if (current.trim().length > 0) {
      const outcome = await requestApproval("notes", "Nova wants to restructure your notes. Allow it?")
      if (outcome !== "approved") {
        logResult("notes", "restructure", "Restructure notes declined by learner.", outcome)
        return outcome === "timed_out"
          ? "The learner didn't respond in time, so the notes weren't changed."
          : "The learner declined restructuring the notes."
      }
    }
    const result = notesRef.current.replaceContent({ content: args.content })
    logResult("notes", "restructure", result, "applied")
    return result
  }

  function getWorkspaceContext(): string {
    const parts = [
      `Open tools: ${openOrder.length ? openOrder.map((t) => TOOL_ICON_LABEL[t]).join(", ") : "none"}.`,
      `Whiteboard: ${whiteboardSummary()}`,
      `Code Editor: ${codeRead()}`,
      `Notes: ${notesRef.current?.getPlainText()?.trim() ? notesRef.current.getPlainText().slice(0, 800) : "empty or closed."}`,
    ]
    return parts.join("\n")
  }

  function openWorkspaceTool(args: { tool: WorkspaceTool }): string {
    if (!WORKSPACE_TOOLS.some((t) => t.id === args.tool)) return "That isn't a tool I can open."
    openToolInternal(args.tool)
    return `Opened ${TOOL_ICON_LABEL[args.tool]}.`
  }

  // --- Register every Tutor-facing client tool. Each name must match a
  // "client tool" configured on the Study Room Tutor's ElevenLabs agent -
  // see AI_STUDY_ROOM_IMPLEMENTATION_PROGRESS.md's M3 ACTION REQUIRED
  // section for the exact names/parameters to add there.

  useConversationClientTool("get_workspace_context", getWorkspaceContext)
  useConversationClientTool("open_workspace_tool", openWorkspaceTool)
  useConversationClientTool("create_whiteboard_diagram", whiteboardAddDiagram)
  useConversationClientTool("highlight_whiteboard_elements", whiteboardHighlight)
  useConversationClientTool("clear_whiteboard", whiteboardClear)
  useConversationClientTool("write_code", codeWrite)
  useConversationClientTool("create_note", noteCreate)
  useConversationClientTool("restructure_notes", noteRestructure)

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
          onApprove={() => resolveApproval(true)}
          onReject={() => resolveApproval(false)}
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
              {effectiveVisible.map((tool) => (
                <div key={tool} className="flex min-w-0" style={{ flexGrow: weights[tool], flexBasis: 0 }}>
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
                        <WhiteboardPanel sessionId={sessionId} userId={userId} onApiReady={(api) => (excalidrawApiRef.current = api)} />
                      )}
                      {tool === "code" && <CodeEditorPanel ref={codeRef} sessionId={sessionId} userId={userId} />}
                      {tool === "notes" && <NotesPanel ref={notesRef} sessionId={sessionId} userId={userId} />}
                    </div>
                  </div>
                </div>
              ))}
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

export default Workspace
