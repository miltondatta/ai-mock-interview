"use client"

import React, { useContext, useState } from 'react'
import Link from 'next/link'
import { useMutation } from 'convex/react'
import { ArrowRight, CalendarClock, FileSearch, FileText, Link2, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { UserDetailContext } from '@/context/UserDetailContext'
import { matchTone, TONE_TEXT, type MatchTone } from '../resume-match-analyzer/shared'
import DeleteAnalysisDialog, { type AnalysisToDelete } from './DeleteAnalysisDialog'

export interface ResumeMatchHistoryItem {
  _id: string
  jobTitle: string
  resumeFileName?: string
  jobDescriptionSource: 'text' | 'url'
  overallScore: number | null
  matchLevel: string | null
  createdAt: number
}

const BADGE_VARIANT: Record<MatchTone, 'success' | 'warning' | 'destructive' | 'secondary'> = {
  success: 'success',
  warning: 'warning',
  destructive: 'destructive',
  muted: 'secondary',
}

const RING_COLOR: Record<MatchTone, string> = {
  success: 'border-success/40 bg-success/10',
  warning: 'border-warning/50 bg-warning/15',
  destructive: 'border-destructive/30 bg-destructive/10',
  muted: 'border-border bg-muted',
}

function formatCreatedAt(timestamp: number) {
  return new Date(timestamp).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

// Column layout shared by the list header and each row (md and up). Every
// column has a fixed width so the header lines up with the row values.
const HISTORY_ROW_GRID = 'md:grid md:grid-cols-[3.5rem_minmax(0,1fr)_10rem_11rem_8rem_7.5rem] md:items-center md:gap-5';

// One full-width row in the history list. The row's details open the
// analysis; the actions cell holds View and Delete.
function ResumeMatchHistoryCard({ item, onDelete }: { item: ResumeMatchHistoryItem; onDelete: (item: ResumeMatchHistoryItem) => void }) {
  const tone = matchTone(item.matchLevel);
  const href = `/resume-match-analyzer?analysisId=${item._id}`;
  return (
    <div className={cn('group flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-muted/50', HISTORY_ROW_GRID)}>
      <Link href={href} className='flex flex-col gap-3 focus-visible:outline-none md:contents'>
        <div className='flex items-center gap-3 md:contents'>
          <div className={cn('flex size-11 shrink-0 items-center justify-center rounded-full border-2', RING_COLOR[tone])}>
            <span className={cn('text-xs font-bold leading-none', TONE_TEXT[tone])}>
              {item.overallScore !== null ? `${Math.round(item.overallScore)}%` : '—'}
            </span>
          </div>
          <div className='min-w-0'>
            <p className='truncate text-sm font-semibold group-hover:text-primary' title={item.jobTitle}>{item.jobTitle}</p>
            <p className='mt-0.5 flex min-w-0 items-center gap-1 text-xs text-muted-foreground'>
              <FileText className='size-3.5 shrink-0 text-primary' />
              <span className='truncate'>{item.resumeFileName || 'Resume'}</span>
            </p>
          </div>
        </div>

        <p className='flex items-center gap-1.5 text-xs text-muted-foreground md:text-sm md:text-foreground'>
          {item.jobDescriptionSource === 'url' ? <Link2 className='size-3.5 shrink-0 text-primary' /> : <FileSearch className='size-3.5 shrink-0 text-primary' />}
          {item.jobDescriptionSource === 'url' ? 'Job posting URL' : 'Pasted description'}
        </p>

        <p className='flex items-center gap-1.5 text-xs text-muted-foreground md:text-sm md:text-foreground'>
          <CalendarClock className='size-3.5 shrink-0 text-primary md:hidden' />
          {formatCreatedAt(item.createdAt)}
        </p>

        <div>
          {item.matchLevel ? <Badge variant={BADGE_VARIANT[tone]}>{item.matchLevel}</Badge> : <span className='text-xs text-muted-foreground'>—</span>}
        </div>
      </Link>

      <div className='flex items-center gap-2 md:justify-end'>
        <Button size='sm' nativeButton={false} render={<Link href={href} />}>
          View <ArrowRight />
        </Button>
        <Button
          variant='ghost'
          size='icon-sm'
          className='text-muted-foreground hover:bg-primary/10 hover:text-primary'
          aria-label={`Delete analysis for ${item.jobTitle}`}
          onClick={() => onDelete(item)}
        >
          <Trash2 className='size-4' />
        </Button>
      </div>
    </div>
  )
}

function ResumeMatchHistory({ items }: { items: ResumeMatchHistoryItem[] }) {
  const { userDetail } = useContext(UserDetailContext);
  const deleteAnalysis = useMutation(api.ResumeMatch.DeleteResumeMatchAnalysis);
  const [pendingDelete, setPendingDelete] = useState<AnalysisToDelete | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const onConfirmDelete = async () => {
    if (!pendingDelete || !userDetail?._id || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAnalysis({ userId: userDetail._id, analysisId: pendingDelete._id as Id<'ResumeMatchAnalysisTable'> });
      setPendingDelete(null);
    } catch (e) {
      console.log(e);
      setDeleteError('Unable to delete this analysis. Please try again.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section id='resume-match-history' className='mt-14 scroll-mt-6'>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between'>
        <div>
          <h2 className='text-xl font-bold tracking-tight'>Resume Match History</h2>
          <p className='mt-1 text-sm text-muted-foreground'>Saved resume match analyses. Open one to see its full results.</p>
        </div>
        <Button size='lg' nativeButton={false} render={<Link href='/resume-match-analyzer' />}>
          <FileSearch />New Analysis
        </Button>
      </div>

      {items.length > 0 ? (
        <div className='mt-6 overflow-hidden rounded-2xl border border-border bg-card shadow-sm'>
          <div className={cn('hidden border-b border-border bg-muted/50 px-5 py-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase', HISTORY_ROW_GRID)}>
            <span>Score</span>
            <span>Job Title / Resume</span>
            <span>Job Source</span>
            <span>Analyzed</span>
            <span>Match Level</span>
            <span className='text-right'>Actions</span>
          </div>
          <div className='divide-y divide-border'>
            {items.map((item) => (
              <ResumeMatchHistoryCard
                key={item._id}
                item={item}
                onDelete={(target) => { setDeleteError(null); setPendingDelete(target); }}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className='mt-6 flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-muted/40 px-10 py-12 text-center'>
          <FileSearch className='size-8 text-muted-foreground' />
          <h3 className='text-base font-semibold'>No saved analyses yet</h3>
          <p className='max-w-sm text-sm text-muted-foreground'>
            Run a resume match analysis and click Save Analysis to keep it here.
          </p>
        </div>
      )}

      <DeleteAnalysisDialog
        analysis={pendingDelete}
        deleting={deleting}
        error={deleteError}
        onOpenChange={(open) => { if (!open) setPendingDelete(null) }}
        onConfirm={onConfirmDelete}
      />
    </section>
  )
}

export default ResumeMatchHistory
