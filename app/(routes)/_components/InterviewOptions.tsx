"use client"

import React, { useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { Gauge, Hash, ListChecks } from 'lucide-react'

export const INTERVIEW_MODES = [
  { value: 'hr', label: 'HR Interview' },
  { value: 'technical', label: 'Technical' },
  { value: 'behavioral', label: 'Behavioral (STAR-based)' },
  { value: 'managerial', label: 'Managerial (Leadership & Management)' },
  { value: 'system-design', label: 'System Design' },
  { value: 'coding', label: 'Coding' },
  { value: 'case-study', label: 'Case Study (Business Scenarios)' },
  { value: 'project-management', label: 'Project Management' },
  { value: 'graduate-fresher', label: 'Graduate/Fresher' },
  { value: 'executive', label: 'Executive' },
  { value: 'stress', label: 'Stress Interview' },
  { value: 'rapid-fire', label: 'Rapid Fire' },
]

// Interview Modes are managed from the admin panel (Settings > Interview
// Preferences). INTERVIEW_MODES is the fallback while the list loads or before
// the admin has seeded it.
export function useInterviewModes() {
  const modes = useQuery(api.InterviewModes.ListInterviewModes)
  return modes && modes.length > 0
    ? modes.map(({ value, label }) => ({ value, label }))
    : INTERVIEW_MODES
}

// Used by Create Interview when the candidate hasn't saved their own
// defaults under Settings > Interview Preferences.
export const DEFAULT_INTERVIEW_MODE = 'technical'
export const DEFAULT_INTERVIEW_LEVEL = 'basic'
export const DEFAULT_QUESTION_COUNT = '2'

const LEVELS = [
  { value: 'basic', label: 'Basic' },
  { value: 'medium', label: 'Medium' },
  { value: 'advanced', label: 'Advanced' },
]

const QUESTION_COUNTS = [
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: 'custom', label: 'Custom' },
]

interface InterviewOptionsProps {
  mode: string
  level: string
  qno: string
  onHandleInputChange: (field: string, value: string) => void
}

function OptionPill({
  selected,
  onClick,
  children,
}: {
  selected: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
        selected
          ? 'border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/20'
          : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground'
      )}
    >
      {children}
    </button>
  )
}

function InterviewOptions({ mode, level, qno, onHandleInputChange }: InterviewOptionsProps) {
  const interviewModes = useInterviewModes()
  const isCustomQno = qno !== '2' && qno !== '3'
  const [qnoMode, setQnoMode] = useState<'2' | '3' | 'custom'>(isCustomQno ? 'custom' : (qno as '2' | '3'))
  const [customValue, setCustomValue] = useState(isCustomQno ? qno : '')
  const isCustomValueInvalid = qnoMode === 'custom' && customValue !== '' && Number(customValue) < 1

  const handleQnoModeChange = (nextQnoMode: '2' | '3' | 'custom') => {
    setQnoMode(nextQnoMode)
    onHandleInputChange('qno', nextQnoMode === 'custom' ? customValue : nextQnoMode)
  }

  const handleCustomValueChange = (value: string) => {
    setCustomValue(value)
    onHandleInputChange('qno', value)
  }

  return (
    <div className="mt-5">
      <div>
        <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <ListChecks className="size-4 text-primary" />
          Interview Modes
        </label>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {interviewModes.map((option) => (
            <OptionPill
              key={option.value}
              selected={mode === option.value}
              onClick={() => onHandleInputChange('mode', option.value)}
            >
              {option.label}
            </OptionPill>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Gauge className="size-4 text-primary" />
          Interview Level
        </label>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {LEVELS.map((option) => (
            <OptionPill
              key={option.value}
              selected={level === option.value}
              onClick={() => onHandleInputChange('level', option.value)}
            >
              {option.label}
            </OptionPill>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Hash className="size-4 text-primary" />
          No. of Questions
        </label>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {QUESTION_COUNTS.map((option) => (
            <OptionPill
              key={option.value}
              selected={qnoMode === option.value}
              onClick={() => handleQnoModeChange(option.value as '2' | '3' | 'custom')}
            >
              {option.label}
            </OptionPill>
          ))}
          {qnoMode === 'custom' && (
            <Input
              type="number"
              min={1}
              max={50}
              placeholder="Enter a number"
              value={customValue}
              onChange={(event) => handleCustomValueChange(event.target.value)}
              className="h-9 w-36"
            />
          )}
        </div>
        {isCustomValueInvalid && (
          <p className="mt-1.5 text-sm text-red-500">Minimum 1 Question need to be generated</p>
        )}
      </div>
    </div>
  )
}

export default InterviewOptions
