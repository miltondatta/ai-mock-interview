import React from "react"

interface ComingSoonPanelProps {
  icon: React.ElementType
  title: string
  description: string
}

function ComingSoonPanel({ icon: Icon, title, description }: ComingSoonPanelProps) {
  return (
    <div className="flex flex-col">
      <div className="flex items-start gap-3 border-b border-border p-6">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-foreground">{title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="flex flex-col items-center justify-center gap-1 px-6 py-16 text-center">
        <p className="text-sm font-medium text-foreground">Coming soon</p>
        <p className="text-sm text-muted-foreground">This section isn&apos;t available yet.</p>
      </div>
    </div>
  )
}

export default ComingSoonPanel
