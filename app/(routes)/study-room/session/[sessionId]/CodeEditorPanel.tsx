"use client"

import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react"
import Editor, { type OnMount } from "@monaco-editor/react"
import { useMutation, useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Play, Square, Copy, Trash2, Plus, X, Loader2 } from "lucide-react"
import { CODE_LANGUAGE_OPTIONS, getLanguageOption, type CodeRunResult } from "./workspaceTypes"
import SaveStatusBadge, { type SaveStatus } from "./SaveStatusBadge"
import { retryAsync } from "./retryAsync"

type MonacoEditor = Parameters<OnMount>[0]

// Phase 4 / Milestone 3 - what the Tutor learns about a run.
export type CodeRunStatus = "success" | "runtime_error" | "compile_error" | "timeout" | "failed" | "stopped"

export interface CodeRunSummary {
  status: CodeRunStatus
  filename: string
  language: string
  exitCode: number | null
  stdout: string
  stderr: string
  compileOutput?: string
  error?: string
  signal?: string | null
}

export type CodeWriteMode = "replace" | "append" | "replace_selection" | "insert_at_cursor"

export interface CodeWriteResult {
  ok: boolean
  message: string
  filename?: string
}

export interface CodeContext {
  filename: string
  language: string
  lineCount: number
  // Numbered lines ("12| code"); the whole file when it fits, otherwise a
  // window around the cursor (use read_code for the rest).
  code: string
  codeTruncated: boolean
  selection?: { text: string; startLine: number; endLine: number }
  cursor?: { line: number; column: number }
  surroundingCode?: string
  lastRun: CodeRunSummary | null
  files: { filename: string; language: string }[]
}

export interface CodeEditorHandle {
  // Phase 3 (C6) - files have loaded and there's an active file.
  isReady: () => boolean
  // Kept for compatibility with the original handle shape.
  readCode: () => { filename: string; language: string; content: string; lastRun: CodeRunResult | null } | null
  getContext: () => CodeContext | null
  readFile: (args: { filename?: string; startLine?: number; endLine?: number }) => {
    ok: boolean
    message: string
    filename?: string
    code?: string
  }
  // Content of the target (or active) file + whether it has a selection -
  // lets Workspace decide on approval before writing.
  inspectTarget: (filename?: string) => { filename: string; content: string; selectionText: string } | null
  writeCode: (args: { language?: string; content: string; mode: CodeWriteMode; filename?: string }) => CodeWriteResult
  runCode: (args: { filename?: string }) => Promise<CodeRunSummary>
}

interface CodeEditorPanelProps {
  sessionId: string
  userId: Id<"UserTable">
  // Phase 4 - called after a run the *learner* started with the Run button
  // (the Tutor's own runs return their result directly to the Tutor).
  onLearnerRun?: (summary: CodeRunSummary) => void
  // Called once the panel can serve Tutor operations (files loaded, active
  // file chosen) - lets the Workspace resume a Tutor tool call that opened
  // this panel instead of polling for it.
  onReady?: () => void
}

const MAX_CONTEXT_CODE_CHARS = 6000
const MAX_OUTPUT_CHARS = 3000

function numberLines(lines: string[], firstLine: number) {
  return lines.map((l, i) => `${firstLine + i}| ${l}`).join("\n")
}

function summarizeRun(result: CodeRunResult, filename: string, language: string, stopped = false): CodeRunSummary {
  const compileOutput = result.compile?.stderr || result.compile?.stdout || ""
  let status: CodeRunStatus
  if (stopped) status = "stopped"
  else if (result.error) status = "failed"
  // Piston kills the process with SIGKILL when it exceeds the run timeout.
  else if (result.signal === "SIGKILL") status = "timeout"
  else if (result.compile?.stderr && result.exitCode !== 0) status = "compile_error"
  else if (result.exitCode === 0) status = "success"
  else status = "runtime_error"
  return {
    status,
    filename,
    language,
    exitCode: result.exitCode ?? null,
    stdout: (result.stdout ?? "").slice(0, MAX_OUTPUT_CHARS),
    stderr: (result.stderr ?? "").slice(0, MAX_OUTPUT_CHARS),
    ...(compileOutput ? { compileOutput: compileOutput.slice(0, MAX_OUTPUT_CHARS) } : {}),
    ...(result.error ? { error: result.error } : {}),
    ...(result.signal ? { signal: result.signal } : {}),
  }
}

