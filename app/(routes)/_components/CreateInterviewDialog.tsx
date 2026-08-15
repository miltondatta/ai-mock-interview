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
import { Loader2Icon } from 'lucide-react'
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
        <DialogTrigger>
            <Button>+ Create Interview</Button>
        </DialogTrigger>
        <DialogContent className='min-w-3xl'>
            <DialogHeader>
            <DialogTitle>Please submit following details.</DialogTitle>
            <DialogDescription>
                Upload your resume and add the job description to generate interview questions.
            </DialogDescription>
            </DialogHeader>
            <Tabs defaultValue="resume-upload" className="max-w-full mt-5">
                <TabsList>
                    <TabsTrigger value="resume-upload">Resume Upload</TabsTrigger>
                    <TabsTrigger value="job-desc">Job Description</TabsTrigger>
                </TabsList>
                <TabsContent value="resume-upload"><ResumeUpload setFiles = {(file:File) => setFile(file)} /></TabsContent>
                <TabsContent value="job-desc"><JobDescription onHandleInputChange={onHandleInputChange}/></TabsContent>
            </Tabs>
            <DialogFooter className='flex gap-6'>
                <DialogClose>
                    <Button variant={'ghost'}>Cancel</Button>
                </DialogClose>
                <Button onClick={onSubmit} disabled={loading || !canSubmit}>
                   { loading&& <Loader2Icon className='animate-spin'/> }Submit</Button>
                <Button onClick={onStartInterview} disabled={!interviewId} variant={'outline'}>
                    Start Interview</Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
  )
}

export default CreateInterviewDialog