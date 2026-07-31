
import { Button } from '@/components/ui/button'
import Image from 'next/image'
import React from 'react'
import CreateInterviewDialog from '../_components/CreateInterviewDialog'

function EmptyState() {
  return (
    <div className='mt-14 flex flex-col items-center gap-5 border-dashed p-10 border-5 rounded-2xl bg-gray-50'>
        <img src={'/interview.avif'} alt='EmptyState' width={150} height={150} />
        <h2 className='mt-2 text-lg text-gray-500'>You haven't created any interview yet</h2>
        <CreateInterviewDialog />
    </div>
  )
}

export default EmptyState