/* eslint-disable @typescript-eslint/no-explicit-any */
// Phase 4 / Milestone 1 - Whiteboard intelligence for the AI Tutor.
//
// Pure helpers operating on the live Excalidraw instance (the same
// imperative API Workspace already gets from WhiteboardPanel). Every change
// goes through `api.updateScene`, so it shows up on the canvas immediately
// and is persisted by WhiteboardPanel's existing debounced, conflict-checked
// autosave - nothing here talks to Convex directly.
//
// Excalidraw notes that shaped this file:
//  - `convertToExcalidrawElements` binds arrows only to elements in the same
//    skeleton batch and never recomputes arrow geometry, so arrow endpoints
//    are computed here (shape-boundary to shape-boundary) and bindings
//    (`startBinding`/`endBinding` + the shapes' `boundElements`) are written
//    directly. Excalidraw then keeps those arrows attached when the learner
//    drags a shape by hand.
//  - A shape's text label is a separate text element with `containerId`.
//  - Elements we change get a bumped `version`/`versionNonce` like
//    Excalidraw's own `newElementWith` does.

import type { ExcalidrawApi } from "../WhiteboardPanel"

// "cancelled" = the request was withdrawn without a learner decision: the
// panel was closed or the Study Room session ended/changed while waiting.
export type ApprovalOutcome = "approved" | "rejected" | "timed_out" | "cancelled"
export type Confirm = (description: string, details?: string) => Promise<ApprovalOutcome>

export interface ToolResult {
  ok: boolean
  status: "applied" | "declined" | "timed_out" | "cancelled" | "failed" | "not_found" | "invalid"
  message: string
  [key: string]: unknown
}

const SHAPE_TYPES = ["rectangle", "ellipse", "diamond"] as const
type ShapeType = (typeof SHAPE_TYPES)[number]
const LINEAR_TYPES = new Set(["arrow", "line"])

const NODE_STYLE = { backgroundColor: "#fff7ed", strokeColor: "#f97316", strokeWidth: 2 }
const ARROW_STYLE = { strokeColor: "#78716c", strokeWidth: 2 }
const ARROW_GAP = 6
const MAX_DIAGRAM_NODES = 40
const MAX_LABEL = 120

const STROKE_COLORS: Record<string, string> = {
  black: "#1e1e1e", gray: "#868e96", grey: "#868e96", red: "#e03131", pink: "#c2255c", purple: "#9c36b5",
  violet: "#6741d9", blue: "#1971c2", cyan: "#0c8599", teal: "#099268", green: "#2f9e44", yellow: "#f08c00",
  orange: "#f97316", brown: "#846358",
}
const BACKGROUND_COLORS: Record<string, string> = {
  white: "#ffffff", transparent: "transparent", gray: "#e9ecef", grey: "#e9ecef", red: "#ffc9c9", pink: "#fcc2d7",
  purple: "#eebefa", violet: "#d0bfff", blue: "#a5d8ff", cyan: "#99e9f2", teal: "#96f2d7", green: "#b2f2bb",
  yellow: "#ffec99", orange: "#fff7ed", brown: "#eaddd7",
}

