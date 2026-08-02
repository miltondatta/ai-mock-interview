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


function CreateInterviewDialog() {
  const [file, setFile] = useState<File|null>();
  const [loading,setLoading] = useState(false);
  const [formData,setFormData] = useState<any>();
  const {userDetail,setUserDetail}=useContext(UserDetailContext);

  const saveInterviewQuestion=useMutation(api.Interview.SaveInterviewQuestions)
  const onHandleInputChange = (field:string, value:string) =>{

    setFormData((prevData:any) => ({
        ...prevData,
        [field]:value
    }))

  }

  const onSubmit = async() => {
    if(!file) return;
    setLoading(true);
    const formData = new FormData();
    formData.append('file',file);
    try{
        const res = await axios.post('api/generate-interview-questions',formData);
        console.log(res.data);
        // Save to database
        const resp = await saveInterviewQuestion({
            questions: res.data?.questions,
            resumeUrl: res?.data.resumeUrl,
            uid: userDetail?._id
        });
        console.log(resp);
        
    }catch(e){
        console.log(e);
    }finally{
        setLoading(false);
    }
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
                <Button onClick={onSubmit} disabled={loading || !file}>
                   { loading&& <Loader2Icon className='animate-spin'/> }Submit</Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
  )
}

export default CreateInterviewDialog