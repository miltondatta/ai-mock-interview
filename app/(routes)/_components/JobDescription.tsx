import React from 'react'
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
function JobDescription({onHandleInputChange}:any) {
  return (
    <div className='border rounded-2xl p-10'>
      <div>
        <label>Job Title</label>
        <Input placeholder='Ex. Full Stack React Developer' className='mt-2' onChange={(event)=>onHandleInputChange('jobTitle',event.target.value)}/>
      </div>
      <div className='mt-6'>
        <label>Job Description</label>
        <Textarea placeholder='Enter or Paste Job Description' 
         className='h-[200px] mt-2'
         onChange={(event)=>onHandleInputChange('jobDescription', event.target.value)}
        />
      </div>
    </div>
  )
}

export default JobDescription