function resolveColor(value: unknown, palette: Record<string, string>): string | undefined {
  if (typeof value !== "string") return undefined
  const v = value.trim().toLowerCase()
  if (palette[v]) return palette[v]
  if (/^#[0-9a-f]{3}([0-9a-f]{3})?([0-9a-f]{2})?$/.test(v)) return v
  return undefined
}

function cleanText(value: unknown, max = MAX_LABEL): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : ""
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function bump<T extends Record<string, any>>(el: T, patch: Partial<T> & Record<string, unknown> = {}): T {
  return {
    ...el,
    ...patch,
    version: (el.version ?? 1) + 1,
    versionNonce: Math.floor(Math.random() * 2 ** 31),
    updated: Date.now(),
  }
}

function newId(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

async function converter() {
  const { convertToExcalidrawElements } = await import("@excalidraw/excalidraw")
  return (skeletons: any[]) => convertToExcalidrawElements(skeletons, { regenerateIds: false }) as any[]
}

// --- Scene reading ----------------------------------------------------------

function notApproved(outcome: ApprovalOutcome, nothingDone: string, declinedMessage: string): ToolResult {
  if (outcome === "timed_out") return { ok: false, status: "timed_out", message: `The learner didn't respond in time; ${nothingDone}.` }
  if (outcome === "cancelled") {
    return { ok: false, status: "cancelled", message: `The whiteboard was closed or the session changed before the change could be made; ${nothingDone}.` }
  }
  return { ok: false, status: "declined", message: declinedMessage }
}

function liveElements(api: ExcalidrawApi): any[] {
  return (api.getSceneElements() as readonly any[]).filter((el) => !el.isDeleted)
}

function indexById(elements: any[]) {
  return new Map<string, any>(elements.map((el) => [el.id, el]))
}

function boundTextOf(el: any, byId: Map<string, any>) {
  const ref = (el.boundElements ?? []).find((b: any) => b.type === "text")
  return ref ? byId.get(ref.id) : undefined
}

function labelOf(el: any, byId: Map<string, any>): string {
  if (el.type === "text") return el.text ?? ""
  return boundTextOf(el, byId)?.text ?? ""
}

function isLabelText(el: any) {
  return el.type === "text" && !!el.containerId
}

function bounds(elements: any[]) {
  if (elements.length === 0) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const el of elements) {
    minX = Math.min(minX, el.x)
    minY = Math.min(minY, el.y)
    maxX = Math.max(maxX, el.x + Math.abs(el.width ?? 0))
    maxY = Math.max(maxY, el.y + Math.abs(el.height ?? 0))
  }
  return { minX, minY, maxX, maxY }
}

const r = (n: number) => Math.round(n)

// Concise structural description for get_workspace_context: shapes (id,
// type, label, position, size) and connections (id, from, to, label).
// Shape labels are folded into their shape rather than listed separately.
export function describeWhiteboard(api: ExcalidrawApi | null, limit = 40) {
  if (!api) return { open: false as const }
  try {
    const all = liveElements(api)
    const byId = indexById(all)
    const shapes: any[] = []
    const connections: any[] = []
    for (const el of all) {
      if (isLabelText(el)) continue
      if (LINEAR_TYPES.has(el.type)) {
        connections.push({
          id: el.id,
          type: el.type,
          from: el.startBinding?.elementId ?? null,
          to: el.endBinding?.elementId ?? null,
          ...(labelOf(el, byId) ? { label: labelOf(el, byId).slice(0, 80) } : {}),
        })
      } else {
        shapes.push({
          id: el.id,
          type: el.type,
          ...(labelOf(el, byId) ? { label: labelOf(el, byId).slice(0, 80) } : {}),
          x: r(el.x),
          y: r(el.y),
          width: r(el.width ?? 0),
          height: r(el.height ?? 0),
        })
      }
    }
    const b = bounds(all)
    return {
      open: true as const,
      empty: all.length === 0,
      shapeCount: shapes.length,
      connectionCount: connections.length,
      shapes: shapes.slice(0, limit),
      connections: connections.slice(0, limit),
      truncated: shapes.length > limit || connections.length > limit,
      ...(b ? { bounds: { x: r(b.minX), y: r(b.minY), width: r(b.maxX - b.minX), height: r(b.maxY - b.minY) } } : {}),
    }
  } catch (e) {
    console.error("Failed to describe whiteboard:", e)
    return { open: true as const, error: "Couldn't read the whiteboard right now." }
  }
}

// --- Geometry ---------------------------------------------------------------

function centerOf(el: any) {
  return { x: el.x + (el.width ?? 0) / 2, y: el.y + (el.height ?? 0) / 2 }
}

// Point on `el`'s outline in the direction of (tx, ty), pushed out by `gap`.
function boundaryPoint(el: any, tx: number, ty: number, gap = ARROW_GAP) {
  const c = centerOf(el)
  const dx = tx - c.x
  const dy = ty - c.y
  const len = Math.hypot(dx, dy) || 1
  const hw = Math.max(1, (el.width ?? 0) / 2)
  const hh = Math.max(1, (el.height ?? 0) / 2)
  let t: number
  if (el.type === "ellipse") t = 1 / Math.sqrt((dx / hw) ** 2 + (dy / hh) ** 2)
  else if (el.type === "diamond") t = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh)
  else t = Math.min(dx !== 0 ? hw / Math.abs(dx) : Infinity, dy !== 0 ? hh / Math.abs(dy) : Infinity)
  if (!Number.isFinite(t)) t = 0
  return { x: c.x + dx * t + (dx / len) * gap, y: c.y + dy * t + (dy / len) * gap }
}

function arrowGeometry(from: any, to: any) {
  const fc = centerOf(from)
  const tc = centerOf(to)
  const s = boundaryPoint(from, tc.x, tc.y)
  const e = boundaryPoint(to, fc.x, fc.y)
  const dx = e.x - s.x
  const dy = e.y - s.y
  return { x: s.x, y: s.y, width: Math.abs(dx), height: Math.abs(dy), points: [[0, 0], [dx, dy]] as [number, number][] }
}

