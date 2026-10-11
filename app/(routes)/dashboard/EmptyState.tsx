
import React from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'

function EmptyState() {
  return (
    <div className='mt-10 flex flex-col items-center gap-5 rounded-2xl border border-dashed border-border bg-muted/40 px-10 py-16 text-center'>
        <img src={'/interview.avif'} alt='' width={120} height={120} className='opacity-90' />
        <div className='flex flex-col items-center gap-1.5'>
          <h2 className='text-lg font-semibold'>No interviews yet</h2>
          <p className='max-w-sm text-sm text-muted-foreground'>
            Create your first mock interview by uploading a resume or pasting a job description.
          </p>
        </div>
        <Button size="lg" nativeButton={false} render={<Link href="/create-interview" />}>
          <Plus />Create Interview
        </Button>
    </div>
  )
}

export default EmptyState
