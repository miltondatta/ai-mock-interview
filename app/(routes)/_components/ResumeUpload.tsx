"use client";
//import React from 'react'
import React, { useState } from "react";
import { FileUpload } from "@/components/ui/file-upload";

function ResumeUpload() {
    const [files, setFiles] = useState<File[]>([]);
    const handleFileUpload = (files: File[]) => {
        setFiles(files);
        console.log(files);
    };
    return (
        <div className="w-full max-w-4xl mx-auto min-h-96 border border-dashed bg-white dark:bg-black border-neutral-200 dark:border-neutral-800 rounded-2xl">
            <FileUpload onChange={handleFileUpload} />
        </div>
    )
}

export default ResumeUpload