// Re-routes every arrow attached to any of `changedIds` and re-centres its
// label. Returns the full updated element list.
function rerouteAttachedArrows(elements: any[], changedIds: Set<string>): any[] {
  const byId = indexById(elements)
  const updates = new Map<string, any>()
  for (const el of elements) {
    if (!LINEAR_TYPES.has(el.type) || el.isDeleted) continue
    const fromId = el.startBinding?.elementId
    const toId = el.endBinding?.elementId
    if (!changedIds.has(fromId) && !changedIds.has(toId)) continue
    const from = byId.get(fromId)
    const to = byId.get(toId)
    if (!from || !to) continue
    const routed = bump(el, arrowGeometry(from, to))
    updates.set(el.id, routed)
    const label = boundTextOf(el, byId)
    if (label) {
      const mid = { x: routed.x + routed.points[1][0] / 2, y: routed.y + routed.points[1][1] / 2 }
      updates.set(label.id, bump(label, { x: mid.x - label.width / 2, y: mid.y - label.height / 2 }))
    }
  }
  return elements.map((el) => updates.get(el.id) ?? el)
}

// --- Diagram layout -----------------------------------------------------------

interface DiagramNode {
  id: string
  label: string
  shape: ShapeType
  width: number
  height: number
}

function nodeSize(label: string, shape: ShapeType) {
  const base = Math.min(260, Math.max(140, 40 + label.length * 8))
  return shape === "diamond" ? { width: base * 1.3, height: 100 } : { width: base, height: 70 }
}

function layeredLayout(nodes: DiagramNode[], edges: { from: string; to: string }[], direction: "down" | "right") {
  const out = new Map(nodes.map((n) => [n.id, [] as string[]]))
  const parents = new Map(nodes.map((n) => [n.id, [] as string[]]))
  const indeg = new Map(nodes.map((n) => [n.id, 0]))
  for (const e of edges) {
    out.get(e.from)!.push(e.to)
    parents.get(e.to)!.push(e.from)
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1)
  }
  // BFS layering from the roots (cycle-safe: each node is layered once).
  const layer = new Map<string, number>()
  const bfs = (starts: string[]) => {
    const queue = [...starts]
    for (const s of starts) if (!layer.has(s)) layer.set(s, 0)
    while (queue.length) {
      const n = queue.shift()!
      for (const m of out.get(n) ?? []) {
        if (!layer.has(m)) {
          layer.set(m, layer.get(n)! + 1)
          queue.push(m)
        }
      }
    }
  }
  const roots = nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id)
  bfs(roots.length ? roots : [nodes[0].id])
  for (const n of nodes) if (!layer.has(n.id)) bfs([n.id])

  const layers: string[][] = []
  for (const n of nodes) {
    const l = layer.get(n.id)!
    ;(layers[l] ??= []).push(n.id)
  }
  // One barycenter pass to reduce crossings: order each layer by the mean
  // position of its parents in earlier layers.
  const position = new Map<string, number>()
  layers.forEach((ids, l) => {
    if (l > 0) {
      const score = (id: string) => {
        const ps = parents.get(id)!.filter((p) => position.has(p))
        return ps.length ? ps.reduce((sum, p) => sum + position.get(p)!, 0) / ps.length : Infinity
      }
      ids.sort((a, b) => score(a) - score(b))
    }
    ids.forEach((id, i) => position.set(id, i))
  })

  const sizeOf = new Map(nodes.map((n) => [n.id, n]))
  const cellW = Math.max(...nodes.map((n) => n.width)) + 70
  const cellH = Math.max(...nodes.map((n) => n.height)) + 90
  const pos = new Map<string, { x: number; y: number }>()
  layers.forEach((ids, l) => {
    ids.forEach((id, i) => {
      const n = sizeOf.get(id)!
      const offset = i - (ids.length - 1) / 2
      if (direction === "down") pos.set(id, { x: offset * cellW - n.width / 2, y: l * cellH - n.height / 2 })
      else pos.set(id, { x: l * (cellW + 40) - n.width / 2, y: offset * cellH - n.height / 2 })
    })
  })
  return pos
}

function conceptMapLayout(nodes: DiagramNode[], edges: { from: string; to: string }[]) {
  const degree = new Map(nodes.map((n) => [n.id, 0]))
  const neighbours = new Map(nodes.map((n) => [n.id, new Set<string>()]))
  for (const e of edges) {
    degree.set(e.from, degree.get(e.from)! + 1)
    degree.set(e.to, degree.get(e.to)! + 1)
    neighbours.get(e.from)!.add(e.to)
    neighbours.get(e.to)!.add(e.from)
  }
  const center = [...nodes].sort((a, b) => degree.get(b.id)! - degree.get(a.id)!)[0]
  const ring1 = nodes.filter((n) => n.id !== center.id && neighbours.get(center.id)!.has(n.id))
  const ring2 = nodes.filter((n) => n.id !== center.id && !neighbours.get(center.id)!.has(n.id))
  const maxW = Math.max(...nodes.map((n) => n.width))
  const r1 = Math.max(240, (ring1.length * (maxW + 40)) / (2 * Math.PI))
  const r2 = Math.max(r1 + 230, (ring2.length * (maxW + 40)) / (2 * Math.PI))
  const pos = new Map<string, { x: number; y: number }>()
  pos.set(center.id, { x: -center.width / 2, y: -center.height / 2 })
  const ring = (list: DiagramNode[], radius: number, phase: number) =>
    list.forEach((n, i) => {
      const a = (2 * Math.PI * i) / list.length - Math.PI / 2 + phase
      pos.set(n.id, { x: Math.cos(a) * radius - n.width / 2, y: Math.sin(a) * radius - n.height / 2 })
    })
  ring(ring1, r1, 0)
  ring(ring2, r2, ring2.length ? Math.PI / ring2.length : 0)
  return pos
}

