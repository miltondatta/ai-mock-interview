"use client"

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react"
import Editor from "@monaco-editor/react"
import { useMutation, useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Play, Square, Copy, Trash2, Plus, X, Loader2 } from "lucide-react"
import { CODE_LANGUAGE_OPTIONS, getLanguageOption, type CodeRunResult } from "./workspaceTypes"
import SaveStatusBadge, { type SaveStatus } from "./SaveStatusBadge"
import { retryAsync } from "./retryAsync"

export interface CodeEditorHandle {
  writeCode: (args: { language?: string; content: string; mode: "replace" | "append"; filename?: string }) => string
  readCode: () => { filename: string; language: string; content: string; lastRun: CodeRunResult | null } | null
}

interface CodeEditorPanelProps {
  sessionId: string
  userId: Id<"UserTable">
}

const STARTER_SNIPPET: Record<string, string> = {
  python: "# Write your code here\nprint(\"Hello from the AI Study Room!\")\n",
  javascript: "// Write your code here\nconsole.log(\"Hello from the AI Study Room!\");\n",
}

const CodeEditorPanel = forwardRef<CodeEditorHandle, CodeEditorPanelProps>(function CodeEditorPanel(
  { sessionId, userId },
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

  async function handleRun() {
    if (!activeFile || running) return
    const fileId = activeFile._id
    setRunning(true)
    setRunResult(null)
    setRunResultFileId(fileId)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const res = await fetch("/api/study-room/code/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: activeFile.language, content: activeContent }),
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
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") {
        setRunResult({ stdout: "", stderr: "", exitCode: null, error: "Execution was interrupted." })
      }
    } finally {
      setRunning(false)
      abortRef.current = null
    }
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

  useImperativeHandle(
    ref,
    () => ({
      writeCode({ language, content, mode, filename }) {
        if (!files || files.length === 0) return "The Code Editor isn't open yet."
        const target = (filename ? files.find((f) => f.filename === filename) : null) ?? activeFile ?? files[0]
        const nextContent = mode === "append" ? `${localContent[target._id] ?? target.content}\n${content}` : content
        setLocalContent((prev) => ({ ...prev, [target._id]: nextContent }))
        setActiveFileId(target._id)
        performSave(target._id, { content: nextContent, ...(language ? { language } : {}) })
        return mode === "append"
          ? `Appended code to ${target.filename}.`
          : `Replaced the contents of ${target.filename}.`
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
          onChange={handleEditorChange}
          theme="light"
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            automaticLayout: true,
          }}
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

export default CodeEditorPanel
