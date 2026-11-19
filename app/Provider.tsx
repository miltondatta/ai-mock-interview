"use client"
import { UserDetailContext } from '@/context/UserDetailContext';
import { api } from '@/convex/_generated/api';
import { useUser } from '@clerk/nextjs';
import { useMutation } from 'convex/react'
import React, { useEffect, useState } from 'react'
import { createContext } from 'vm';

export default function Provider({children}:any) {
  const {user} = useUser();
  const CreateUser = useMutation(api.users.CreateNewUser);
  const [userDetail,setUserDetail]=useState<any>();

  useEffect(() => {
    // Signed out (null, as opposed to undefined while Clerk is loading): drop
    // the previous user's Convex record. Otherwise, if someone else signs in
    // without a page reload, per-user queries could briefly run with the old id.
    if (user === null) {
      setUserDetail(undefined);
      return;
    }
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
      setUserDetail(result);
    }
 }
  return (
    <UserDetailContext.Provider value={{ userDetail, setUserDetail}}>
      <div>{children}</div>
    </UserDetailContext.Provider>
  )
}

export const useUserDetailContext = () => {
  return createContext(UserDetailContext);
}