function rowLayout(nodes: DiagramNode[]) {
  const pos = new Map<string, { x: number; y: number }>()
  let x = 0
  for (const n of nodes) {
    pos.set(n.id, { x, y: 0 })
    x += n.width + 90
  }
  return pos
}

// --- Tools ------------------------------------------------------------------

export async function createDiagram(api: ExcalidrawApi, args: any, confirm: Confirm): Promise<ToolResult> {
  const rawNodes: any[] = Array.isArray(args?.nodes) ? args.nodes : []
  if (rawNodes.length === 0) return { ok: false, status: "invalid", message: "A diagram needs at least one node." }
  if (rawNodes.length > MAX_DIAGRAM_NODES) {
    return { ok: false, status: "invalid", message: `A diagram can have at most ${MAX_DIAGRAM_NODES} nodes.` }
  }
  const seen = new Set<string>()
  const nodes: DiagramNode[] = []
  for (const [i, n] of rawNodes.entries()) {
    const id = cleanText(n?.id ?? `n${i + 1}`, 60) || `n${i + 1}`
    if (seen.has(id)) continue
    seen.add(id)
    const shape: ShapeType = (SHAPE_TYPES as readonly string[]).includes(n?.shape) ? n.shape : "rectangle"
    const label = cleanText(n?.label) || id
    nodes.push({ id, label, shape, ...nodeSize(label, shape) })
  }
  const skippedEdges: string[] = []
  const edges = (Array.isArray(args?.edges) ? args.edges : [])
    .map((e: any) => ({ from: cleanText(e?.from, 60), to: cleanText(e?.to, 60), label: cleanText(e?.label, 60) }))
    .filter((e: { from: string; to: string }) => {
      const ok = seen.has(e.from) && seen.has(e.to) && e.from !== e.to
      if (!ok) skippedEdges.push(`${e.from}->${e.to}`)
      return ok
    })

  const layout = ["flowchart", "hierarchy", "concept_map", "row"].includes(args?.layout) ? args.layout : "flowchart"
  const direction: "down" | "right" = args?.direction === "right" ? "right" : "down"
  const replace = args?.replace === true

  const existing = liveElements(api)
  if (replace && existing.length > 0) {
    const outcome = await confirm(
      "Nova wants to replace everything on the whiteboard with a new diagram. Allow it?",
      `${existing.length} existing element(s) would be removed.`
    )
    if (outcome !== "approved") return notApproved(outcome, "nothing was replaced", "The learner declined replacing the whiteboard.")
  }

  const rel =
    layout === "concept_map"
      ? conceptMapLayout(nodes, edges)
      : layout === "row"
        ? rowLayout(nodes)
        : layeredLayout(nodes, edges, direction)
  // Place below existing content (never on top of it) unless replacing.
  const existingBounds = replace ? null : bounds(existing)
  const title = cleanText(args?.title)
  const originX = existingBounds ? existingBounds.minX : 80
  const originY = (existingBounds ? existingBounds.maxY + 140 : 120) + (title ? 50 : 0)
  let minX = Infinity, minY = Infinity
  for (const p of rel.values()) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
  }

  const prefix = newId("tutor-")
  const elementIdFor = (nodeId: string) => `${prefix}-${nodeId.replace(/[^A-Za-z0-9_-]/g, "_")}`
  const convert = await converter()

  const nodeSkeletons = nodes.map((n) => {
    const p = rel.get(n.id)!
    return {
      type: n.shape,
      id: elementIdFor(n.id),
      x: originX + (p.x - minX),
      y: originY + (p.y - minY),
      width: n.width,
      height: n.height,
      ...NODE_STYLE,
      label: { text: n.label, fontSize: 16 },
    }
  })
  const nodeElements = convert(nodeSkeletons)
  const byId = indexById(nodeElements)

  const edgeForArrow = new Map<string, { from: string; to: string }>()
  const arrowSkeletons = edges.map((e: { from: string; to: string; label: string }, i: number) => {
    const from = byId.get(elementIdFor(e.from))
    const to = byId.get(elementIdFor(e.to))
    const arrowId = `${prefix}-e${i}`
    edgeForArrow.set(arrowId, e)
    return {
      type: "arrow",
      id: arrowId,
      ...arrowGeometry(from, to),
      ...ARROW_STYLE,
      ...(e.label ? { label: { text: e.label, fontSize: 13 } } : {}),
    }
  })
  const arrowElements = arrowSkeletons.length ? convert(arrowSkeletons) : []

  // Attach every arrow to its two shapes (both directions of the binding).
  const boundExtra = new Map<string, { id: string; type: "arrow" }[]>()
  const finalArrows = arrowElements.map((el: any) => {
    const edge = edgeForArrow.get(el.id)
    if (el.type !== "arrow" || !edge) return el
    const fromId = elementIdFor(edge.from)
    const toId = elementIdFor(edge.to)
    for (const target of [fromId, toId]) {
      boundExtra.set(target, [...(boundExtra.get(target) ?? []), { id: el.id, type: "arrow" }])
    }
    return {
      ...el,
      startBinding: { elementId: fromId, focus: 0, gap: ARROW_GAP },
      endBinding: { elementId: toId, focus: 0, gap: ARROW_GAP },
    }
  })
  const finalNodes = nodeElements.map((el: any) =>
    boundExtra.has(el.id) ? { ...el, boundElements: [...(el.boundElements ?? []), ...boundExtra.get(el.id)!] } : el
  )
  const titleElements = title
    ? convert([{ type: "text", id: `${prefix}-title`, x: originX, y: originY - 50, text: title, fontSize: 22, strokeColor: "#1f2937" }])
    : []

  const added = [...titleElements, ...finalNodes, ...finalArrows]
  api.updateScene({ elements: replace ? added : [...existing, ...added] })
  try {
    api.scrollToContent(added as any)
  } catch {
    // Scrolling is cosmetic.
  }

  return {
    ok: true,
    status: "applied",
    message: `${replace ? "Replaced the whiteboard with" : "Added"} a ${layout.replace("_", " ")} diagram${title ? ` titled "${title}"` : ""} with ${nodes.length} node(s) and ${finalArrows.filter((a: any) => a.type === "arrow").length} connection(s).`,
    nodeIds: Object.fromEntries(nodes.map((n) => [n.id, elementIdFor(n.id)])),
    connectionIds: finalArrows.filter((a: any) => a.type === "arrow").map((a: any) => a.id),
    ...(skippedEdges.length ? { skippedEdges } : {}),
  }
}

