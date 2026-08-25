"use client"

import { Loader2Icon } from "lucide-react"
import { cn } from "@/lib/utils"

function InterviewLoading({ message, dark }: { message: string; dark?: boolean }) {
    return (
        <div
            className={cn(
                "flex h-full w-full flex-col items-center justify-center gap-3 rounded-2xl",
                dark
                    ? "bg-neutral-900 text-neutral-400"
                    : "border border-border bg-muted/30 text-muted-foreground"
            )}
        >
            <Loader2Icon className="size-6 animate-spin" />
            <p className="text-sm">{message}</p>
        </div>
    )
}

export default InterviewLoading
