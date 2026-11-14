"use client"

import { useRef } from "react"

interface ResizableSplitterProps {
  // Called continuously while dragging with a delta in [-1, 1] fractions of
  // the container's main-axis size, so the caller can translate it into
  // whatever flex-basis/percentage state it's tracking.
  onResize: (deltaFraction: number) => void
  direction?: "horizontal" | "vertical"
}

// A minimal hand-rolled drag handle instead of pulling in a resizable-panel
// library - the app has no other heavy layout dependency, and this is the
// only interaction the Study Room Workspace actually needs (drag to resize
// two or three panels against each other).
function ResizableSplitter({ onResize, direction = "horizontal" }: ResizableSplitterProps) {
  const containerSizeRef = useRef(0)

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault()
    const parent = e.currentTarget.parentElement
    containerSizeRef.current = direction === "horizontal" ? (parent?.clientWidth ?? 1) : (parent?.clientHeight ?? 1)
    const startPos = direction === "horizontal" ? e.clientX : e.clientY

    function handlePointerMove(moveEvent: PointerEvent) {
      const pos = direction === "horizontal" ? moveEvent.clientX : moveEvent.clientY
      const delta = (pos - startPos) / Math.max(1, containerSizeRef.current)
      onResize(delta)
    }
    function handlePointerUp() {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
    }
    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)
  }

  return (
    <div
      onPointerDown={handlePointerDown}
      role="separator"
      aria-orientation={direction === "horizontal" ? "vertical" : "horizontal"}
      className={
        direction === "horizontal"
          ? "group relative z-10 w-1.5 shrink-0 cursor-col-resize touch-none bg-border hover:bg-primary/40"
          : "group relative z-10 h-1.5 shrink-0 cursor-row-resize touch-none bg-border hover:bg-primary/40"
      }
    >
      <div
        className={
          direction === "horizontal"
            ? "absolute inset-y-0 left-1/2 w-3 -translate-x-1/2"
            : "absolute inset-x-0 top-1/2 h-3 -translate-y-1/2"
        }
      />
    </div>
  )
}

export default ResizableSplitter
