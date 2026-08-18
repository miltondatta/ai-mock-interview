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
            <span
                className={cn(
                    "text-xs font-medium",
                    isCandidate
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-blue-600 dark:text-blue-400"
                )}
            >
                {isCandidate ? "You" : "Interviewer"}
            </span>
            <div
                className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
                    isCandidate
                        ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
                        : "bg-blue-50 text-blue-900 dark:bg-blue-950/40 dark:text-blue-200",
                    pending && "opacity-60"
                )}
            >
                {text}
            </div>
        </div>
    )
}

export default ConversationMessage
