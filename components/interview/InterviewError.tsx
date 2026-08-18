"use client"

import { TriangleAlertIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

interface InterviewErrorProps {
    message: string
    onRetry?: () => void
}

function InterviewError({ message, onRetry }: InterviewErrorProps) {
    return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center">
            <TriangleAlertIcon className="size-6 text-destructive" />
            <p className="text-sm text-destructive">{message}</p>
            {onRetry && (
                <Button variant="outline" onClick={onRetry}>
                    Try Again
                </Button>
            )}
        </div>
    )
}

export default InterviewError
