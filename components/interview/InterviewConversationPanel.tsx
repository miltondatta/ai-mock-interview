"use client"

import { useCallback, useEffect, useReducer, useRef } from "react"
import { useObservableEvent } from "@/components/cvi/hooks/cvi-events-hooks"
import ConversationMessage from "./ConversationMessage"

type Role = "user" | "pal" | "replica"

type Message = {
    id: string
    role: Role
    text: string
    seq: number
}

type UtteranceLikeEvent = {
    event_type?: string
    seq?: number
    inference_id?: string
    properties?: {
        role?: string
        speech?: string
        final?: boolean
    }
}

function isRole(role: string | undefined): role is Role {
    return role === "user" || role === "pal" || role === "replica"
}

function isUtteranceLikeEvent(event: unknown): event is UtteranceLikeEvent {
    return typeof event === "object" && event !== null && "event_type" in event
}

// `pal` and its legacy duplicate `replica` refer to the same speaker turn -
// collapse both onto one id so the interviewer's line doesn't render twice.
function messageId(inferenceId: string, role: Role): string {
    return `${inferenceId}:${role === "user" ? "user" : "pal"}`
}

function reducer(state: Message[], event: UtteranceLikeEvent): Message[] {
    const role = event.properties?.role
    const speech = event.properties?.speech
    const inferenceId = event.inference_id
    if (!speech || !inferenceId || !isRole(role)) return state

    const id = messageId(inferenceId, role)
    const next: Message = { id, role, text: speech, seq: event.seq ?? state.length }
    const existingIndex = state.findIndex((m) => m.id === id)

    if (existingIndex >= 0) {
        const copy = state.slice()
        copy[existingIndex] = next
        return copy
    }
    return [...state, next].sort((a, b) => a.seq - b.seq)
}

function InterviewConversationPanel() {
    const [messages, dispatch] = useReducer(reducer, [])
    const scrollRef = useRef<HTMLDivElement>(null)

    // The replica's finalized line arrives via `conversation.utterance`. The
    // candidate's speech is transcribed incrementally and its authoritative
    // finalized text only ever arrives via `conversation.utterance.streaming`
    // with `final: true` - the non-streaming event is replica-only in practice.
    useObservableEvent(
        useCallback((event: unknown) => {
            if (!isUtteranceLikeEvent(event)) return
            if (event.event_type === "conversation.utterance") {
                dispatch(event)
            } else if (
                event.event_type === "conversation.utterance.streaming" &&
                event.properties?.role === "user" &&
                event.properties?.final
            ) {
                dispatch(event)
            }
        }, [])
    )

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
                        role={message.role === "user" ? "candidate" : "interviewer"}
                        text={message.text}
                    />
                ))}
            </div>
        </div>
    )
}

export default InterviewConversationPanel
