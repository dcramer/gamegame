"use client";

import { useState, useCallback } from "react";
import { useFileInputWithDragDrop } from "@/lib/hooks/useFileInput";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FileUploadProps {
  /** Accepted file types (e.g., ".pdf,.png,.jpg" or "image/*") */
  accept?: string;
  /** Allow multiple file selection */
  multiple?: boolean;
  /** Maximum file size in bytes */
  maxSize?: number;
  /** Maximum number of files */
  maxFiles?: number;
  /** Callback when files are selected */
  onFilesSelected: (files: File[]) => void;
  /** Custom validation function - return error message or null */
  validate?: (file: File) => string | null;
  /** Button text */
  buttonText?: string;
  /** Dropzone text */
  dropzoneText?: string;
  /** Additional className for container */
  className?: string;
  /** Show as dropzone area (larger, dashed border) or just button */
  variant?: "dropzone" | "button";
}

/**
 * Unified file upload component supporting both click-to-upload and drag-and-drop.
 *
 * @example
 * <FileUpload
 *   accept=".pdf"
 *   multiple
 *   maxSize={100 * 1024 * 1024}
 *   onFilesSelected={(files) => handleUpload(files)}
 *   variant="dropzone"
 * />
 */
export function FileUpload({
  accept = "*",
  multiple = false,
  maxSize,
  maxFiles,
  onFilesSelected,
  validate,
  buttonText = "Upload Files",
  dropzoneText = "Drop files here or click to browse",
  className,
  variant = "dropzone",
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = useCallback(
    (files: File[]) => {
      setError(null);

      // Validate max files
      if (maxFiles && files.length > maxFiles) {
        setError(`Maximum ${maxFiles} file${maxFiles === 1 ? "" : "s"} allowed`);
        return;
      }

      // Validate each file
      const validFiles: File[] = [];
      for (const file of files) {
        // Size validation
        if (maxSize && file.size > maxSize) {
          setError(
            `File "${file.name}" exceeds maximum size of ${formatBytes(maxSize)}`
          );
          return;
        }

        // Custom validation
        if (validate) {
          const validationError = validate(file);
          if (validationError) {
            setError(validationError);
            return;
          }
        }

        validFiles.push(file);
      }

      if (validFiles.length > 0) {
        onFilesSelected(validFiles);
      }
    },
    [maxSize, maxFiles, validate, onFilesSelected]
  );

  const { triggerFileInput, dragHandlers } = useFileInputWithDragDrop({
    accept,
    multiple,
    onSelect: handleFiles,
  });

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      dragHandlers.onDragOver(e);
      setIsDragging(true);
    },
    [dragHandlers]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      dragHandlers.onDrop(e);
      setIsDragging(false);
    },
    [dragHandlers]
  );

  if (variant === "button") {
    return (
      <div className={className}>
        <Button variant="secondary" onClick={triggerFileInput}>
          <Upload className="mr-2 h-4 w-4" />
          {buttonText}
        </Button>
        {error && (
          <p className="mt-2 text-sm text-destructive">{error}</p>
        )}
      </div>
    );
  }

  // Dropzone variant
  return (
    <div className={cn("space-y-2", className)}>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={triggerFileInput}
        className={cn(
          "relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-background min-h-64 text-center transition-all cursor-pointer group",
          "hover:border-primary",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          isDragging && "border-primary bg-primary/10 scale-[1.02]"
        )}
        role="button"
        tabIndex={0}
        aria-label="Upload files"
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            triggerFileInput();
          }
        }}
      >
        <Upload
          className={cn(
            "h-12 w-12 mb-4 text-muted-foreground transition-colors",
            isDragging && "text-primary"
          )}
        />
        <p className="text-lg font-medium text-foreground mb-1">
          {dropzoneText}
        </p>
        {accept && accept !== "*" && (
          <p className="text-sm text-muted-foreground">
            Accepted types: {accept}
          </p>
        )}
        {maxSize && (
          <p className="text-sm text-muted-foreground">
            Max size: {formatBytes(maxSize)}
          </p>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-primary/90 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
          <div className="text-primary-foreground text-center">
            <div className="text-lg font-semibold">Click to upload</div>
          </div>
        </div>
      </div>
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i)) + " " + sizes[i];
}
