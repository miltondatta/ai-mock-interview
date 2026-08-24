"use client"

import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
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
    <div className='border rounded-2xl p-6 flex flex-col gap-4'>
      <div className='flex justify-between items-start gap-3'>
        <h3 className='font-bold text-lg'>{interview.jobTitle || 'Resume-based Interview'}</h3>
        <span className='shrink-0 rounded-full bg-primary text-primary-foreground text-xs px-3 py-1 capitalize'>
          {isCompleted ? 'Complete' : 'Draft'}
        </span>
      </div>
      <p className='text-sm text-gray-500'>
        {isJobDescriptionType
          ? summarize(interview.jobDescription as string)
          : interview.resumeFileName || 'Resume'}
      </p>
      <div className='flex gap-3'>
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
