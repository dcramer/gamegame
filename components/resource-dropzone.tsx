"use client";

import { UploadIcon } from "lucide-react";
import React, { useCallback } from "react";
import { useDropzone } from "react-dropzone";

export default function ResourceDropzone({
  children,
  onAddFiles,
}: {
  children: React.ReactNode;
  onAddFiles: (files: File[]) => void;
}) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      onAddFiles(acceptedFiles);
      // acceptedFiles.forEach((file) => {
      //   const reader = new FileReader();

      //   reader.onabort = () => console.log("file reading was aborted");
      //   reader.onerror = () => console.log("file reading has failed");
      //   reader.onload = () => {
      //     // Do whatever you want with the file contents
      //     const binaryStr = reader.result;
      //     console.log(binaryStr);
      //   };
      //   reader.readAsArrayBuffer(file);
      // });
    },
    [onAddFiles]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

  return (
    <div className="relative" {...getRootProps()}>
      <input {...getInputProps()} />
      {children}
      {isDragActive && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-muted text-muted-foreground text-xl font-bold border border-dashed border-border gap-2">
          <UploadIcon className="w-12 h-12" />
          <div>Drop a resource here to add it.</div>
        </div>
      )}
    </div>
  );
}
