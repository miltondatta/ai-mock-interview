"use client"

import { TriangleAlertIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface InterviewErrorProps {
    message: string
    onRetry?: () => void
    dark?: boolean
}

function InterviewError({ message, onRetry, dark }: InterviewErrorProps) {
    return (
        <div
            className={cn(
                "flex h-full w-full flex-col items-center justify-center gap-3 rounded-2xl p-8 text-center",
                dark ? "bg-neutral-900" : "border border-destructive/30 bg-destructive/5"
            )}
        >
            <div className="flex size-11 items-center justify-center rounded-full bg-destructive/10">
                <TriangleAlertIcon className="size-5 text-destructive" />
            </div>
            <p className={cn("text-sm", dark ? "text-neutral-300" : "text-destructive")}>{message}</p>
            {onRetry && (
                <Button variant="outline" onClick={onRetry}>
                    Try Again
                </Button>
            )}
        </div>
    )
}

export default InterviewError
