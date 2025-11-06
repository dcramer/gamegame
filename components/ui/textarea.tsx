import * as React from "react"

import { cn } from "@/lib/utils"

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, readOnly, disabled, ...props }, ref) => {
    return (
      <textarea
        readOnly={readOnly}
        disabled={disabled}
        className={cn(
          "flex min-h-[60px] w-full rounded-md border border-border px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:border-foreground transition-colors",
          !readOnly && !disabled && "bg-transparent",
          className,
          readOnly && "bg-accent cursor-not-allowed text-muted-foreground",
          disabled && "cursor-not-allowed opacity-50"
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
