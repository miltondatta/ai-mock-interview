"use client"

import { useUser } from '@clerk/nextjs'
import React, { useContext } from 'react'
import EmptyState from './EmptyState';
import CreateInterviewDialog from '../_components/CreateInterviewDialog';
import InterviewCard from './InterviewCard';
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

  return (
    <div className='mx-auto max-w-6xl px-6 py-10 md:px-10 md:py-14'>
      <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <p className='text-sm font-medium text-muted-foreground'>My Dashboard</p>
          <h1 className='mt-1 text-2xl font-bold tracking-tight md:text-3xl'>
            Welcome back{user?.fullName ? `, ${user.fullName}` : ""}
          </h1>
        </div>
        <CreateInterviewDialog />
      </div>

      {interviewList && interviewList.length > 0 ? (
        <div className='mt-10 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3'>
          {interviewList.map((interview) => (
            <InterviewCard key={interview._id} interview={interview} />
          ))}
        </div>
      ) : (
        interviewList && interviewList.length == 0 && <EmptyState />
      )}
    </div>
  )
}

export default Dashboard