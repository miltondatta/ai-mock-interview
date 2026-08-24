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
    <div className='py-20 px-10 md:px-28 lg:px-44 xl:px-56'>
      <div className='flex justify-between items-center'>
        <div>
          <h2 className='text-lg text-gray-500'>My Dashboard</h2>
          <h2 className='text-3xl font-bold'>Welcome, {user?.fullName}</h2>
        </div>
        <CreateInterviewDialog />
      </div>
      {interviewList && interviewList.length > 0 ? (
        <div className='mt-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
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