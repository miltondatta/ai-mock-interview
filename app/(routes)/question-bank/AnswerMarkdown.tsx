"use client"

import React from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"

// Renders an AI-generated answer as GFM markdown. react-markdown never parses
// embedded raw HTML into real elements unless the rehype-raw plugin is added
// (which it isn't here), so arbitrary HTML/script content from the model is
// always shown as inert text rather than executed - no extra sanitizer needed.
const COMPONENTS: Components = {
  h1: ({ children }) => <h3 className="mt-6 text-xl font-bold text-foreground first:mt-0">{children}</h3>,
  h2: ({ children }) => <h3 className="mt-6 text-lg font-bold text-foreground first:mt-0">{children}</h3>,
  h3: ({ children }) => <h4 className="mt-5 text-base font-bold text-foreground first:mt-0">{children}</h4>,
  h4: ({ children }) => <h4 className="mt-5 text-base font-semibold text-foreground first:mt-0">{children}</h4>,
  p: ({ children }) => <p className="mt-3 leading-relaxed text-foreground/90 first:mt-0">{children}</p>,
  ul: ({ children }) => <ul className="mt-3 list-disc space-y-1.5 pl-5 leading-relaxed text-foreground/90">{children}</ul>,
  ol: ({ children }) => <ol className="mt-3 list-decimal space-y-1.5 pl-5 leading-relaxed text-foreground/90">{children}</ol>,
  li: ({ children }) => <li>{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer noopener" className="text-primary underline underline-offset-2">
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mt-3 border-l-2 border-success/40 pl-4 text-foreground/80 italic">{children}</blockquote>
  ),
  hr: () => <hr className="my-6 border-success/25" />,
  code: ({ className, children, ...props }) => {
    const isBlock = /language-/.test(className || "")
    if (isBlock) {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      )
    }
    return (
      <code className="rounded bg-foreground/10 px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">
        {children}
      </code>
    )
  },
  pre: ({ children }) => (
    <pre className="mt-3 overflow-x-auto rounded-lg bg-foreground/5 p-4 font-mono text-[0.85em] text-foreground">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="mt-3 overflow-x-auto rounded-lg border border-success/25">
      <table className="w-full min-w-[480px] border-collapse text-left text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-success/10 text-foreground">{children}</thead>,
  tbody: ({ children }) => <tbody className="divide-y divide-success/15">{children}</tbody>,
  th: ({ children }) => <th className="px-4 py-2.5 font-semibold">{children}</th>,
  td: ({ children }) => <td className="px-4 py-2.5 text-foreground/90">{children}</td>,
}

function AnswerMarkdown({ markdown }: { markdown: string }) {
  return (
    <div className="text-[15px]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {markdown}
      </ReactMarkdown>
    </div>
  )
}

export default AnswerMarkdown
