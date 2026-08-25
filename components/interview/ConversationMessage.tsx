"use client"

import { UserIcon, BotIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface ConversationMessageProps {
    role: "interviewer" | "candidate"
    text: string
    pending?: boolean
}

function ConversationMessage({ role, text, pending }: ConversationMessageProps) {
    const isCandidate = role === "candidate"

    return (
        <div className={cn("flex items-end gap-2", isCandidate ? "flex-row-reverse" : "flex-row")}>
            <div
                className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full",
                    isCandidate ? "bg-success/15 text-success" : "bg-primary/15 text-primary"
                )}
            >
                {isCandidate ? <UserIcon className="size-3.5" /> : <BotIcon className="size-3.5" />}
            </div>
            <div className={cn("flex max-w-[80%] flex-col gap-1", isCandidate ? "items-end" : "items-start")}>
                <span className={cn("text-xs font-medium", isCandidate ? "text-success" : "text-primary")}>
                    {isCandidate ? "You" : "Interviewer"}
                </span>
                <div
                    className={cn(
                        "rounded-2xl px-4 py-2.5 text-sm",
                        isCandidate
                            ? "rounded-br-sm bg-success/10 text-foreground"
                            : "rounded-bl-sm bg-primary/10 text-foreground",
                        pending && "opacity-60"
                    )}
                >
                    {text}
                </div>
            </div>
        </div>
    )
}

export default ConversationMessage
