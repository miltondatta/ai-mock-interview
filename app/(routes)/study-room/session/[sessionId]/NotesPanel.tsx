"use client"

import { forwardRef, memo, useEffect, useImperativeHandle, useRef, useState } from "react"
import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import TaskList from "@tiptap/extension-task-list"
import TaskItem from "@tiptap/extension-task-item"
import Highlight from "@tiptap/extension-highlight"
import Placeholder from "@tiptap/extension-placeholder"
import { useMutation, useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Bold, Italic, List, ListOrdered, ListChecks, Code, Highlighter as HighlighterIcon, Search, Copy, Download } from "lucide-react"
import SaveStatusBadge, { type SaveStatus } from "./SaveStatusBadge"
import { retryAsync } from "./retryAsync"
import { NotesAuthorship } from "./tutorTools/notesAuthorship"
import {
  blockIdFor,
  markdownToBlocks,
  nodeText,
  nodeToMarkdown,
  normalizeHeading,
  resolveBlockId,
  type JSONNode,
} from "./tutorTools/notesMarkdown"

// Phase 4 / Milestone 2 - structured results for the Tutor's Notes tools.
export interface NotesOpResult {
  ok: boolean
  message: string
  [key: string]: unknown
}

export interface NotesOutlineEntry {
  id: string
  type: string
  author: "tutor" | "learner"
  level?: number
  text: string
}

export interface NotesSectionInfo {
  heading: string
  blockCount: number
  hasLearnerContent: boolean
  markdown: string
}

export type NotesInsertPosition = "end" | "start" | "after_section" | "after_selection"

export interface NotesHandle {
  // Phase 3 (C6) - editor exists and the saved notes have been loaded.
  isReady: () => boolean
  getPlainText: () => string
  getSelectionText: () => string
  getOutline: () => NotesOutlineEntry[]
  readNotes: (args: { section?: string; maxChars?: number }) => NotesOpResult
  insertMarkdown: (args: {
    markdown: string
    heading?: string
    position?: NotesInsertPosition
    section?: string
  }) => NotesOpResult
  inspectSection: (section: string) => NotesSectionInfo | null
  editSection: (args: { section: string; markdown: string; mode: "replace" | "append" }) => NotesOpResult
  deleteSection: (section: string) => NotesOpResult
  // Reorders existing blocks (by block id) under new headings; every block
  // not mentioned is kept, after the organised sections.
  reorganize: (args: { sections: { heading: string; blockIds: string[] }[] }) => NotesOpResult
  replaceAllWithMarkdown: (markdown: string) => NotesOpResult
}

interface NotesPanelProps {
  sessionId: string
  userId: Id<"UserTable">
}

// Phase 2 (C5) - hoisted to module scope. TipTap 3's useEditor compares the
// `extensions` array element-by-element (by identity) on every render, and
// `.configure(...)` returns a new extension instance each call, so the
// inline list made that check fail on every render and call
// editor.setOptions() each time. Same extensions and configuration as before.
const NOTES_EXTENSIONS = [
  StarterKit,
  TaskList,
  TaskItem.configure({ nested: true }),
  Highlight,
  Placeholder.configure({ placeholder: "Start taking notes, or let Nova add some for you..." }),
  // Phase 4 - tags Tutor-written blocks (data-author="tutor").
  NotesAuthorship,
]

function htmlToMarkdown(html: string): string {
  if (typeof window === "undefined") return html
  const container = document.createElement("div")
  container.innerHTML = html

  function walk(node: ChildNode): string {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ""
    if (node.nodeType !== Node.ELEMENT_NODE) return ""
    const el = node as HTMLElement
    const inner = Array.from(el.childNodes).map(walk).join("")
    switch (el.tagName) {
      case "H1":
        return `# ${inner}\n\n`
      case "H2":
        return `## ${inner}\n\n`
      case "H3":
        return `### ${inner}\n\n`
      case "P":
        return `${inner}\n\n`
      case "STRONG":
      case "B":
        return `**${inner}**`
      case "EM":
      case "I":
        return `*${inner}*`
      case "MARK":
        return `==${inner}==`
      case "CODE":
        return `\`${inner}\``
      case "PRE":
        return `\`\`\`\n${el.textContent ?? ""}\n\`\`\`\n\n`
      case "BLOCKQUOTE":
        return `> ${inner}\n\n`
      case "UL":
        return `${inner}\n`
      case "OL":
        return `${inner}\n`
      case "LI": {
        const isTask = el.getAttribute("data-type") === "taskItem"
        if (isTask) {
          const checked = el.getAttribute("data-checked") === "true"
          return `- [${checked ? "x" : " "}] ${inner}\n`
        }
        return `- ${inner}\n`
      }
      default:
        return inner
    }
  }

  return Array.from(container.childNodes).map(walk).join("").trim()
}

