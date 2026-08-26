import { Button } from '@/components/ui/button'
import React from 'react'

import Link from "next/link";
import { LayoutDashboard } from "lucide-react";

import {
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";

export default function Header(){
    return(
        <nav className="sticky top-0 z-30 flex w-full items-center justify-between border-b border-border bg-background/90 px-6 py-4 backdrop-blur-sm md:px-10">
            <div className="flex items-center gap-2.5">
                <img src={'/logo.svg'} alt='logo' width={30} height={30} className="rounded-lg"/>
                <h1 className="text-base font-bold md:text-xl">AI Mock Interview</h1>
            </div>

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
                <Button size="lg" className="shadow-sm shadow-primary/30">
                    <LayoutDashboard className="size-4" />
                    Dashboard
                </Button>
                </Link>

                <UserButton
                appearance={{
                    elements: {
                    avatarBox: "w-9 h-9",
                    },
                }}
                />

            </Show>

            </div>
        </nav>
    )
}