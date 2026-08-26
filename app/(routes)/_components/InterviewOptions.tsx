"use client"

import React, { useState } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { Gauge, Hash } from 'lucide-react'

const LEVELS = [
  { value: 'basic', label: 'Basic' },
  { value: 'medium', label: 'Medium' },
  { value: 'advanced', label: 'Advanced' },
]

const QUESTION_COUNTS = [
  { value: '3', label: '3' },
  { value: '5', label: '5' },
  { value: 'custom', label: 'Custom' },
]

interface InterviewOptionsProps {
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

function InterviewOptions({ level, qno, onHandleInputChange }: InterviewOptionsProps) {
  const isCustomQno = qno !== '3' && qno !== '5'
  const [qnoMode, setQnoMode] = useState<'3' | '5' | 'custom'>(isCustomQno ? 'custom' : (qno as '3' | '5'))
  const [customValue, setCustomValue] = useState(isCustomQno ? qno : '')
  const isCustomValueInvalid = qnoMode === 'custom' && customValue !== '' && Number(customValue) < 1

  const handleQnoModeChange = (mode: '3' | '5' | 'custom') => {
    setQnoMode(mode)
    onHandleInputChange('qno', mode === 'custom' ? customValue : mode)
  }

  const handleCustomValueChange = (value: string) => {
    setCustomValue(value)
    onHandleInputChange('qno', value)
  }

  return (
    <div className="mt-5 rounded-2xl border border-border bg-muted/20 p-6 md:p-8">
      <div>
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
              onClick={() => handleQnoModeChange(option.value as '3' | '5' | 'custom')}
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
