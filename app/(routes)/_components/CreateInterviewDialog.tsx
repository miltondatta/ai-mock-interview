import React, { useContext, useState } from 'react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog"
import { Button } from '@/components/ui/button'

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import ResumeUpload from './ResumeUpload'
import JobDescription from './JobDescription'
import axios from 'axios'
import { ArrowRight, CheckCircle2, FileText, Loader2Icon, Plus, Sparkles, UploadCloud } from 'lucide-react'
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { useUserDetailContext } from '@/app/Provider'
import { UserDetailContext } from '@/context/UserDetailContext'
import { useRouter } from 'next/navigation'


function CreateInterviewDialog() {
  const [file, setFile] = useState<File|null>();
  const [loading,setLoading] = useState(false);
  const [formData,setFormData] = useState<any>();
  const [interviewId,setInterviewId] = useState<string|null>(null);
  const {userDetail,setUserDetail}=useContext(UserDetailContext);
  const router = useRouter();

  const saveInterviewQuestion=useMutation(api.Interview.SaveInterviewQuestions)
  const onHandleInputChange = (field:string, value:string) =>{

    setFormData((prevData:any) => ({
        ...prevData,
        [field]:value
    }))

  }

  const onSubmit = async() => {
    setLoading(true);
    const formData_ = new FormData();
    if(file) formData_.append('file',file);
    formData_.append('jobTitle',formData?.jobTitle??'');
    formData_.append('jobDescription',formData?.jobDescription??'');

    try{
        const res = await axios.post('api/generate-interview-questions',formData_);
        console.log(res.data);

        // Save to database
        const resp = await saveInterviewQuestion({
            questions: res.data?.questions,
            resumeUrl: res.data?.resumeUrl ?? undefined,
            resumeFileName: res.data?.resumeFileName ?? undefined,
            jobTitle: formData?.jobTitle || undefined,
            jobDescription: formData?.jobDescription || undefined,
            uid: userDetail?._id
        });
        console.log(resp);
        setInterviewId(resp);

    }catch(e:any){
        if(e?.response?.status==429){
            console.log(e.response.data?.result);
            alert(e.response.data?.result);
        } else {
            console.log(e);
        }
    }finally{
        setLoading(false);
    }
  }

  const canSubmit = !!file || (!!formData?.jobTitle && !!formData?.jobDescription);

  const onStartInterview = () => {
    if(!interviewId) return;
    router.push(`/interview/${interviewId}/start`);
  }

  return (
        <Dialog>
        <DialogTrigger render={<Button size="lg" />}>
            <Plus />Create Interview
        </DialogTrigger>
        <DialogContent className='w-full max-w-2xl gap-0 overflow-hidden p-0 sm:max-w-2xl'>
            <DialogHeader className='gap-0 border-b border-border bg-gradient-to-br from-primary/15 via-primary/5 to-transparent px-6 py-6 text-left'>
                <div className='flex items-center gap-3.5'>
                    <div className='flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm'>
                        <Sparkles className='size-5' />
                    </div>
                    <div>
                        <DialogTitle className='text-lg'>Create a new interview</DialogTitle>
                        <DialogDescription className='mt-0.5'>
                            Upload your resume and add the job description to generate interview questions.
                        </DialogDescription>
                    </div>
                </div>
            </DialogHeader>

            <div className='px-6 py-5'>
                <Tabs defaultValue="resume-upload" className="max-w-full">
                    <TabsList className='w-full'>
                        <TabsTrigger value="resume-upload"><UploadCloud />Resume Upload</TabsTrigger>
                        <TabsTrigger value="job-desc"><FileText />Job Description</TabsTrigger>
                    </TabsList>
                    <TabsContent value="resume-upload" className='mt-4'><ResumeUpload setFiles = {(file:File) => setFile(file)} /></TabsContent>
                    <TabsContent value="job-desc" className='mt-4'><JobDescription onHandleInputChange={onHandleInputChange}/></TabsContent>
                </Tabs>

                {interviewId && (
                    <div className='mt-4 flex items-center gap-2 rounded-lg bg-success/10 px-3.5 py-2.5 text-sm font-medium text-success'>
                        <CheckCircle2 className='size-4' />
                        Questions are ready — start the interview whenever you're set.
                    </div>
                )}
            </div>

            <DialogFooter className='mx-0 mb-0 gap-3 border-t border-border bg-muted/30 px-6 py-4'>
                <DialogClose render={<Button variant={'ghost'} />}>
                    Cancel
                </DialogClose>
                <Button onClick={onSubmit} disabled={loading || !canSubmit} variant={interviewId ? 'outline' : 'default'}>
                   { loading ? <Loader2Icon className='animate-spin'/> : <Sparkles /> }Submit</Button>
                <Button onClick={onStartInterview} disabled={!interviewId}>
                    Start Interview<ArrowRight /></Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
  )
}

export default CreateInterviewDialog