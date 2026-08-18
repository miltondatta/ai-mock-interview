"use client"

import { Loader2Icon } from "lucide-react"

function InterviewLoading({ message }: { message: string }) {
    return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-muted/30 text-muted-foreground">
            <Loader2Icon className="size-6 animate-spin" />
            <p className="text-sm">{message}</p>
        </div>
    )
}

export default InterviewLoading
