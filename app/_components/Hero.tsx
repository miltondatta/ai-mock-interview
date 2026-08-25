"use client"
import React from "react";
import { motion } from "motion/react";
import Image from "next/image";
import {Button} from '@/components/ui/button'
import Link from "next/link";
export default function Hero(){
    return(
        <div className="relative mx-auto my-10 flex max-w-7xl flex-col items-center justify-center">
      <div className="absolute inset-y-0 left-0 h-full w-px bg-border">
        <div className="absolute top-0 h-40 w-px bg-gradient-to-b from-transparent via-primary to-transparent" />
      </div>
      <div className="absolute inset-y-0 right-0 h-full w-px bg-border">
        <div className="absolute h-40 w-px bg-gradient-to-b from-transparent via-primary to-transparent" />
      </div>
      <div className="absolute inset-x-0 bottom-0 h-px w-full bg-border">
        <div className="absolute mx-auto h-px w-40 bg-gradient-to-r from-transparent via-primary to-transparent" />
      </div>
      <div className="px-4 py-10 md:py-20">
        <h1 className="relative z-10 mx-auto max-w-4xl text-center text-2xl font-bold text-foreground md:text-4xl lg:text-7xl">
          {"Master Job Interview with AI-Powered Practice Session"
            .split(" ")
            .map((word, index) => (
              <motion.span
                key={index}
                initial={{ opacity: 0, filter: "blur(4px)", y: 10 }}
                animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
                transition={{
                  duration: 0.3,
                  delay: index * 0.1,
                  ease: "easeInOut",
                }}
                className="mr-2 inline-block"
              >
                {word}
              </motion.span>
            ))}
        </h1>
        <motion.p
          initial={{
            opacity: 0,
          }}
          animate={{
            opacity: 1,
          }}
          transition={{
            duration: 0.3,
            delay: 0.8,
          }}
          className="relative z-10 mx-auto max-w-xl py-4 text-center text-lg font-normal text-muted-foreground"
        >
          Prepare for your dream role with interactive AI avatars that mimic real recruiters. Get instant insights, refine your communication skills, and walk into every interview with confidence.
        </motion.p>
        <motion.div
          initial={{
            opacity: 0,
          }}
          animate={{
            opacity: 1,
          }}
          transition={{
            duration: 0.3,
            delay: 1,
          }}
          className="relative z-10 mt-8 flex flex-wrap items-center justify-center gap-4"
        >
          <Link href="/dashboard">
          <Button size={'lg'}>Explore</Button></Link>
          <Button size={'lg'} variant={'outline'}>Contact Support</Button>
        </motion.div>
        <motion.div
          initial={{
            opacity: 0,
            y: 10,
          }}
          animate={{
            opacity: 1,
            y: 0,
          }}
          transition={{
            duration: 0.3,
            delay: 1.2,
          }}
          className="relative z-10 mt-20 rounded-3xl border border-border bg-muted/40 p-4 shadow-md"
        >
          <div className="w-full overflow-hidden rounded-xl border border-border">
            <Image
              src="/interview_image.png"
              alt="AI Mock Interview platform preview"
              className="h-auto w-full object-cover"
              height={1024}
              width={1536}
              priority
            />
          </div>
        </motion.div>
      </div>
    </div>
    );
}