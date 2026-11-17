import { Extension } from "@tiptap/react"

// Phase 4 / Milestone 2 - authorship attribution for Notes.
//
// Adds an `author` attribute to the editor's top-level block types. Content
// the AI Tutor inserts is tagged `author: "tutor"` (rendered as
// `data-author="tutor"`, which is what persists in the saved HTML and what
// the editor styles with a primary-coloured left border); anything without
// it is the learner's.
//
// `keepOnSplit: false` means pressing Enter at the end of a Tutor paragraph
// starts an *untagged* (learner) paragraph rather than inheriting the tag.
// Limitation: a learner editing text *inside* a Tutor block doesn't change
// that block's tag.
export const NOTES_AUTHOR_BLOCK_TYPES = [
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "taskList",
  "codeBlock",
  "blockquote",
  "horizontalRule",
] as const

export const NotesAuthorship = Extension.create({
  name: "notesAuthorship",
  addGlobalAttributes() {
    return [
      {
        types: [...NOTES_AUTHOR_BLOCK_TYPES],
        attributes: {
          author: {
            default: null,
            keepOnSplit: false,
            parseHTML: (element: HTMLElement) => element.getAttribute("data-author") === "tutor" ? "tutor" : null,
            renderHTML: (attributes: Record<string, unknown>) =>
              attributes.author === "tutor" ? { "data-author": "tutor" } : {},
          },
        },
      },
    ]
  },
})
