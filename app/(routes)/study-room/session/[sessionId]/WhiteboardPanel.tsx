"use client"

import dynamic from "next/dynamic"
import { memo, useCallback, useEffect, useRef, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import "@excalidraw/excalidraw/index.css"
import SaveStatusBadge, { type SaveStatus } from "./SaveStatusBadge"
import { retryAsync } from "./retryAsync"

// Excalidraw touches `window` at import time, so it must be loaded
// client-only - chosen over tldraw specifically because tldraw's SDK
// requires a commercial license (or shows a permanent "Made with tldraw"
// watermark) for production use outside non-commercial/eval cases, which
// does not fit a paid SaaS product. Excalidraw is MIT-licensed with no such
// requirement and already covers nearly every "required feature" in the M3
// spec out of the box: zoom/pan, selection, freehand draw, shapes, text,
// arrows/connectors, eraser, color/line-style controls, undo/redo, and
// export - this component only adds persistence and the Tutor hook-up.
const Excalidraw = dynamic(async () => (await import("@excalidraw/excalidraw")).Excalidraw, { ssr: false })

export type ExcalidrawApi = Pick<
  ExcalidrawImperativeAPI,
  "getSceneElements" | "updateScene" | "resetScene" | "scrollToContent"
>

interface WhiteboardPanelProps {
  sessionId: string
  userId: Id<"UserTable">
  onApiReady: (api: ExcalidrawApi | null) => void
}

function WhiteboardPanel({ sessionId, userId, onApiReady }: WhiteboardPanelProps) {
  const saved = useQuery(api.StudyRoomWorkspace.GetWhiteboard, {
    userId,
    sessionId: sessionId as Id<"studyRoomSessions">,
  })
  const saveSnapshot = useMutation(api.StudyRoomWorkspace.SaveWhiteboardSnapshot)

  const [excalidrawApi, setExcalidrawApi] = useState<ExcalidrawApi | null>(null)
  // Phase 3 (C6) - true once the saved scene has been applied (or there was
  // none), so the Tutor is only handed the API after that point; acting
  // earlier would be overwritten by the restore's updateScene.
  const [restored, setRestored] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle")
  const loadedRef = useRef(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedKeyRef = useRef<string | null>(null)
  const lastKnownUpdatedAtRef = useRef<number | undefined>(undefined)
  const pendingRef = useRef<{ elements: readonly any[]; background?: string } | null>(null)

  // Apply the session's saved scene exactly once, as soon as both the
  // Excalidraw instance and the Convex query have both resolved.
  useEffect(() => {
    if (!excalidrawApi || loadedRef.current || saved === undefined) return
    loadedRef.current = true
    if (saved) {
      lastKnownUpdatedAtRef.current = saved.updatedAt
      lastSavedKeyRef.current = JSON.stringify(saved.snapshot?.elements ?? [])
      if (saved.snapshot?.elements) {
        try {
          const background = saved.snapshot.appState?.viewBackgroundColor
          excalidrawApi.updateScene({
            elements: saved.snapshot.elements,
            ...(background ? { appState: { viewBackgroundColor: background } } : {}),
          })
        } catch (e) {
          console.error("Failed to restore whiteboard snapshot:", e)
        }
      }
    }
    setRestored(true)
  }, [excalidrawApi, saved])

  useEffect(() => {
    if (!excalidrawApi || !restored) return
    onApiReady(excalidrawApi)
    return () => onApiReady(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [excalidrawApi, restored])

  async function performSave() {
    const next = pendingRef.current
    if (!next) return
    pendingRef.current = null
    const key = JSON.stringify(next.elements)
    if (key === lastSavedKeyRef.current) {
      setSaveStatus("saved")
      return
    }
    setSaveStatus("saving")
    try {
      const result = await retryAsync(() =>
        saveSnapshot({
          userId,
          sessionId: sessionId as Id<"studyRoomSessions">,
          snapshot: { elements: next.elements, appState: { viewBackgroundColor: next.background } },
          expectedUpdatedAt: lastKnownUpdatedAtRef.current,
        })
      )
      if (result && "ok" in result && !result.ok) {
        // Something else saved more recently (another tab) - don't
        // overwrite it; just adopt its updatedAt so the next save compares
        // against the real latest state.
        lastKnownUpdatedAtRef.current = result.latestUpdatedAt
        setSaveStatus("error")
        return
      }
      lastSavedKeyRef.current = key
      if (result && "updatedAt" in result) lastKnownUpdatedAtRef.current = result.updatedAt
      setSaveStatus("saved")
    } catch (e) {
      console.error("Failed to save whiteboard:", e)
      setSaveStatus("error")
    }
  }

  // Phase 2 (C5) - Excalidraw is React.memo'd with a shallow prop compare;
  // the inline arrow callbacks it used to get were new on every render, so
  // every parent render (previously ~60/s from the waveform) re-rendered the
  // whole canvas. Both callbacks are now stable references. performSave is
  // reached through a latest-value ref, so the debounced save still always
  // uses the current props/mutation.
  const performSaveRef = useRef(performSave)
  useEffect(() => {
    performSaveRef.current = performSave
  })

  // Excalidraw fires onChange for pointer moves, scrolling, selection and
  // other appState-only updates too. Those can't change what gets saved
  // (elements + background), so they no longer reset the save timer. A
  // change is skipped only when it's the *same elements array* (no
  // updateScene replacement - e.g. the Tutor's highlight tool replaces the
  // array with recoloured copies that keep their old `version`) *and* the
  // same (count, version sum, background) - in-place edits bump an element's
  // `version`. Cleared after a failed save so the next interaction retries
  // it, as before.
  const lastScheduledSignatureRef = useRef<string | null>(null)
  const lastScheduledElementsRef = useRef<readonly any[] | null>(null)

  const handleChange = useCallback((elements: readonly any[], appState: any) => {
    const background = appState?.viewBackgroundColor
    let versionSum = 0
    for (const el of elements) versionSum += el?.version ?? 0
    const signature = `${elements.length}:${versionSum}:${background ?? ""}`
    if (elements === lastScheduledElementsRef.current && signature === lastScheduledSignatureRef.current) return
    lastScheduledElementsRef.current = elements
    lastScheduledSignatureRef.current = signature

    pendingRef.current = { elements, background }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => performSaveRef.current(), 800)
  }, [])

  const handleExcalidrawApi = useCallback((api: ExcalidrawImperativeAPI) => {
    setExcalidrawApi(api)
  }, [])

  useEffect(() => {
    if (saveStatus === "error") {
      lastScheduledSignatureRef.current = null
      lastScheduledElementsRef.current = null
    }
  }, [saveStatus])

  return (
    <div className="relative h-full w-full">
      <div className="absolute right-2 top-2 z-10 rounded-md bg-card/90 px-2 py-1 shadow-sm">
        <SaveStatusBadge status={saveStatus} onRetry={performSave} />
      </div>
      <Excalidraw excalidrawAPI={handleExcalidrawApi} onChange={handleChange} theme="light" />
    </div>
  )
}

// Phase 2 - props (sessionId, userId, Workspace's stable onApiReady) don't
// change during a session, so Workspace re-renders (splitter drags, layout
// changes, approval banner) no longer reach the canvas.
export default memo(WhiteboardPanel)
