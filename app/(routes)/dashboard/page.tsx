"use client"

import { useUser } from '@clerk/nextjs'
import React, { useContext } from 'react'
import Link from 'next/link'
import EmptyState from './EmptyState';
import InterviewCard from './InterviewCard';
import ResumeMatchHistory from './ResumeMatchHistory';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { UserDetailContext } from '@/context/UserDetailContext';

function Dashboard() {
  const {user} = useUser();
  const {userDetail} = useContext(UserDetailContext);

  const interviewList = useQuery(
    api.Interview.GetUserInterviews,
    userDetail?._id ? { userId: userDetail._id } : "skip"
  );
  const resumeMatchList = useQuery(
    api.ResumeMatch.GetUserResumeMatchAnalyses,
    userDetail?._id ? { userId: userDetail._id } : "skip"
  );

  return (
    <div className='mx-auto max-w-6xl px-6 py-10 md:px-10 md:py-14'>
      <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <p className='text-sm font-medium text-muted-foreground'>My Dashboard</p>
          <h1 className='mt-1 text-2xl font-bold tracking-tight md:text-3xl'>
            Welcome back{user?.fullName ? `, ${user.fullName}` : ""}
          </h1>
        </div>
        <Button size="lg" nativeButton={false} render={<Link href="/create-interview" />}>
          <Plus />Create Interview
        </Button>
      </div>

      {interviewList && (
        <>
          {/* Both branches stay mounted and are toggled with CSS (not unmounted via a
              ternary) to avoid a remount flicker the instant this list flips
              between empty and non-empty. */}
          <div className={interviewList.length > 0 ? 'mt-10 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3' : 'hidden'}>
            {interviewList.map((interview) => (
              <InterviewCard key={interview._id} interview={interview} />
            ))}
          </div>
          <div className={interviewList.length === 0 ? '' : 'hidden'}>
            <EmptyState />
          </div>
        </>
      )}

      {resumeMatchList && <ResumeMatchHistory items={resumeMatchList} />}
    </div>
  )
}

export default Dashboard