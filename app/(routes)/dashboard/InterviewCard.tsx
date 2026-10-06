"use client"

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useRouter } from 'next/navigation'
import { ArrowRight, Briefcase, CheckCircle2, Gauge, Hash, ListChecks, Loader2Icon, Trash2 } from 'lucide-react'
import React, { useContext, useState } from 'react'
import { Doc } from '@/convex/_generated/dataModel'
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { UserDetailContext } from '@/context/UserDetailContext'
import { INTERVIEW_MODES } from '../_components/InterviewOptions'

function getModeLabel(mode?: string) {
  return INTERVIEW_MODES.find((option) => option.value === mode)?.label;
}

function InterviewCard({ interview }: { interview: Doc<'InterviewSessionTable'> }) {
  const router = useRouter();
  const { userDetail } = useContext(UserDetailContext);
  const deleteInterview = useMutation(api.Interview.DeleteInterview);
  const [deleting, setDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const isCompleted = interview.status === 'completed';
  const modeLabel = getModeLabel(interview.mode);

  const onStartInterview = () => {
    router.push(`/interview/${interview._id}/start`);
  }

  const onDeleteInterview = async () => {
    if (!userDetail?._id) return;
    setDeleting(true);
    try {
      await deleteInterview({ interviewId: interview._id, userId: userDetail._id });
      setDeleteDialogOpen(false);
    } catch (e) {
      console.log(e);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className='flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg'>
      <div className='flex items-start justify-between gap-3'>
        <div className='flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary'>
          <Briefcase className='size-5' />
        </div>
        <div className='flex items-center gap-2'>
          <Badge variant={isCompleted ? 'success' : 'secondary'}>
            {isCompleted && <CheckCircle2 className='size-3' />}
            {isCompleted ? 'Complete' : 'Draft'}
          </Badge>
          <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <DialogTrigger render={<Button variant='ghost' size='icon-sm' className='text-muted-foreground hover:text-destructive' />}>
              <Trash2 className='size-4' />
              <span className='sr-only'>Delete interview</span>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete this interview?</DialogTitle>
                <DialogDescription>
                  This will permanently delete this interview and all its data, including questions, transcript and feedback. This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose render={<Button variant='outline' />} disabled={deleting}>
                  Cancel
                </DialogClose>
                <Button variant='destructive' onClick={onDeleteInterview} disabled={deleting}>
                  {deleting ? <Loader2Icon className='animate-spin' /> : <Trash2 />} Delete
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      <div>
        <h3 className='font-semibold text-base leading-snug'>{interview.jobTitle || 'Resume-based Interview'}</h3>
        {(modeLabel || interview.level || interview.qno) && (
          <div className='mt-2.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground'>
            {modeLabel && (
              <span className='flex items-center gap-1'>
                <ListChecks className='size-3.5 text-primary' />
                Mode: <span className='font-medium text-foreground'>{modeLabel}</span>
              </span>
            )}
            {interview.level && (
              <span className='flex items-center gap-1'>
                <Gauge className='size-3.5 text-primary' />
                Level: <span className='font-medium text-foreground capitalize'>{interview.level}</span>
              </span>
            )}
            {interview.qno && (
              <span className='flex items-center gap-1'>
                <Hash className='size-3.5 text-primary' />
                {isCompleted ? 'Questions Attempted' : 'Questions Created'}: <span className='font-medium text-foreground'>{interview.qno}</span>
              </span>
            )}
          </div>
        )}
      </div>
      <div className='mt-1 flex gap-2.5'>
        <Button onClick={onStartInterview} className='w-fit'>
          {isCompleted ? 'Retake Interview' : 'Start Interview'} <ArrowRight />
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