// Phase 2 (C5) - hoisted: @monaco-editor/react calls editor.updateOptions()
// whenever the `options` prop identity changes, so an inline object literal
// re-applied every option on every render. Same values as before.
const EDITOR_OPTIONS = {
  minimap: { enabled: false },
  fontSize: 13,
  lineNumbers: "on" as const,
  scrollBeyondLastLine: false,
  automaticLayout: true,
}

const STARTER_SNIPPET: Record<string, string> = {
  python: "# Write your code here\nprint(\"Hello from the AI Study Room!\")\n",
  javascript: "// Write your code here\nconsole.log(\"Hello from the AI Study Room!\");\n",
}

const CodeEditorPanel = forwardRef<CodeEditorHandle, CodeEditorPanelProps>(function CodeEditorPanel(
  { sessionId, userId, onLearnerRun, onReady },
  ref
) {
  const sid = sessionId as Id<"studyRoomSessions">
  const files = useQuery(api.StudyRoomWorkspace.GetCodeFiles, { userId, sessionId: sid })
  const createFile = useMutation(api.StudyRoomWorkspace.CreateCodeFile)
  const updateFile = useMutation(api.StudyRoomWorkspace.UpdateCodeFile)
  const deleteFile = useMutation(api.StudyRoomWorkspace.DeleteCodeFile)
  const recordRun = useMutation(api.StudyRoomWorkspace.RecordCodeRun)

  const [activeFileId, setActiveFileId] = useState<string | null>(null)
  const [localContent, setLocalContent] = useState<Record<string, string>>({})
  const [running, setRunning] = useState(false)
  const [runResult, setRunResult] = useState<CodeRunResult | null>(null)
  const [runResultFileId, setRunResultFileId] = useState<string | null>(null)
  const [clearedFiles, setClearedFiles] = useState<Set<string>>(new Set())
  const [copyLabel, setCopyLabel] = useState("Copy")
  const [saveStatusByFile, setSaveStatusByFile] = useState<Record<string, SaveStatus>>({})
  const bootstrappedRef = useRef(false)
  const saveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const abortRef = useRef<AbortController | null>(null)
  // Per-file bookkeeping for the M4 auto-save guarantees: what we last
  // successfully persisted (to skip a no-op save) and what `updatedAt` we
  // last saw (to detect a conflicting write from elsewhere).
  const lastSavedContentRef = useRef<Record<string, string>>({})
  const lastKnownUpdatedAtRef = useRef<Record<string, number>>({})
  // Phase 4 - the live Monaco instance (selection/cursor context and
  // targeted Tutor edits), and a synchronous "a run is in flight" guard so
  // the Run button and a Tutor run_code can never execute concurrently.
  const editorRef = useRef<MonacoEditor | null>(null)
  const runningRef = useRef(false)
  const handleEditorMount = useCallback<OnMount>((editorInstance) => {
    editorRef.current = editorInstance
  }, [])

  // Create a sensible default file the first time this session's Code
  // Editor is opened with nothing saved yet.
  useEffect(() => {
    if (bootstrappedRef.current || files === undefined) return
    bootstrappedRef.current = true
    if (files.length === 0) {
      createFile({
        userId,
        sessionId: sid,
        filename: "main.py",
        language: "python",
        content: STARTER_SNIPPET.python,
      }).catch((e) => console.error("Failed to create default code file:", e))
    } else {
      setActiveFileId(files[0]._id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files])

  useEffect(() => {
    if (!files || files.length === 0) return
    if (!activeFileId || !files.some((f) => f._id === activeFileId)) {
      setActiveFileId(files[0]._id)
    }
    // Seed last-known state for any file we haven't touched locally yet, so
    // the first edit's save correctly detects staleness/no-ops against what
    // is actually in the database.
    for (const f of files) {
      if (!(f._id in lastKnownUpdatedAtRef.current)) {
        lastKnownUpdatedAtRef.current[f._id] = f.updatedAt
        lastSavedContentRef.current[f._id] = f.content
      }
    }
  }, [files, activeFileId])

  const activeFile = files?.find((f) => f._id === activeFileId) ?? null
  const activeContent = activeFile ? localContent[activeFile._id] ?? activeFile.content : ""

  // The in-session run result if it belongs to the currently active file,
  // otherwise this file's last persisted run (M4) - so reopening a session,
  // or switching tabs, still shows what the code last did.
  function getDisplayedRun(file: typeof activeFile): CodeRunResult | null {
    if (!file) return null
    if (runResultFileId === file._id) return runResult
    if (clearedFiles.has(file._id) || !file.lastRun) return null
    return { stdout: file.lastRun.stdout, stderr: file.lastRun.stderr, exitCode: file.lastRun.exitCode ?? null }
  }
  const displayedRun = getDisplayedRun(activeFile)

  async function performSave(fileId: string, patch: { content?: string; language?: string; filename?: string }) {
    if (patch.content !== undefined && patch.content === lastSavedContentRef.current[fileId]) {
      setSaveStatusByFile((prev) => ({ ...prev, [fileId]: "saved" }))
      return
    }
    setSaveStatusByFile((prev) => ({ ...prev, [fileId]: "saving" }))
    try {
      const result = await retryAsync(() =>
        updateFile({
          userId,
          sessionId: sid,
          fileId: fileId as Id<"studyRoomCodeFiles">,
          expectedUpdatedAt: lastKnownUpdatedAtRef.current[fileId],
          ...patch,
        })
      )
      if (result && "ok" in result && !result.ok) {
        lastKnownUpdatedAtRef.current[fileId] = result.latestUpdatedAt
        setSaveStatusByFile((prev) => ({ ...prev, [fileId]: "error" }))
        return
      }
      if (patch.content !== undefined) lastSavedContentRef.current[fileId] = patch.content
      if (result && "updatedAt" in result) lastKnownUpdatedAtRef.current[fileId] = result.updatedAt
      setSaveStatusByFile((prev) => ({ ...prev, [fileId]: "saved" }))
    } catch (e) {
      console.error("Failed to save code file:", e)
      setSaveStatusByFile((prev) => ({ ...prev, [fileId]: "error" }))
    }
  }

  function scheduleSave(fileId: string, patch: { content?: string; language?: string; filename?: string }) {
    if (saveTimersRef.current[fileId]) clearTimeout(saveTimersRef.current[fileId])
    saveTimersRef.current[fileId] = setTimeout(() => performSave(fileId, patch), 600)
  }

  function handleEditorChange(value: string | undefined) {
    if (!activeFile) return
    const text = value ?? ""
    setLocalContent((prev) => ({ ...prev, [activeFile._id]: text }))
    scheduleSave(activeFile._id, { content: text })
  }

  // Phase 2 (C5) - @monaco-editor/react disposes and re-creates its
  // content-change subscription whenever `onChange` changes identity, so the
  // editor gets one stable callback that forwards to the latest handler
  // (kept current during render, so it always sees the active file).
  const handleEditorChangeRef = useRef(handleEditorChange)
  // eslint-disable-next-line react-hooks/refs -- intentional latest-handler ref
  handleEditorChangeRef.current = handleEditorChange
  const stableEditorChange = useCallback((value: string | undefined) => handleEditorChangeRef.current(value), [])

  function handleLanguageChange(value: string) {
    if (!activeFile) return
    scheduleSave(activeFile._id, { language: value })
  }

  function handleRetrySave() {
    if (!activeFile) return
    performSave(activeFile._id, { content: activeContent })
  }

  function handleAddFile() {
    const option = CODE_LANGUAGE_OPTIONS[0]
    createFile({
      userId,
      sessionId: sid,
      filename: `untitled.${option.extension}`,
      language: option.value,
      content: STARTER_SNIPPET[option.value] ?? "",
    })
      .then((res) => setActiveFileId(res.fileId))
      .catch((e) => console.error("Failed to add code file:", e))
  }

  function handleCloseFile(fileId: string) {
    if (!files || files.length <= 1) return
    deleteFile({ userId, sessionId: sid, fileId: fileId as Id<"studyRoomCodeFiles"> }).catch((e) =>
      console.error("Failed to delete code file:", e)
    )
  }

  // Shared by the Run button and the Tutor's run_code (Phase 4). Execution
  // always goes through the existing /api/study-room/code/run route - code
  // only ever runs in its isolated sandbox (Piston), never in this app's
  // server, with that route's language allow-list, size cap and timeouts.
  // Resolves to `null` only when the learner pressed Stop.
  async function executeRun(file: { _id: string; language: string }, content: string): Promise<CodeRunResult | null> {
    const fileId = file._id
    runningRef.current = true
    setRunning(true)
    setRunResult(null)
    setRunResultFileId(fileId)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const res = await fetch("/api/study-room/code/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: file.language, content }),
        signal: controller.signal,
      })
      const data = await res.json()
      const result: CodeRunResult = !res.ok
        ? { stdout: "", stderr: "", exitCode: null, error: data?.error ?? "Execution failed." }
        : data
      setRunResult(result)
      // Persisted regardless of success/failure (a failed run's stderr is
      // exactly what "execution history and output metadata" is for) -
      // never persisted for a Stop-triggered abort below, since that was
      // never a real execution result.
      recordRun({
        userId,
        sessionId: sid,
        fileId: fileId as Id<"studyRoomCodeFiles">,
        stdout: result.stdout,
        stderr: result.stderr || result.error || "",
        exitCode: result.exitCode ?? undefined,
      }).catch((e) => console.error("Failed to record code run:", e))
      return result
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") {
        const interrupted: CodeRunResult = { stdout: "", stderr: "", exitCode: null, error: "Execution was interrupted." }
        setRunResult(interrupted)
        return interrupted
      }
      return null
    } finally {
      runningRef.current = false
      setRunning(false)
      abortRef.current = null
    }
  }

  async function handleRun() {
    if (!activeFile || runningRef.current) return
    const file = activeFile
    const result = await executeRun(file, activeContent)
    onLearnerRun?.(summarizeRun(result ?? { stdout: "", stderr: "", exitCode: null }, file.filename, file.language, !result))
  }

  function handleStop() {
    abortRef.current?.abort()
  }

  function handleCopy() {
    navigator.clipboard
      ?.writeText(activeContent)
      .then(() => {
        setCopyLabel("Copied!")
        setTimeout(() => setCopyLabel("Copy"), 1500)
      })
      .catch(() => undefined)
  }

  // --- Phase 4 / Milestone 3: Tutor-facing Code Editor operations ----------

  function findTarget(filename?: string) {
    if (!files || files.length === 0) return null
    return (filename ? files.find((f) => f.filename === filename) : null) ?? activeFile ?? files[0]
  }

  function contentOf(file: { _id: string; content: string }) {
    return localContent[file._id] ?? file.content
  }

  // The Monaco model only reflects the *active* file, so selection/cursor
  // and targeted edits are only available for it.
  function liveEditorFor(fileId: string) {
    const instance = editorRef.current
    return instance && activeFile && activeFile._id === fileId && instance.getModel() ? instance : null
  }

  function lastRunSummary(file: NonNullable<typeof activeFile>): CodeRunSummary | null {
    const run = getDisplayedRun(file)
    return run ? summarizeRun(run, file.filename, file.language) : null
  }

  // Same condition as the handle's isReady(). Passive effects run after the
  // ref above is attached, so the Workspace sees the up-to-date handle.
  const panelReady = !!files && files.length > 0 && !!activeFile
  useEffect(() => {
    if (panelReady) onReady?.()
  }, [panelReady, onReady])

  useImperativeHandle(
    ref,
    () => ({
      isReady() {
        return panelReady
      },
      readCode() {
        if (!activeFile) return null
        return {
          filename: activeFile.filename,
          language: activeFile.language,
          content: activeContent,
          lastRun: getDisplayedRun(activeFile),
        }
      },
      getContext() {
        if (!activeFile || !files) return null
        const lines = activeContent.split("\n")
        const instance = liveEditorFor(activeFile._id)
        const position = instance?.getPosition() ?? null
        const sel = instance?.getSelection() ?? null
        const model = instance?.getModel() ?? null
        const cursorLine = position?.lineNumber ?? 1

        let code = numberLines(lines, 1)
        let codeTruncated = false
        if (code.length > MAX_CONTEXT_CODE_CHARS) {
          // Window around the cursor instead of the head of the file.
          const from = Math.max(1, cursorLine - 60)
          const to = Math.min(lines.length, cursorLine + 60)
          code = numberLines(lines.slice(from - 1, to), from).slice(0, MAX_CONTEXT_CODE_CHARS)
          codeTruncated = true
        }
        const surroundFrom = Math.max(1, cursorLine - 8)
        const surroundTo = Math.min(lines.length, cursorLine + 8)
        return {
          filename: activeFile.filename,
          language: activeFile.language,
          lineCount: lines.length,
          code,
          codeTruncated,
          ...(sel && model && !sel.isEmpty()
            ? {
                selection: {
                  text: model.getValueInRange(sel).slice(0, 3000),
                  startLine: sel.startLineNumber,
                  endLine: sel.endLineNumber,
                },
              }
            : {}),
          ...(position ? { cursor: { line: position.lineNumber, column: position.column } } : {}),
          ...(position ? { surroundingCode: numberLines(lines.slice(surroundFrom - 1, surroundTo), surroundFrom) } : {}),
          lastRun: lastRunSummary(activeFile),
          files: files.map((f) => ({ filename: f.filename, language: f.language })),
        }
      },
      readFile({ filename, startLine, endLine }) {
        const target = findTarget(filename)
        if (!target) return { ok: false, message: "The Code Editor isn't open yet." }
        if (filename && target.filename !== filename) return { ok: false, message: `There's no file named "${filename}".` }
        const lines = contentOf(target).split("\n")
        const from = Math.max(1, Math.floor(startLine ?? 1))
        const to = Math.min(lines.length, Math.floor(endLine ?? Math.min(lines.length, from + 399)), from + 399)
        return {
          ok: true,
          message: `Lines ${from}-${to} of ${lines.length} in ${target.filename}.`,
          filename: target.filename,
          code: numberLines(lines.slice(from - 1, to), from).slice(0, 12000),
        }
      },
      inspectTarget(filename) {
        const target = findTarget(filename)
        if (!target) return null
        const instance = liveEditorFor(target._id)
        const sel = instance?.getSelection() ?? null
        const model = instance?.getModel() ?? null
        return {
          filename: target.filename,
          content: contentOf(target),
          selectionText: sel && model && !sel.isEmpty() ? model.getValueInRange(sel) : "",
        }
      },
      writeCode({ language, content, mode, filename }) {
        const target = findTarget(filename)
        if (!target) return { ok: false, message: "The Code Editor isn't open yet." }
        if (filename && target.filename !== filename) return { ok: false, message: `There's no file named "${filename}".` }
        const validLanguage = language && CODE_LANGUAGE_OPTIONS.some((o) => o.value === language) ? language : undefined
        const instance = liveEditorFor(target._id)
        const model = instance?.getModel() ?? null

        // Targeted edit on the live editor: only the affected range changes,
        // so the learner's cursor/selection elsewhere, scroll position and
        // undo history (Ctrl+Z reverts the Tutor's edit) are preserved.
        if (instance && model) {
          let range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number } =
            model.getFullModelRange()
          let text = content
          if (mode === "append") {
            const end = model.getFullModelRange().getEndPosition()
            range = { startLineNumber: end.lineNumber, startColumn: end.column, endLineNumber: end.lineNumber, endColumn: end.column }
            text = `${model.getValue().endsWith("\n") || model.getValue() === "" ? "" : "\n"}${content}`
          } else if (mode === "replace_selection") {
            const sel = instance.getSelection()
            if (!sel || sel.isEmpty()) return { ok: false, message: "No code is selected in the editor." }
            range = sel
          } else if (mode === "insert_at_cursor") {
            const pos = instance.getPosition()
            if (!pos) return { ok: false, message: "The editor has no cursor position." }
            range = { startLineNumber: pos.lineNumber, startColumn: pos.column, endLineNumber: pos.lineNumber, endColumn: pos.column }
          }
          instance.pushUndoStop()
          instance.executeEdits("ai-tutor", [{ range, text, forceMoveMarkers: true }])
          instance.pushUndoStop()
          // The edit already updated localContent via onChange and scheduled
          // a save; replace that with one immediate save (content + any
          // language change together, so the two can't conflict).
          const next = model.getValue()
          if (saveTimersRef.current[target._id]) clearTimeout(saveTimersRef.current[target._id])
          setLocalContent((prev) => ({ ...prev, [target._id]: next }))
          performSave(target._id, { content: next, ...(validLanguage ? { language: validLanguage } : {}) })
        } else {
          if (mode === "replace_selection" || mode === "insert_at_cursor") {
            return { ok: false, message: `${target.filename} isn't the open file, so it has no selection or cursor.` }
          }
          const current = contentOf(target)
          const next = mode === "append" ? `${current}${current.endsWith("\n") || !current ? "" : "\n"}${content}` : content
          setLocalContent((prev) => ({ ...prev, [target._id]: next }))
          setActiveFileId(target._id)
          performSave(target._id, { content: next, ...(validLanguage ? { language: validLanguage } : {}) })
        }
        const verb =
          mode === "append"
            ? "Appended code to"
            : mode === "replace_selection"
              ? "Replaced the selected code in"
              : mode === "insert_at_cursor"
                ? "Inserted code at the cursor in"
                : "Replaced the contents of"
        return { ok: true, message: `${verb} ${target.filename}.`, filename: target.filename }
      },
      async runCode({ filename }) {
        const target = findTarget(filename)
        if (!target) {
          return { status: "failed", filename: filename ?? "", language: "", exitCode: null, stdout: "", stderr: "", error: "The Code Editor isn't open yet." }
        }
        if (runningRef.current) {
          return { status: "failed", filename: target.filename, language: target.language, exitCode: null, stdout: "", stderr: "", error: "Code is already running - wait for it to finish." }
        }
        const content = contentOf(target)
        if (!content.trim()) {
          return { status: "failed", filename: target.filename, language: target.language, exitCode: null, stdout: "", stderr: "", error: "The file is empty." }
        }
        setActiveFileId(target._id)
        const result = await executeRun(target, content)
        return summarizeRun(result ?? { stdout: "", stderr: "", exitCode: null }, target.filename, target.language, !result)
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [files, activeFile, activeContent, localContent, runResult, runResultFileId]
  )

  if (!files || !activeFile) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> Loading Code Editor...
      </div>
    )
  }

  const languageOption = getLanguageOption(activeFile.language)

  return (
    <div className="flex h-full w-full flex-col bg-card">
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-muted/40 px-2 py-1.5">
        {files.map((f) => (
          <button
            key={f._id}
            type="button"
            onClick={() => setActiveFileId(f._id)}
            className={`group flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium ${
              f._id === activeFileId ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:bg-card/60"
            }`}
          >
            {f.filename}
            {files.length > 1 && (
              <X
                className="size-3 opacity-0 group-hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation()
                  handleCloseFile(f._id)
                }}
              />
            )}
          </button>
        ))}
        <button
          type="button"
          onClick={handleAddFile}
          aria-label="Add file"
          className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-card/60"
        >
          <Plus className="size-3.5" />
        </button>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <select
          value={activeFile.language}
          onChange={(e) => handleLanguageChange(e.target.value)}
          className="rounded-lg border border-border bg-background px-2 py-1 text-xs font-medium text-foreground outline-none focus:border-primary"
        >
          {CODE_LANGUAGE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2.5">
          <SaveStatusBadge status={saveStatusByFile[activeFile._id] ?? "idle"} onRetry={handleRetrySave} />
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-muted"
          >
            <Copy className="size-3.5" /> {copyLabel}
          </button>
          {running ? (
            <button
              type="button"
              onClick={handleStop}
              className="inline-flex items-center gap-1 rounded-lg bg-destructive px-2.5 py-1 text-xs font-semibold text-destructive-foreground hover:opacity-90"
            >
              <Square className="size-3.5" /> Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={handleRun}
              className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90"
            >
              <Play className="size-3.5" /> Run
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <Editor
          height="100%"
          language={languageOption.monacoLanguage}
          value={activeContent}
          onChange={stableEditorChange}
          onMount={handleEditorMount}
          theme="light"
          options={EDITOR_OPTIONS}
        />
      </div>

      <div className="flex h-36 shrink-0 flex-col border-t border-border bg-[#0f172a]">
        <div className="flex items-center justify-between px-3 py-1.5 text-xs font-semibold text-slate-300">
          <span>Console</span>
          <button
            type="button"
            onClick={() => {
              setRunResult(null)
              setRunResultFileId(null)
              if (activeFile) setClearedFiles((prev) => new Set(prev).add(activeFile._id))
            }}
            className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-100"
          >
            <Trash2 className="size-3.5" /> Clear
          </button>
        </div>
        <pre className="flex-1 overflow-y-auto whitespace-pre-wrap px-3 pb-2 text-xs text-slate-100">
          {running
            ? "Running..."
            : displayedRun
              ? [
                  displayedRun.compile?.stderr ? `Compile error:\n${displayedRun.compile.stderr}` : null,
                  displayedRun.stdout,
                  displayedRun.stderr ? `\n${displayedRun.stderr}` : null,
                  displayedRun.error,
                  displayedRun.exitCode !== null && displayedRun.exitCode !== 0
                    ? `\nProcess exited with code ${displayedRun.exitCode}`
                    : null,
                ]
                  .filter(Boolean)
                  .join("")
              : "Run your code to see output here."}
        </pre>
      </div>
    </div>
  )
})

// Phase 2 - sessionId/userId (and the ref) are stable, so Workspace
// re-renders no longer re-render Monaco's wrapper.
export default memo(CodeEditorPanel)
