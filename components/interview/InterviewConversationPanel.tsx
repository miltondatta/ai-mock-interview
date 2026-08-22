"use client"

import { useEffect, useRef } from "react"
import ConversationMessage from "./ConversationMessage"

export type TranscriptMessage = {
    id: string
    role: "agent" | "candidate"
    text: string
}

interface InterviewConversationPanelProps {
    messages: TranscriptMessage[]
}

function InterviewConversationPanel({ messages }: InterviewConversationPanelProps) {
    const scrollRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
    }, [messages])

    return (
        <div className="flex h-full w-full flex-col rounded-2xl border border-border">
            <div className="border-b border-border px-5 py-4">
                <h2 className="text-sm font-semibold">Conversation</h2>
            </div>

            <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
                {messages.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                        The conversation will appear here once the interview begins.
                    </p>
                )}

                {messages.map((message) => (
                    <ConversationMessage
                        key={message.id}
                        role={message.role === "candidate" ? "candidate" : "interviewer"}
                        text={message.text}
                    />
                ))}
            </div>
        </div>
    )
}

export default InterviewConversationPanel
