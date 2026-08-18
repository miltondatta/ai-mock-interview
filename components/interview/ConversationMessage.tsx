"use client"

import { cn } from "@/lib/utils"

interface ConversationMessageProps {
    role: "interviewer" | "candidate"
    text: string
    pending?: boolean
}

function ConversationMessage({ role, text, pending }: ConversationMessageProps) {
    const isCandidate = role === "candidate"

    return (
        <div className={cn("flex flex-col gap-1", isCandidate ? "items-end" : "items-start")}>
            <span className="text-xs text-muted-foreground">
                {isCandidate ? "You" : "Interviewer"}
            </span>
            <div
                className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
                    isCandidate
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground",
                    pending && "opacity-60"
                )}
            >
                {text}
            </div>
        </div>
    )
}

export default ConversationMessage
