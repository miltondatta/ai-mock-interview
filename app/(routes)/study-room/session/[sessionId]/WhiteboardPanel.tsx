"use client"

import dynamic from "next/dynamic"
import { useEffect, useRef, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
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

export type ExcalidrawApi = {
  getSceneElements: () => readonly any[]
  updateScene: (data: { elements?: readonly any[]; appState?: Record<string, unknown> }) => void
  resetScene: () => void
}

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
  }, [excalidrawApi, saved])

  useEffect(() => {
    onApiReady(excalidrawApi)
    return () => onApiReady(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [excalidrawApi])

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

  function handleChange(elements: readonly any[], appState: any) {
    pendingRef.current = { elements, background: appState?.viewBackgroundColor }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(performSave, 800)
  }

  return (
    <div className="relative h-full w-full">
      <div className="absolute right-2 top-2 z-10 rounded-md bg-card/90 px-2 py-1 shadow-sm">
        <SaveStatusBadge status={saveStatus} onRetry={performSave} />
      </div>
      <Excalidraw
        excalidrawAPI={(api: ExcalidrawApi) => setExcalidrawApi(api)}
        onChange={(elements, appState) => handleChange(elements, appState)}
        theme="light"
      />
    </div>
  )
}

export default WhiteboardPanel
