"use client"

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useRouter } from 'next/navigation'
import { ArrowRight, Briefcase, CheckCircle2 } from 'lucide-react'
import React from 'react'
import { Doc } from '@/convex/_generated/dataModel'

const SUMMARY_MAX_LENGTH = 110;

function summarize(text: string) {
  const normalized = text.trim().replace(/\s+/g, ' ');
  return normalized.length > SUMMARY_MAX_LENGTH
    ? `${normalized.slice(0, SUMMARY_MAX_LENGTH).trimEnd()}...`
    : normalized;
}

function InterviewCard({ interview }: { interview: Doc<'InterviewSessionTable'> }) {
  const router = useRouter();
  const isCompleted = interview.status === 'completed';
  const isJobDescriptionType = !!interview.jobDescription;

  const onStartInterview = () => {
    router.push(`/interview/${interview._id}/start`);
  }

  return (
    <div className='flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 transition-shadow hover:shadow-sm'>
      <div className='flex items-start justify-between gap-3'>
        <div className='flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary'>
          <Briefcase className='size-5' />
        </div>
        <Badge variant={isCompleted ? 'success' : 'secondary'}>
          {isCompleted && <CheckCircle2 className='size-3' />}
          {isCompleted ? 'Complete' : 'Draft'}
        </Badge>
      </div>
      <div>
        <h3 className='font-semibold text-base leading-snug'>{interview.jobTitle || 'Resume-based Interview'}</h3>
        <p className='mt-1.5 text-sm text-muted-foreground'>
          {isJobDescriptionType
            ? summarize(interview.jobDescription as string)
            : interview.resumeFileName || 'Resume'}
        </p>
      </div>
      <div className='mt-1 flex gap-2.5'>
        <Button onClick={onStartInterview} className='w-fit'>
          Start Interview <ArrowRight />
        </Button>
        {isCompleted && (
          <Button
            variant='outline'
            className='w-fit'
            onClick={() => router.push(`/interview/${interview._id}/feedback`)}
          >
            Feedback
          </Button>
        )}
      </div>
    </div>
  )
}

export default InterviewCard
