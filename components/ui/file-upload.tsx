"use client";
import { cn } from "@/lib/utils";
import React, { useRef, useState } from "react";
import { motion } from "motion/react";
import { UploadCloud, FileText, X } from "lucide-react";
import { useDropzone } from "react-dropzone";

export const FileUpload = ({
  onChange,
  initialFiles,
  onRemove,
}: {
  onChange?: (files: File[]) => void;
  initialFiles?: File[];
  // When provided, each uploaded file gets a remove button.
  onRemove?: (file: File) => void;
}) => {
  const [files, setFiles] = useState<File[]>(initialFiles ?? []);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (newFiles: File[]) => {
    setFiles((prevFiles) => [...prevFiles, ...newFiles]);
    onChange && onChange(newFiles);
  };

  const handleRemove = (index: number) => {
    const removed = files[index];
    setFiles((prevFiles) => prevFiles.filter((_, i) => i !== index));
    // Clear the input so picking the same file again still fires onChange.
    if (fileInputRef.current) fileInputRef.current.value = "";
    onRemove && removed && onRemove(removed);
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const { getRootProps, isDragActive } = useDropzone({
    multiple: false,
    noClick: true,
    onDrop: handleFileChange,
    onDropRejected: (error) => {
      console.log(error);
    },
  });

  return (
    <div className="w-full" {...getRootProps()}>
      <div
        onClick={handleClick}
        className={cn(
          "group relative flex min-h-[220px] w-full cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border bg-muted/30 px-6 py-10 text-center transition-colors",
          isDragActive ? "border-primary bg-primary/5" : "hover:border-foreground/25 hover:bg-muted/50"
        )}
      >
        <input
          ref={fileInputRef}
          id="file-upload-handle"
          type="file"
          accept="application/pdf"
          onChange={(e) => handleFileChange(Array.from(e.target.files || []))}
          className="hidden"
        />

        <div
          className={cn(
            "flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary transition-transform",
            "group-hover:scale-105"
          )}
        >
          <UploadCloud className="size-5" />
        </div>

        <div>
          <p className="text-sm font-semibold text-foreground">
            {isDragActive ? "Drop your file here" : "Upload file"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Drag or drop your resume here, or click to upload
          </p>
        </div>

        {files.length > 0 && (
          <div className="mt-2 flex w-full max-w-md flex-col gap-2">
            {files.map((file, idx) => (
              <motion.div
                key={"file" + idx}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex w-full items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-left"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <FileText className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                </div>
                {onRemove && (
                  <button
                    type="button"
                    onClick={() => handleRemove(idx)}
                    aria-label={`Remove ${file.name}`}
                    title="Remove"
                    className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
