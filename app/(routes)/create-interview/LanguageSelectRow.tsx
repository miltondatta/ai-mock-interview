import React from "react"
import { useLanguageOptions } from "../settings/languages"

interface LanguageSelectRowProps {
  icon: React.ElementType
  iconClassName: string
  title: string
  description: string
  value: string
  onChange: (value: string) => void
}

function LanguageSelectRow({ icon: Icon, iconClassName, title, description, value, onChange }: LanguageSelectRowProps) {
  const languageOptions = useLanguageOptions()
  const isAvailable = languageOptions.some((option) => option.value === value)
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-background p-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-2.5">
        <div className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${iconClassName}`}>
          <Icon className="size-4" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-0.5 max-w-xs text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full shrink-0 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:w-56"
      >
        {/* A saved language the admin has since removed isn't listed. */}
        {!isAvailable && (
          <option value={value} disabled hidden>
            Select a language…
          </option>
        )}
        {languageOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.flag} {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export default LanguageSelectRow