export async function addElement(api: ExcalidrawApi, args: any): Promise<ToolResult> {
  const type = args?.type === "text" ? "text" : (SHAPE_TYPES as readonly string[]).includes(args?.type) ? args.type : "rectangle"
  const label = cleanText(args?.label ?? args?.text, 200)
  if (type === "text" && !label) return { ok: false, status: "invalid", message: "A text element needs text." }
  const existing = liveElements(api)
  const b = bounds(existing)
  const x = num(args?.x) ?? (b ? b.maxX + 80 : 80)
  const y = num(args?.y) ?? (b ? b.minY : 120)
  const id = newId("tutor-el-")
  const convert = await converter()
  const stroke = resolveColor(args?.strokeColor, STROKE_COLORS)
  const background = resolveColor(args?.backgroundColor, BACKGROUND_COLORS)
  const skeleton =
    type === "text"
      ? { type: "text", id, x, y, text: label, fontSize: num(args?.fontSize) ?? 20, strokeColor: stroke ?? "#1f2937" }
      : {
          type,
          id,
          x,
          y,
          ...nodeSize(label || " ", type as ShapeType),
          ...(num(args?.width) ? { width: Math.min(800, Math.max(20, args.width)) } : {}),
          ...(num(args?.height) ? { height: Math.min(800, Math.max(20, args.height)) } : {}),
          ...NODE_STYLE,
          ...(stroke ? { strokeColor: stroke } : {}),
          ...(background ? { backgroundColor: background } : {}),
          ...(label ? { label: { text: label, fontSize: 16 } } : {}),
        }
  const created = convert([skeleton])
  api.updateScene({ elements: [...existing, ...created] })
  return { ok: true, status: "applied", message: `Added a ${type}${label ? ` "${label}"` : ""}.`, elementId: id }
}

