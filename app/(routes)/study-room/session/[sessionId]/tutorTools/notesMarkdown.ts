// Phase 4 / Milestone 2 - Markdown <-> TipTap JSON for the AI Tutor's Notes
// tools.
//
// Safety: Tutor output is NEVER treated as HTML. Markdown is parsed into
// TipTap/ProseMirror JSON nodes whose text lives only in `text` fields, so
// any "<script>", "<img onerror=...>" or other markup the model emits is
// inserted as literal, inert text. Only the node/mark types the Notes
// editor's existing extensions support are produced (StarterKit + TaskList/
// TaskItem + Highlight); links are flattened to "text (url)" because the
// editor's schema isn't extended with link handling here.

export interface JSONMark {
  type: string
  attrs?: Record<string, unknown>
}

export interface JSONNode {
  type: string
  attrs?: Record<string, unknown>
  content?: JSONNode[]
  text?: string
  marks?: JSONMark[]
}

export type Author = "tutor" | null

// --- Inline -------------------------------------------------------------------

const INLINE_RE =
  /(`[^`\n]+`)|(\*\*[^*\n]+?\*\*)|(__[^_\n]+?__)|(~~[^~\n]+?~~)|(==[^=\n]+?==)|(\*[^*\s][^*\n]*?\*)|(\b_[^_\s][^_\n]*?_\b)|(\[[^\]\n]+\]\([^)\s]+\))/g

function pushText(out: JSONNode[], text: string, marks: JSONMark[]) {
  if (!text) return
  out.push(marks.length ? { type: "text", text, marks } : { type: "text", text })
}

function parseInlineLine(text: string, marks: JSONMark[], out: JSONNode[]) {
  const re = new RegExp(INLINE_RE.source, "g")
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > last) pushText(out, text.slice(last, m.index), marks)
    const tok = m[0]
    if (m[1]) {
      // ProseMirror's code mark excludes every other mark.
      pushText(out, tok.slice(1, -1), [{ type: "code" }])
    } else if (m[2] || m[3]) {
      parseInlineLine(tok.slice(2, -2), [...marks, { type: "bold" }], out)
    } else if (m[4]) {
      parseInlineLine(tok.slice(2, -2), [...marks, { type: "strike" }], out)
    } else if (m[5]) {
      parseInlineLine(tok.slice(2, -2), [...marks, { type: "highlight" }], out)
    } else if (m[6] || m[7]) {
      parseInlineLine(tok.slice(1, -1), [...marks, { type: "italic" }], out)
    } else if (m[8]) {
      const link = tok.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/)
      pushText(out, link ? `${link[1]} (${link[2]})` : tok, marks)
    }
    last = m.index + tok.length
  }
  if (last < text.length) pushText(out, text.slice(last), marks)
}

// Single newlines inside a paragraph become hard breaks, so the Tutor's line
// breaks survive instead of collapsing into one run-on line.
export function parseInline(text: string): JSONNode[] {
  const out: JSONNode[] = []
  text.split("\n").forEach((line, i) => {
    if (i > 0) out.push({ type: "hardBreak" })
    parseInlineLine(line, [], out)
  })
  return out
}

// --- Blocks -------------------------------------------------------------------

const FENCE_RE = /^\s*```\s*([\w+#.-]*)\s*$/
const FENCE_END_RE = /^\s*```\s*$/
const HEADING_RE = /^(#{1,6})\s+(.*)$/
const HR_RE = /^\s*([-*_])(\s*\1){2,}\s*$/
const QUOTE_RE = /^\s*>/
const LIST_ITEM_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/
const TASK_RE = /^\[( |x|X)\]\s+/

function isBlockStart(line: string) {
  return FENCE_RE.test(line) || HEADING_RE.test(line) || HR_RE.test(line) || QUOTE_RE.test(line) || LIST_ITEM_RE.test(line)
}

function paragraph(text: string): JSONNode {
  const content = parseInline(text)
  return content.length ? { type: "paragraph", content } : { type: "paragraph" }
}

interface ListItemDraft {
  text: string
  children: JSONNode[]
}

function parseList(lines: string[], start: number): [JSONNode, number] {
  const first = lines[start].match(LIST_ITEM_RE)!
  const indent = first[1].length
  const ordered = /\d/.test(first[2])
  const items: ListItemDraft[] = []
  let i = start
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      // A blank line only continues the list if the next item follows.
      let j = i + 1
      while (j < lines.length && !lines[j].trim()) j++
      const next = j < lines.length ? lines[j].match(LIST_ITEM_RE) : null
      if (next && next[1].length >= indent && /\d/.test(next[2]) === ordered) {
        i = j
        continue
      }
      break
    }
    const m = line.match(LIST_ITEM_RE)
    if (!m) {
      if (/^\s+/.test(line) && items.length && !isBlockStart(line)) {
        items[items.length - 1].text += `\n${line.trim()}`
        i++
        continue
      }
      break
    }
    const itemIndent = m[1].length
    if (itemIndent < indent) break
    if (itemIndent > indent && items.length) {
      const [child, next] = parseList(lines, i)
      items[items.length - 1].children.push(child)
      i = next
      continue
    }
    if (/\d/.test(m[2]) !== ordered) break
    items.push({ text: m[3], children: [] })
    i++
  }

  const isTaskList = !ordered && items.length > 0 && items.every((it) => TASK_RE.test(it.text))
  if (isTaskList) {
    return [
      {
        type: "taskList",
        content: items.map((it) => ({
          type: "taskItem",
          attrs: { checked: /^\[x\]/i.test(it.text) },
          content: [paragraph(it.text.replace(TASK_RE, "")), ...it.children],
        })),
      },
      i,
    ]
  }
  return [
    {
      type: ordered ? "orderedList" : "bulletList",
      ...(ordered ? { attrs: { start: Number.parseInt(first[2], 10) || 1 } } : {}),
      content: items.map((it) => ({ type: "listItem", content: [paragraph(it.text), ...it.children] })),
    },
    i,
  ]
}

function parseBlocks(md: string): JSONNode[] {
  const lines = md.replace(/\r\n?/g, "\n").split("\n")
  const blocks: JSONNode[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i++
      continue
    }
    const fence = line.match(FENCE_RE)
    if (fence) {
      const buf: string[] = []
      i++
      while (i < lines.length && !FENCE_END_RE.test(lines[i])) buf.push(lines[i++])
      i++
      const code = buf.join("\n")
      blocks.push({
        type: "codeBlock",
        attrs: { language: fence[1] || null },
        ...(code ? { content: [{ type: "text", text: code }] } : {}),
      })
      continue
    }
    const heading = line.match(HEADING_RE)
    if (heading) {
      const content = parseInline(heading[2].trim())
      if (content.length) blocks.push({ type: "heading", attrs: { level: Math.min(heading[1].length, 3) }, content })
      i++
      continue
    }
    if (HR_RE.test(line)) {
      blocks.push({ type: "horizontalRule" })
      i++
      continue
    }
    if (QUOTE_RE.test(line)) {
      const buf: string[] = []
      while (i < lines.length && QUOTE_RE.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ""))
      const inner = parseBlocks(buf.join("\n"))
      blocks.push({ type: "blockquote", content: inner.length ? inner : [{ type: "paragraph" }] })
      continue
    }
    if (LIST_ITEM_RE.test(line)) {
      const [list, next] = parseList(lines, i)
      blocks.push(list)
      i = next
      continue
    }
    const buf: string[] = []
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) buf.push(lines[i++].trim())
    blocks.push(paragraph(buf.join("\n")))
  }
  return blocks
}

// Top-level blocks carry the `author` attribute (see notesAuthorship.ts):
// "tutor" for Nova's content, null for the learner's.
export function markdownToBlocks(markdown: string, author: Author): JSONNode[] {
  const blocks = parseBlocks(markdown)
  return author ? blocks.map((b) => ({ ...b, attrs: { ...(b.attrs ?? {}), author } })) : blocks
}

// --- Reading (JSON -> plain text / markdown) -----------------------------------

export function nodeText(node: JSONNode): string {
  if (node.type === "text") return node.text ?? ""
  if (node.type === "hardBreak") return "\n"
  const sep = node.type === "doc" || /List$|^blockquote$/.test(node.type) ? "\n" : ""
  return (node.content ?? []).map(nodeText).join(sep)
}

function inlineToMarkdown(nodes: JSONNode[] = []): string {
  return nodes
    .map((n) => {
      if (n.type === "hardBreak") return "\n"
      if (n.type !== "text") return nodeText(n)
      let t = n.text ?? ""
      for (const mark of n.marks ?? []) {
        if (mark.type === "bold") t = `**${t}**`
        else if (mark.type === "italic") t = `*${t}*`
        else if (mark.type === "code") t = `\`${t}\``
        else if (mark.type === "strike") t = `~~${t}~~`
        else if (mark.type === "highlight") t = `==${t}==`
      }
      return t
    })
    .join("")
}

