"use client"

import { useEffect, useRef } from "react"
import { MessageSquareText } from "lucide-react"
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
        <div className="flex h-full w-full flex-col rounded-2xl border border-border bg-card">
            <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
                <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <MessageSquareText className="size-4" />
                </div>
                <div>
                    <h2 className="text-sm font-semibold">Conversation</h2>
                    <p className="text-xs text-muted-foreground">Live transcript</p>
                </div>
            </div>

            <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
                {messages.length === 0 && (
                    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                        <p className="text-sm text-muted-foreground">
                            The conversation will appear here once the interview begins.
                        </p>
                    </div>
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
