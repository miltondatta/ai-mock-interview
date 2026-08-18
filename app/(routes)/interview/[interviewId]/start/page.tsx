"use client"

import Image from "next/image"
import { useParams, useRouter } from "next/navigation"
import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import StartInterviewImg from "@/start_interview_img.jpg"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"

function StartInterviewPage() {
    const { interviewId } = useParams<{ interviewId: string }>();
    const router = useRouter();
    const [shareEmail, setShareEmail] = useState("");

    const interview = useQuery(api.Interview.GetInterviewSession, {
        interviewId: interviewId as Id<'InterviewSessionTable'>
    });

    const onStartNow = () => {
        router.push(`/interview/${interviewId}/session`);
    }

    return (
        <div className="flex justify-center items-center py-20 px-10">
            <div data-interview-id={interviewId} className="w-full max-w-md flex flex-col items-center rounded-2xl border border-border p-8">
                <div className="relative h-48 w-full overflow-hidden rounded-xl">
                    <Image src={StartInterviewImg} alt="Start Interview" fill className="object-cover" />
                </div>

                <h2 className="mt-6 text-2xl font-bold text-center">Ready for Interview?</h2>

                <Button size="lg" variant="outline" className="mt-4" onClick={onStartNow} disabled={!interview}>
                    Start Now
                </Button>

                <hr className="my-8 w-full border-border" />

                <p className="text-sm text-muted-foreground text-center">
                    Want to sent interview link to someone?
                </p>

                <div className="mt-4 flex w-full gap-3">
                    <Input
                        placeholder="Enter Email ID"
                        value={shareEmail}
                        onChange={(e) => setShareEmail(e.target.value)}
                    />
                    <Button variant="outline" disabled={!shareEmail}>
                        Send
                    </Button>
                </div>
            </div>
        </div>
    )
}

export default StartInterviewPage