export function nodeToMarkdown(node: JSONNode, depth = 0): string {
  const pad = "  ".repeat(depth)
  switch (node.type) {
    case "heading":
      return `${"#".repeat(Number(node.attrs?.level) || 2)} ${inlineToMarkdown(node.content)}`
    case "paragraph":
      return inlineToMarkdown(node.content)
    case "codeBlock":
      return `\`\`\`${node.attrs?.language ?? ""}\n${nodeText(node)}\n\`\`\``
    case "blockquote":
      return (node.content ?? []).map((c) => nodeToMarkdown(c).replace(/^/gm, "> ")).join("\n")
    case "horizontalRule":
      return "---"
    case "bulletList":
    case "orderedList":
    case "taskList":
      return (node.content ?? [])
        .map((item, i) => {
          const marker =
            node.type === "orderedList"
              ? `${(Number(node.attrs?.start) || 1) + i}.`
              : node.type === "taskList"
                ? `- [${item.attrs?.checked ? "x" : " "}]`
                : "-"
          const [first, ...rest] = item.content ?? []
          const head = `${pad}${marker} ${first ? nodeToMarkdown(first) : ""}`
          const tail = rest.map((c) => nodeToMarkdown(c, depth + 1)).join("\n")
          return tail ? `${head}\n${tail}` : head
        })
        .join("\n")
    default:
      return nodeText(node)
  }
}

// --- Block ids ------------------------------------------------------------------

// Short content hash appended to a block's index ("b3-k2x9") so a stale id
// (the learner edited/moved things since the Tutor last read the notes) is
// detected instead of silently acting on the wrong block.
export function blockFingerprint(node: JSONNode): string {
  const s = `${node.type}:${nodeText(node)}`
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36).slice(0, 4)
}

export function blockIdFor(index: number, node: JSONNode) {
  return `b${index}-${blockFingerprint(node)}`
}

// Resolves a block id against the current top-level blocks: exact index +
// fingerprint first, otherwise the unique block with that fingerprint.
export function resolveBlockId(id: string, blocks: JSONNode[]): number | null {
  const m = /^b(\d+)-([a-z0-9]+)$/.exec(String(id).trim())
  if (!m) return null
  const index = Number(m[1])
  const fp = m[2]
  if (blocks[index] && blockFingerprint(blocks[index]) === fp) return index
  const matches = blocks.map((b, i) => (blockFingerprint(b) === fp ? i : -1)).filter((i) => i >= 0)
  return matches.length === 1 ? matches[0] : null
}

export function normalizeHeading(text: string) {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()
}