export async function updateElement(api: ExcalidrawApi, args: any): Promise<ToolResult> {
  const all = liveElements(api)
  const byId = indexById(all)
  const el = byId.get(String(args?.id ?? ""))
  if (!el || isLabelText(el)) return { ok: false, status: "not_found", message: `No whiteboard element with id "${args?.id}".` }

  const stroke = resolveColor(args?.strokeColor, STROKE_COLORS)
  const background = resolveColor(args?.backgroundColor, BACKGROUND_COLORS)
  const width = num(args?.width)
  const height = num(args?.height)
  const newLabel = args?.label !== undefined || args?.text !== undefined ? cleanText(args?.label ?? args?.text, 200) : undefined

  const replacements = new Map<string, any>()
  const additions: any[] = []
  const removals = new Set<string>()
  let target = bump(el, {
    ...(stroke ? { strokeColor: stroke } : {}),
    ...(background && !LINEAR_TYPES.has(el.type) && el.type !== "text" ? { backgroundColor: background } : {}),
    ...(width && !LINEAR_TYPES.has(el.type) ? { width: Math.min(800, Math.max(20, width)) } : {}),
    ...(height && !LINEAR_TYPES.has(el.type) ? { height: Math.min(800, Math.max(20, height)) } : {}),
  })

  if (newLabel !== undefined) {
    const convert = await converter()
    if (el.type === "text") {
      if (!newLabel) return { ok: false, status: "invalid", message: "Use delete_whiteboard_elements to remove a text element." }
      const [fresh] = convert([{ type: "text", id: el.id, x: el.x, y: el.y, text: newLabel, fontSize: el.fontSize, strokeColor: target.strokeColor }])
      target = bump(el, { ...fresh, version: el.version, groupIds: el.groupIds, frameId: el.frameId, boundElements: el.boundElements })
    } else {
      const oldLabel = boundTextOf(el, byId)
      if (oldLabel) removals.add(oldLabel.id)
      const others = (target.boundElements ?? []).filter((b: any) => b.type !== "text")
      if (newLabel) {
        // Let Excalidraw lay the new label out inside (or along) the element.
        const skeleton = LINEAR_TYPES.has(el.type)
          ? { type: el.type, id: el.id, x: el.x, y: el.y, points: el.points, label: { text: newLabel, fontSize: 13 } }
          : { type: el.type, id: el.id, x: target.x, y: target.y, width: target.width, height: target.height, label: { text: newLabel, fontSize: 16 } }
        const converted = convert([skeleton])
        const freshContainer = converted.find((c: any) => c.id === el.id)
        const freshLabel = converted.find((c: any) => c.type === "text" && c.containerId === el.id)
        if (freshLabel) {
          additions.push(freshLabel)
          target = {
            ...target,
            ...(LINEAR_TYPES.has(el.type) ? {} : { width: freshContainer?.width ?? target.width, height: freshContainer?.height ?? target.height }),
            boundElements: [...others, { id: freshLabel.id, type: "text" }],
          }
        }
      } else {
        target = { ...target, boundElements: others }
      }
    }
  } else if ((width || height) && !LINEAR_TYPES.has(el.type)) {
    // Resized without a new label: re-centre the existing label.
    const label = boundTextOf(el, byId)
    if (label) {
      const c = centerOf(target)
      replacements.set(label.id, bump(label, { x: c.x - label.width / 2, y: c.y - label.height / 2 }))
    }
  }
  if (stroke && el.type !== "text") {
    const label = boundTextOf(el, byId)
    if (label && !removals.has(label.id)) replacements.set(label.id, bump(replacements.get(label.id) ?? label, { strokeColor: stroke }))
  }
  replacements.set(el.id, target)

  let next = all.filter((e) => !removals.has(e.id)).map((e) => replacements.get(e.id) ?? e)
  next = [...next, ...additions]
  next = rerouteAttachedArrows(next, new Set([el.id]))
  api.updateScene({ elements: next })
  return { ok: true, status: "applied", message: `Updated element ${el.id}.`, elementId: el.id }
}

export function moveElement(api: ExcalidrawApi, args: any): ToolResult {
  const all = liveElements(api)
  const byId = indexById(all)
  const el = byId.get(String(args?.id ?? ""))
  if (!el || isLabelText(el)) return { ok: false, status: "not_found", message: `No whiteboard element with id "${args?.id}".` }
  if (LINEAR_TYPES.has(el.type) && (el.startBinding || el.endBinding)) {
    return { ok: false, status: "invalid", message: "Connected arrows follow their shapes - move the shapes instead." }
  }
  const x = num(args?.x)
  const y = num(args?.y)
  const dx = num(args?.dx) ?? (x !== undefined ? x - el.x : 0)
  const dy = num(args?.dy) ?? (y !== undefined ? y - el.y : 0)
  if (!dx && !dy) return { ok: false, status: "invalid", message: "Give a new x/y position or a dx/dy offset." }
  const label = boundTextOf(el, byId)
  const updates = new Map<string, any>([[el.id, bump(el, { x: el.x + dx, y: el.y + dy })]])
  if (label) updates.set(label.id, bump(label, { x: label.x + dx, y: label.y + dy }))
  const next = rerouteAttachedArrows(all.map((e) => updates.get(e.id) ?? e), new Set([el.id]))
  api.updateScene({ elements: next })
  return { ok: true, status: "applied", message: `Moved element ${el.id}.`, elementId: el.id, x: r(el.x + dx), y: r(el.y + dy) }
}

