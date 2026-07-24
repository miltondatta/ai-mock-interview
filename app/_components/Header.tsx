import { Button } from '@/components/ui/button'
import { small } from 'motion/react-client'
import React from 'react'

import Link from "next/link";

import {
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";

export default function Header(){
    return(
        <nav className="flex w-full items-center justify-between border-t border-b border-neutral-200 px-4 py-4 dark:border-neutral-800">
            <div className="flex items-center gap-2">
                <img src={'/logo.svg'} alt='logo' width={30} height={30}/>
                <h1 className="text-base font-bold md:text-2xl">AI Mock Interview</h1>
            </div>
            {/* <Button className="w-24 transform rounded-lg bg-black px-6 py-2 font-medium text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-gray-800 md:w-32 dark:bg-white dark:text-black dark:hover:bg-gray-200">
                Login
            </Button> */}
            {/* <Button size={'lg'}>Get Started</Button> */}
            
            <div className="flex items-center gap-3">

            <Show when="signed-out">

                <SignInButton mode="modal">
                <Button variant="outline" size="lg">
                    Sign In
                </Button>
                </SignInButton>

                <SignUpButton mode="modal">
                <Button size="lg">
                    Get Started
                </Button>
                </SignUpButton>

            </Show>

            <Show when="signed-in">

                <Link href="/dashboard">
                <Button variant="outline" size="lg">
                    Dashboard
                </Button>
                </Link>

                <UserButton
                appearance={{
                    elements: {
                    avatarBox: "w-10 h-10",
                    },
                }}
                />

            </Show>

            </div>
        </nav>
    )
}