const NotesPanel = forwardRef<NotesHandle, NotesPanelProps>(function NotesPanel({ sessionId, userId }, ref) {
  const sid = sessionId as Id<"studyRoomSessions">
  const saved = useQuery(api.StudyRoomWorkspace.GetNotes, { userId, sessionId: sid })
  const saveNotes = useMutation(api.StudyRoomWorkspace.SaveNotes)

  const [title, setTitle] = useState("Session Notes")
  const [saveState, setSaveState] = useState<SaveStatus>("idle")
  const [search, setSearch] = useState("")
  const loadedRef = useRef(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const contentRef = useRef("")
  const titleRef = useRef(title)
  // M4 auto-save guarantees, same pattern as Whiteboard/Code: skip a no-op
  // save, retry on failure, and never overwrite a newer write from
  // elsewhere without noticing.
  const lastSavedRef = useRef<{ title: string; content: string } | null>(null)
  const lastKnownUpdatedAtRef = useRef<number | undefined>(undefined)

  async function performSave() {
    const nextTitle = titleRef.current
    const nextContent = contentRef.current
    if (lastSavedRef.current && lastSavedRef.current.title === nextTitle && lastSavedRef.current.content === nextContent) {
      setSaveState("saved")
      return
    }
    setSaveState("saving")
    try {
      const result = await retryAsync(() =>
        saveNotes({
          userId,
          sessionId: sid,
          title: nextTitle,
          content: nextContent,
          expectedUpdatedAt: lastKnownUpdatedAtRef.current,
        })
      )
      if (result && "ok" in result && !result.ok) {
        lastKnownUpdatedAtRef.current = result.latestUpdatedAt
        setSaveState("error")
        return
      }
      lastSavedRef.current = { title: nextTitle, content: nextContent }
      if (result && "updatedAt" in result) lastKnownUpdatedAtRef.current = result.updatedAt
      setSaveState("saved")
    } catch (e) {
      console.error("Failed to save notes:", e)
      setSaveState("error")
    }
  }

  // Latest performSave for the debounced save (the editor's onUpdate is
  // captured by TipTap, so it goes through this ref rather than a closure).
  const performSaveRef = useRef(performSave)
  useEffect(() => {
    performSaveRef.current = performSave
  })

  const editor = useEditor({
    immediatelyRender: false,
    // TipTap 3's default, stated explicitly: typing doesn't re-render this
    // component (nothing here reads editor state during render).
    shouldRerenderOnTransaction: false,
    extensions: NOTES_EXTENSIONS,
    content: "",
    onUpdate: ({ editor: e }) => {
      contentRef.current = e.getHTML()
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => performSaveRef.current(), 800)
    },
  })

  useEffect(() => {
    if (!editor || loadedRef.current || saved === undefined) return
    loadedRef.current = true
    if (saved) {
      editor.commands.setContent(saved.content)
      contentRef.current = saved.content
      titleRef.current = saved.title
      setTitle(saved.title)
      lastSavedRef.current = { title: saved.title, content: saved.content }
      lastKnownUpdatedAtRef.current = saved.updatedAt
      setSaveState("saved")
    }
  }, [editor, saved])

  function handleTitleChange(value: string) {
    setTitle(value)
    titleRef.current = value
  }

  function handleTitleBlur() {
    performSave()
  }

  function handleSearch(query: string) {
    setSearch(query)
    if (!editor || !query.trim()) return
    const root = editor.view.dom as HTMLElement
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let node: Node | null
    while ((node = walker.nextNode())) {
      if (node.textContent?.toLowerCase().includes(query.toLowerCase())) {
        const parent = node.parentElement
        parent?.scrollIntoView({ behavior: "smooth", block: "center" })
        parent?.classList.add("bg-primary/15")
        setTimeout(() => parent?.classList.remove("bg-primary/15"), 1200)
        break
      }
    }
  }

  function handleCopy() {
    if (!editor) return
    navigator.clipboard?.writeText(editor.getText()).catch(() => undefined)
  }

  function handleExport() {
    if (!editor) return
    const markdown = htmlToMarkdown(editor.getHTML())
    const blob = new Blob([`# ${title}\n\n${markdown}`], { type: "text/markdown" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${title.replace(/\s+/g, "-").toLowerCase() || "session-notes"}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  // --- Phase 4 / Milestone 2: Tutor Notes operations --------------------------
  // Every change is a ProseMirror transaction on a specific range
  // (insertContentAt / deleteRange with updateSelection: false), so the
  // learner's cursor, selection and undo history survive, and untouched
  // content keeps its formatting and authorship. Tutor text arrives as
  // Markdown and is converted to editor JSON (never HTML) - see
  // tutorTools/notesMarkdown.ts. Each change then goes through the existing
  // autosave (retry + conflict detection) exactly like a manual edit.

  type TopBlock = { json: JSONNode; pos: number; size: number }

  function topBlocks(): TopBlock[] {
    const out: TopBlock[] = []
    editor!.state.doc.forEach((node, offset) => {
      out.push({ json: node.toJSON() as JSONNode, pos: offset, size: node.nodeSize })
    })
    return out
  }

  function isDocEmpty() {
    const doc = editor!.state.doc
    return doc.childCount === 1 && doc.firstChild!.type.name === "paragraph" && doc.firstChild!.content.size === 0
  }

  function authorOf(json: JSONNode): "tutor" | "learner" {
    return json.attrs?.author === "tutor" ? "tutor" : "learner"
  }

  function sectionHeadings(blocks: TopBlock[]) {
    return blocks.filter((b) => b.json.type === "heading").map((b) => nodeText(b.json))
  }

  // A section = a heading plus everything up to the next heading of the
  // same or higher level. Exact (normalized) title match first, else the
  // first heading containing the text.
  function findSection(section: string, blocks: TopBlock[]) {
    const target = normalizeHeading(section ?? "")
    if (!target) return null
    const headings = blocks.map((b, i) => ({ b, i })).filter((x) => x.b.json.type === "heading")
    const hit =
      headings.find((x) => normalizeHeading(nodeText(x.b.json)) === target) ??
      headings.find((x) => normalizeHeading(nodeText(x.b.json)).includes(target))
    if (!hit) return null
    const level = Number(hit.b.json.attrs?.level) || 1
    let end = blocks.length
    for (let j = hit.i + 1; j < blocks.length; j++) {
      const n = blocks[j].json
      if (n.type === "heading" && (Number(n.attrs?.level) || 1) <= level) {
        end = j
        break
      }
    }
    return { start: hit.i, end }
  }

  function endPos(blocks: TopBlock[], index: number) {
    return index < blocks.length ? blocks[index].pos : editor!.state.doc.content.size
  }

  function commit() {
    contentRef.current = editor!.getHTML()
    performSaveRef.current()
  }

  function notFound(section: string, blocks: TopBlock[]): NotesOpResult {
    return { ok: false, message: `There's no section titled "${section}" in the notes.`, availableSections: sectionHeadings(blocks) }
  }

  function guarded(fn: () => NotesOpResult): NotesOpResult {
    if (!editor) return { ok: false, message: "Notes isn't open yet." }
    try {
      return fn()
    } catch (e) {
      console.error("Notes tool operation failed:", e)
      return { ok: false, message: "That notes change couldn't be applied." }
    }
  }

  useImperativeHandle(
    ref,
    () => ({
      isReady() {
        return !!editor && loadedRef.current
      },
      getPlainText() {
        return editor?.getText() ?? ""
      },
      getSelectionText() {
        if (!editor) return ""
        const { from, to, empty } = editor.state.selection
        return empty ? "" : editor.state.doc.textBetween(from, to, "\n").slice(0, 2000)
      },
      getOutline() {
        if (!editor) return []
        return topBlocks()
          .map((b, i) => ({ b, i }))
          .filter(({ b }) => nodeText(b.json).trim() || b.json.type === "horizontalRule")
          .map(({ b, i }) => ({
            id: blockIdFor(i, b.json),
            type: b.json.type,
            author: authorOf(b.json),
            ...(b.json.type === "heading" ? { level: Number(b.json.attrs?.level) || 1 } : {}),
            text: nodeText(b.json).replace(/\s+/g, " ").slice(0, 100),
          }))
      },
      readNotes({ section, maxChars = 6000 }) {
        return guarded(() => {
          const blocks = topBlocks()
          let start = 0
          let end = blocks.length
          if (section) {
            const s = findSection(section, blocks)
            if (!s) return notFound(section, blocks)
            start = s.start
            end = s.end
          }
          let used = 0
          let truncated = false
          const out: { id: string; author: "tutor" | "learner"; markdown: string }[] = []
          for (let i = start; i < end; i++) {
            const markdown = nodeToMarkdown(blocks[i].json)
            if (!markdown.trim()) continue
            if (used + markdown.length > maxChars) {
              truncated = true
              break
            }
            used += markdown.length
            out.push({ id: blockIdFor(i, blocks[i].json), author: authorOf(blocks[i].json), markdown })
          }
          return { ok: true, message: section ? `Read section "${section}".` : "Read the notes.", title: titleRef.current, blocks: out, truncated }
        })
      },
      insertMarkdown({ markdown, heading, position = "end", section }) {
        return guarded(() => {
          const content = [
            ...(heading?.trim() ? markdownToBlocks(`## ${heading.trim()}`, "tutor") : []),
            ...markdownToBlocks(markdown ?? "", "tutor"),
          ]
          if (content.length === 0) return { ok: false, message: "There was no note content to add." }
          const blocks = topBlocks()
          const chain = editor!.chain()
          if (isDocEmpty()) {
            chain.insertContentAt({ from: 0, to: editor!.state.doc.content.size }, content, { updateSelection: false }).run()
          } else {
            let pos = editor!.state.doc.content.size
            if (position === "start") pos = 0
            else if (position === "after_section") {
              const s = section ? findSection(section, blocks) : null
              if (!s) return notFound(section ?? "", blocks)
              pos = endPos(blocks, s.end)
            } else if (position === "after_selection") {
              const index = editor!.state.doc.resolve(editor!.state.selection.to).index(0)
              pos = endPos(blocks, Math.min(index, blocks.length - 1) + 1)
            }
            chain.insertContentAt(pos, content, { updateSelection: false }).run()
          }
          commit()
          return { ok: true, message: `Added ${content.length} block(s) to the notes${heading ? ` under "${heading}"` : ""}.` }
        })
      },
      inspectSection(section) {
        if (!editor) return null
        const blocks = topBlocks()
        const s = findSection(section, blocks)
        if (!s) return null
        const body = blocks.slice(s.start + 1, s.end)
        return {
          heading: nodeText(blocks[s.start].json),
          blockCount: body.length,
          hasLearnerContent: body.some((b) => authorOf(b.json) === "learner" && nodeText(b.json).trim().length > 0),
          markdown: body.map((b) => nodeToMarkdown(b.json)).join("\n\n").slice(0, 1500),
        }
      },
      editSection({ section, markdown, mode }) {
        return guarded(() => {
          const blocks = topBlocks()
          const s = findSection(section, blocks)
          if (!s) return notFound(section, blocks)
          const content = markdownToBlocks(markdown ?? "", "tutor")
          if (content.length === 0) return { ok: false, message: "There was no note content to write." }
          const bodyStart = blocks[s.start].pos + blocks[s.start].size
          const bodyEnd = endPos(blocks, s.end)
          if (mode === "append") {
            editor!.chain().insertContentAt(bodyEnd, content, { updateSelection: false }).run()
          } else {
            editor!.chain().insertContentAt({ from: bodyStart, to: bodyEnd }, content, { updateSelection: false }).run()
          }
          commit()
          return {
            ok: true,
            message: `${mode === "append" ? "Added to" : "Rewrote"} the "${nodeText(blocks[s.start].json)}" section.`,
          }
        })
      },
      deleteSection(section) {
        return guarded(() => {
          const blocks = topBlocks()
          const s = findSection(section, blocks)
          if (!s) return notFound(section, blocks)
          editor!.chain().deleteRange({ from: blocks[s.start].pos, to: endPos(blocks, s.end) }).run()
          commit()
          return { ok: true, message: `Removed the "${nodeText(blocks[s.start].json)}" section.` }
        })
      },
      reorganize({ sections }) {
        return guarded(() => {
          const blocks = topBlocks()
          const jsons = blocks.map((b) => b.json)
          const used = new Set<number>()
          const unknownBlockIds: string[] = []
          const next: JSONNode[] = []
          for (const sec of Array.isArray(sections) ? sections : []) {
            const heading = typeof sec?.heading === "string" ? sec.heading.trim() : ""
            const indices: number[] = []
            for (const id of Array.isArray(sec?.blockIds) ? sec.blockIds : []) {
              const index = resolveBlockId(String(id), jsons)
              if (index === null) unknownBlockIds.push(String(id))
              else if (!used.has(index)) {
                used.add(index)
                indices.push(index)
              }
            }
            if (heading) next.push(...markdownToBlocks(`## ${heading}`, "tutor"))
            for (const index of indices) next.push(jsons[index])
          }
          if (used.size === 0) {
            return { ok: false, message: "None of the block ids matched the current notes - read them again first.", unknownBlockIds }
          }
          // Nothing is ever dropped: every block not placed above is kept.
          const leftovers = jsons.filter((j, i) => !used.has(i) && (nodeText(j).trim() || j.type === "horizontalRule"))
          if (leftovers.length) next.push(...markdownToBlocks("## Other notes", "tutor"), ...leftovers)
          editor!.chain().insertContentAt({ from: 0, to: editor!.state.doc.content.size }, next, { updateSelection: false }).run()
          commit()
          return {
            ok: true,
            message: `Organised the notes into ${sections.length} section(s).`,
            movedBlocks: used.size,
            keptUnassignedBlocks: leftovers.length,
            ...(unknownBlockIds.length ? { unknownBlockIds } : {}),
          }
        })
      },
      replaceAllWithMarkdown(markdown) {
        return guarded(() => {
          const content = markdownToBlocks(markdown ?? "", "tutor")
          if (content.length === 0) return { ok: false, message: "There was no note content to write." }
          editor!.chain().insertContentAt({ from: 0, to: editor!.state.doc.content.size }, content, { updateSelection: false }).run()
          commit()
          return { ok: true, message: "Replaced the notes." }
        })
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor]
  )

  return (
    <div className="flex h-full w-full flex-col bg-card">
      <div className="flex shrink-0 flex-col gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <input
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            onBlur={handleTitleBlur}
            className="min-w-0 flex-1 truncate bg-transparent text-sm font-bold text-foreground outline-none"
            aria-label="Notes title"
          />
          <span className="shrink-0">
            <SaveStatusBadge status={saveState} onRetry={performSave} />
          </span>
        </div>
        <div className="flex items-center gap-1 overflow-x-auto">
          <button type="button" onClick={() => editor?.chain().focus().toggleBold().run()} className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
            <Bold className="size-3.5" />
          </button>
          <button type="button" onClick={() => editor?.chain().focus().toggleItalic().run()} className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
            <Italic className="size-3.5" />
          </button>
          <button type="button" onClick={() => editor?.chain().focus().toggleBulletList().run()} className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
            <List className="size-3.5" />
          </button>
          <button type="button" onClick={() => editor?.chain().focus().toggleOrderedList().run()} className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
            <ListOrdered className="size-3.5" />
          </button>
          <button type="button" onClick={() => editor?.chain().focus().toggleTaskList().run()} className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
            <ListChecks className="size-3.5" />
          </button>
          <button type="button" onClick={() => editor?.chain().focus().toggleCodeBlock().run()} className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
            <Code className="size-3.5" />
          </button>
          <button type="button" onClick={() => editor?.chain().focus().toggleHighlight().run()} className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
            <HighlighterIcon className="size-3.5" />
          </button>
          <div className="mx-1 h-4 w-px bg-border" />
          <button type="button" onClick={handleCopy} title="Copy" className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
            <Copy className="size-3.5" />
          </button>
          <button type="button" onClick={handleExport} title="Export as Markdown" className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
            <Download className="size-3.5" />
          </button>
          <span
            className="ml-auto shrink-0 border-l-2 border-primary/40 pl-1.5 text-[10px] font-medium text-muted-foreground"
            title="Blocks with this left border were added by Nova"
          >
            Added by Nova
          </span>
        </div>
        <div className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2 py-1">
          <Search className="size-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search notes..."
            className="flex-1 bg-transparent text-xs text-foreground outline-none"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <EditorContent
          editor={editor}
          className="notes-editor text-sm leading-relaxed text-foreground [&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:pl-3 [&_blockquote]:text-xs [&_blockquote]:text-primary [&_h1]:text-lg [&_h1]:font-bold [&_h2]:text-base [&_h2]:font-bold [&_h3]:text-sm [&_h3]:font-bold [&_li]:ml-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-2 [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:text-xs [&_ul]:list-disc [&_ul]:pl-5 [&_[data-author=tutor]]:border-l-2 [&_[data-author=tutor]]:border-primary/40 [&_[data-author=tutor]:not(ul):not(ol)]:pl-3 focus:outline-none"
        />
      </div>
    </div>
  )
})

// Phase 2 - sessionId/userId (and the ref) are stable, so Workspace
// re-renders no longer re-render the TipTap editor's wrapper.
export default memo(NotesPanel)