// Removes elements plus everything that only makes sense with them: their
// labels, and arrows attached to them (with those arrows' labels). Always
// asks the learner first.
export async function deleteElements(api: ExcalidrawApi, args: any, confirm: Confirm): Promise<ToolResult> {
  const ids: string[] = (Array.isArray(args?.ids) ? args.ids : [args?.id]).filter((v: unknown) => typeof v === "string")
  const all = liveElements(api)
  const byId = indexById(all)
  const targets = ids.map((id) => byId.get(id)).filter((el) => el && !isLabelText(el))
  const missing = ids.filter((id) => !byId.has(id))
  if (targets.length === 0) return { ok: false, status: "not_found", message: "None of those whiteboard elements exist.", missing }

  const removal = new Set<string>(targets.map((t) => t.id))
  for (const el of all) {
    if (LINEAR_TYPES.has(el.type) && (removal.has(el.startBinding?.elementId) || removal.has(el.endBinding?.elementId))) {
      removal.add(el.id)
    }
  }
  for (const id of [...removal]) {
    const label = boundTextOf(byId.get(id), byId)
    if (label) removal.add(label.id)
  }
  const names = targets.map((t) => labelOf(t, byId) || t.type).slice(0, 6)
  const extraArrows = [...removal].filter((id) => !ids.includes(id) && LINEAR_TYPES.has(byId.get(id)?.type)).length
  const outcome = await confirm(
    `Nova wants to delete ${targets.length} element(s) from the whiteboard. Allow it?`,
    `${names.join(", ")}${targets.length > names.length ? ", ..." : ""}${extraArrows ? ` (plus ${extraArrows} attached connection(s))` : ""}`
  )
  if (outcome !== "approved") return notApproved(outcome, "nothing was deleted", "The learner declined the deletion.")
  // Drop references to removed arrows from the shapes that remain. Re-read
  // the scene: the learner may have drawn while the approval was pending,
  // and the pre-approval snapshot would silently discard that work.
  const next = liveElements(api)
    .filter((el) => !removal.has(el.id))
    .map((el) => {
      const refs = el.boundElements ?? []
      return refs.some((b: any) => removal.has(b.id)) ? bump(el, { boundElements: refs.filter((b: any) => !removal.has(b.id)) }) : el
    })
  api.updateScene({ elements: next })
  return {
    ok: true,
    status: "applied",
    message: `Deleted ${targets.length} element(s)${extraArrows ? ` and ${extraArrows} attached connection(s)` : ""}.`,
    deletedIds: [...removal],
    ...(missing.length ? { missing } : {}),
  }
}

export async function connectElements(api: ExcalidrawApi, args: any): Promise<ToolResult> {
  const all = liveElements(api)
  const byId = indexById(all)
  const from = byId.get(String(args?.from ?? ""))
  const to = byId.get(String(args?.to ?? ""))
  if (!from || !to || isLabelText(from) || isLabelText(to) || LINEAR_TYPES.has(from.type) || LINEAR_TYPES.has(to.type)) {
    return { ok: false, status: "not_found", message: "Both `from` and `to` must be ids of existing shapes on the whiteboard." }
  }
  if (from.id === to.id) return { ok: false, status: "invalid", message: "Can't connect an element to itself." }
  const label = cleanText(args?.label, 60)
  const id = newId("tutor-arrow-")
  const convert = await converter()
  const created = convert([
    { type: "arrow", id, ...arrowGeometry(from, to), ...ARROW_STYLE, ...(label ? { label: { text: label, fontSize: 13 } } : {}) },
  ]).map((el: any) =>
    el.id === id
      ? { ...el, startBinding: { elementId: from.id, focus: 0, gap: ARROW_GAP }, endBinding: { elementId: to.id, focus: 0, gap: ARROW_GAP } }
      : el
  )
  const next = all.map((el) =>
    el.id === from.id || el.id === to.id
      ? bump(el, { boundElements: [...(el.boundElements ?? []), { id, type: "arrow" }] })
      : el
  )
  api.updateScene({ elements: [...next, ...created] })
  return { ok: true, status: "applied", message: `Connected ${labelOf(from, byId) || from.id} to ${labelOf(to, byId) || to.id}.`, connectionId: id }
}

