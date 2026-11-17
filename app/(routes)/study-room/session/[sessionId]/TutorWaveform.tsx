"use client"

import { memo, useEffect, useRef } from "react"

// Phase 2 (C5) - the Tutor's voice-activity bars, isolated from the rest of
// the Study Room. Previously TutorCall kept the bar levels in React state
// and set it on every animation frame, re-rendering TutorCall and (through
// it) the whole Workspace - Excalidraw, Monaco and TipTap - ~60 times a
// second while connected. Here the requestAnimationFrame loop writes the bar
// heights straight to the DOM through refs, so animating causes zero React
// renders anywhere, and the loop only runs while the bars are actually on
// screen and animated.

const BAR_COUNT = 10
const IDLE_HEIGHT = 15

interface TutorWaveformProps {
  // Connected and either speaking or listening (TutorCall's former
  // `isAnimated`) - otherwise the bars rest at their idle height.
  animated: boolean
  // False while the waveform's container is hidden (a workspace tool is
  // open) - no point animating something display:none.
  visible: boolean
  // Output levels while Nova is audibly speaking, input levels otherwise
  // (same rule as before; an Interrupt silences her, so show the learner).
  speaking: boolean
  interrupting: boolean
  // Stable SDK action references (useConversation's controls).
  getInputData: () => Uint8Array
  getOutputData: () => Uint8Array
}

function TutorWaveform({ animated, visible, speaking, interrupting, getInputData, getOutputData }: TutorWaveformProps) {
  const barsRef = useRef<(HTMLSpanElement | null)[]>([])
  const useOutputRef = useRef(speaking && !interrupting)
  const getInputRef = useRef(getInputData)
  const getOutputRef = useRef(getOutputData)

  // Read by the running loop, so a speaking/interrupt change switches the
  // data source without restarting the loop.
  useEffect(() => {
    useOutputRef.current = speaking && !interrupting
    getInputRef.current = getInputData
    getOutputRef.current = getOutputData
  }, [speaking, interrupting, getInputData, getOutputData])

  useEffect(() => {
    const bars = barsRef.current
    const lastHeights: number[] = Array(BAR_COUNT).fill(-1)

    function paint(heights: number[]) {
      for (let i = 0; i < BAR_COUNT; i++) {
        const h = heights[i]
        // Skip the style write when a bar hasn't changed.
        if (lastHeights[i] === h) continue
        lastHeights[i] = h
        const bar = bars[i]
        if (bar) bar.style.height = `${h}%`
      }
    }

    if (!animated || !visible) {
      paint(Array(BAR_COUNT).fill(IDLE_HEIGHT))
      return
    }

    let frame = 0
    const heights: number[] = Array(BAR_COUNT).fill(IDLE_HEIGHT)
    function tick() {
      let data: Uint8Array | null = null
      try {
        data = useOutputRef.current ? getOutputRef.current() : getInputRef.current()
      } catch {
        // The conversation went away between frames - rest the bars.
        data = null
      }
      if (data && data.length > 0) {
        const step = Math.max(1, Math.floor(data.length / BAR_COUNT))
        for (let i = 0; i < BAR_COUNT; i++) {
          const level = Math.round(((data[i * step] ?? 0) / 255) * 100)
          heights[i] = Math.max(IDLE_HEIGHT, level)
        }
      } else {
        heights.fill(IDLE_HEIGHT)
      }
      paint(heights)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      paint(Array(BAR_COUNT).fill(IDLE_HEIGHT))
    }
  }, [animated, visible])

  return (
    <div className="flex h-7 items-center justify-center gap-[3px]">
      {Array.from({ length: BAR_COUNT }, (_, i) => (
        <span
          key={i}
          ref={(el) => {
            barsRef.current[i] = el
          }}
          className="w-[3px] rounded-full bg-primary transition-[height] duration-100"
          style={{ height: `${IDLE_HEIGHT}%` }}
        />
      ))}
    </div>
  )
}

export default memo(TutorWaveform)
