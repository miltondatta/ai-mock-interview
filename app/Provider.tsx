"use client"
import { api } from '@/convex/_generated/api';
import { useUser } from '@clerk/nextjs';
import { useMutation } from 'convex/react'
import React, { useEffect } from 'react'

export default function Provider({children}:any) {
  const {user} = useUser();
  const CreateUser = useMutation(api.users.CreateNewUser);
  useEffect(() => {
    user&&CreateNewuser();
  },[user])
  const CreateNewuser = async () => {
    if(user) {
      const result = await CreateUser({
        email:user?.primaryEmailAddress?.emailAddress??'',
        imageUrl:user?.imageUrl,
        name:user?.fullName??''
      });
      console.log(result);
    }
 }
  return (
    <div>{children}</div>
  )
}
