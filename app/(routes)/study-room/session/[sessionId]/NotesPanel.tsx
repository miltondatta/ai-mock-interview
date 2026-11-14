"use client"

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react"
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

export interface NotesHandle {
  appendBlock: (args: { heading?: string; content: string }) => string
  replaceContent: (args: { content: string }) => string
  getPlainText: () => string
}

interface NotesPanelProps {
  sessionId: string
  userId: Id<"UserTable">
}

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

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight,
      Placeholder.configure({ placeholder: "Start taking notes, or let Nova add some for you..." }),
    ],
    content: "",
    onUpdate: ({ editor: e }) => {
      contentRef.current = e.getHTML()
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(performSave, 800)
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

  useImperativeHandle(
    ref,
    () => ({
      appendBlock({ heading, content }) {
        if (!editor) return "Notes isn't open yet."
        const html = `<blockquote><p>🤖 Added by Nova${heading ? ` &middot; ${heading}` : ""}</p></blockquote><p>${content}</p>`
        editor.commands.focus("end")
        editor.commands.insertContent(html)
        contentRef.current = editor.getHTML()
        performSave()
        return "Added a note."
      },
      replaceContent({ content }) {
        if (!editor) return "Notes isn't open yet."
        editor.commands.setContent(`<p>${content}</p>`)
        contentRef.current = editor.getHTML()
        performSave()
        return "Notes have been restructured."
      },
      getPlainText() {
        return editor?.getText() ?? ""
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
          className="notes-editor text-sm leading-relaxed text-foreground [&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:pl-3 [&_blockquote]:text-xs [&_blockquote]:text-primary [&_h1]:text-lg [&_h1]:font-bold [&_h2]:text-base [&_h2]:font-bold [&_h3]:text-sm [&_h3]:font-bold [&_li]:ml-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-2 [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:text-xs [&_ul]:list-disc [&_ul]:pl-5 focus:outline-none"
        />
      </div>
    </div>
  )
})

export default NotesPanel
