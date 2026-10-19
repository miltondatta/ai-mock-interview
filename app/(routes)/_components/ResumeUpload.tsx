"use client";
//import React from 'react'
import React, { useState } from "react";
import { FileUpload } from "@/components/ui/file-upload";

function ResumeUpload({setFiles, file, onRemove}:any) {
    //const [files, setFiles] = useState<File[]>([]);
    const handleFileUpload = (files: File[]) => {
        setFiles(files[0]);
        console.log(files[0]);
    };
    return (
        <div className="w-full max-w-4xl mx-auto">
            <FileUpload onChange={handleFileUpload} initialFiles={file ? [file] : undefined} onRemove={onRemove} />
        </div>
    )
}

export default ResumeUpload