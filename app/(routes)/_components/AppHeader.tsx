import { UserButton } from '@clerk/nextjs'
import React from 'react'

function AppHeader() {
  return (
    <nav className="flex w-full items-center justify-between border-t border-b border-neutral-200 px-4 py-4 dark:border-neutral-800">
                <div className="flex items-center gap-2">
                    <img src={'/logo.svg'} alt='logo' width={30} height={30}/>
                    <h1 className="text-base font-bold md:text-2xl">AI Mock Interview</h1>
                </div>
                {/* <Button size={'lg'}>Get Started</Button> */}
                
                <div className="flex items-center gap-3">
    
                </div>
                <UserButton></UserButton>
            </nav>
  )
}

export default AppHeader