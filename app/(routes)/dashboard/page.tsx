"use client"

import { useUser } from '@clerk/nextjs'
import React, { useContext } from 'react'
import Link from 'next/link'
import ResumeMatchHistory from './ResumeMatchHistory';
import ProfileSetupPrompt from './ProfileSetupPrompt';
import JobsForYou from './JobsForYou';
import ProgressOverview from './ProgressOverview';
import ContinueJourney from './ContinueJourney';
import CareerToolkit from './CareerToolkit';
import ActivitySections from './ActivitySections';
import RecentActivity from './RecentActivity';
import { Button } from '@/components/ui/button';
import { MessagesSquare, BriefcaseBusiness } from 'lucide-react';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { UserDetailContext } from '@/context/UserDetailContext';

function Dashboard() {
  const {user} = useUser();
  const {userDetail} = useContext(UserDetailContext);

  const resumeMatchList = useQuery(
    api.ResumeMatch.GetUserResumeMatchAnalyses,
    userDetail?._id ? { userId: userDetail._id } : "skip"
  );

  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className='mx-auto max-w-6xl px-6 py-10 md:px-10 md:py-14'>
      <div className='flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center'>
        <div>
          <p className='text-sm font-medium text-muted-foreground'>{today}</p>
          <h1 className='mt-1 text-2xl font-bold tracking-tight md:text-3xl'>
            Welcome back{user?.firstName ? `, ${user.firstName}` : ""}
          </h1>
          <p className='mt-1.5 text-[15px] text-muted-foreground'>
            Your career preparation journey, all in one place.
          </p>
        </div>
        <div className='flex w-full flex-col items-stretch gap-2.5 sm:w-auto sm:flex-row sm:items-center sm:gap-3'>
          <Button variant="outline" size="lg" nativeButton={false} render={<Link href="/jobs" />}>
            <BriefcaseBusiness />Explore Jobs
          </Button>
          <Button size="lg" nativeButton={false} render={<Link href="/create-interview" />}>
            <MessagesSquare />Start Mock Interview
          </Button>
        </div>
      </div>

      <ProgressOverview />

      <ProfileSetupPrompt />

      <ContinueJourney />

      <CareerToolkit />

      <JobsForYou />

      <ActivitySections />

      <RecentActivity />

      {resumeMatchList && <ResumeMatchHistory items={resumeMatchList} />}
    </div>
  )
}

export default Dashboard