// Re-labels and/or re-points an existing connection.
export async function updateConnection(api: ExcalidrawApi, args: any): Promise<ToolResult> {
  const all = liveElements(api)
  const byId = indexById(all)
  const arrow = byId.get(String(args?.id ?? ""))
  if (!arrow || !LINEAR_TYPES.has(arrow.type)) {
    return { ok: false, status: "not_found", message: `No connection with id "${args?.id}".` }
  }
  const newFromId = typeof args?.from === "string" ? args.from : arrow.startBinding?.elementId
  const newToId = typeof args?.to === "string" ? args.to : arrow.endBinding?.elementId
  const from = byId.get(newFromId)
  const to = byId.get(newToId)
  if (!from || !to || LINEAR_TYPES.has(from.type) || LINEAR_TYPES.has(to.type) || from.id === to.id) {
    return { ok: false, status: "invalid", message: "The connection's endpoints must be two different existing shapes." }
  }
  const oldEnds = [arrow.startBinding?.elementId, arrow.endBinding?.elementId].filter(Boolean) as string[]
  let next = all.map((el) => {
    if (el.id === arrow.id) {
      return bump(el, {
        ...arrowGeometry(from, to),
        startBinding: { elementId: from.id, focus: 0, gap: ARROW_GAP },
        endBinding: { elementId: to.id, focus: 0, gap: ARROW_GAP },
      })
    }
    const wasEnd = oldEnds.includes(el.id)
    const isEnd = el.id === from.id || el.id === to.id
    if (wasEnd === isEnd) return el
    const refs = (el.boundElements ?? []).filter((b: any) => b.id !== arrow.id)
    return bump(el, { boundElements: isEnd ? [...refs, { id: arrow.id, type: "arrow" }] : refs })
  })
  api.updateScene({ elements: next })
  if (args?.label !== undefined) {
    const result = await updateElement(api, { id: arrow.id, label: args.label })
    if (!result.ok) return result
  } else {
    next = rerouteAttachedArrows(next, new Set([from.id, to.id]))
    api.updateScene({ elements: next })
  }
  return { ok: true, status: "applied", message: `Updated connection ${arrow.id}.`, connectionId: arrow.id }
}

// highlight_whiteboard_elements - recolours existing elements whose label
// (case-insensitive substring) or id matches. A matching shape label also
// highlights the shape it belongs to. Nothing else on the board is touched:
// only matched elements get new colours, everything else is passed through.
export function highlightElements(api: ExcalidrawApi, args: any): ToolResult {
  const labels: string[] = (Array.isArray(args?.labels) ? args.labels : typeof args?.labels === "string" ? [args.labels] : [])
    .map((l: unknown) => cleanText(l, 120))
    .filter(Boolean)
  const ids: string[] = (Array.isArray(args?.ids) ? args.ids : []).filter((v: unknown) => typeof v === "string")
  if (labels.length === 0 && ids.length === 0) {
    return { ok: false, status: "invalid", message: "highlight_whiteboard_elements needs at least one label." }
  }
  const all = liveElements(api)
  const byId = indexById(all)
  const hits = new Set<string>()
  const matchedLabels: string[] = []
  const unmatchedLabels: string[] = []
  for (const label of labels) {
    const needle = label.toLowerCase()
    let found = false
    for (const el of all) {
      if (el.type !== "text" || !String(el.text ?? "").toLowerCase().includes(needle)) continue
      found = true
      hits.add(el.id)
      if (el.containerId && byId.has(el.containerId)) hits.add(el.containerId)
    }
    ;(found ? matchedLabels : unmatchedLabels).push(label)
  }
  const unmatchedIds = ids.filter((id) => !byId.has(id))
  for (const id of ids) if (byId.has(id)) hits.add(id)

  if (hits.size === 0) {
    return {
      ok: false,
      status: "not_found",
      message: `Nothing on the whiteboard matched ${labels.length ? labels.map((l) => `"${l}"`).join(", ") : "those ids"}.`,
      ...(unmatchedLabels.length ? { unmatchedLabels } : {}),
      ...(unmatchedIds.length ? { unmatchedIds } : {}),
    }
  }
  const next = (api.getSceneElements() as readonly any[]).map((el) =>
    hits.has(el.id) && !el.isDeleted
      ? bump(el, {
          strokeColor: "#eab308",
          ...(el.type === "text" || LINEAR_TYPES.has(el.type) ? {} : { backgroundColor: "#fef9c3" }),
        })
      : el
  )
  api.updateScene({ elements: next })
  const partial = unmatchedLabels.length > 0 || unmatchedIds.length > 0
  return {
    ok: true,
    status: "applied",
    message: `Highlighted ${hits.size} element(s) on the whiteboard${matchedLabels.length ? ` for ${matchedLabels.map((l) => `"${l}"`).join(", ")}` : ""}.${
      unmatchedLabels.length ? ` No match for ${unmatchedLabels.map((l) => `"${l}"`).join(", ")}.` : ""
    }`,
    highlightedIds: [...hits],
    ...(partial ? { partial: true } : {}),
    ...(unmatchedLabels.length ? { unmatchedLabels } : {}),
    ...(unmatchedIds.length ? { unmatchedIds } : {}),
  }
}
