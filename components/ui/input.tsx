import * as React from "react";

import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, readOnly, disabled, ...props }, ref) => {
    return (
      <input
        type={type}
        readOnly={readOnly}
        disabled={disabled}
        className={cn(
          "flex h-10 w-full rounded border border-border px-3 py-2 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus:outline-none focus:border-foreground transition-colors",
          !readOnly && !disabled && "bg-background",
          className,
          readOnly && "bg-accent cursor-not-allowed text-muted-foreground",
          disabled && "cursor-not-allowed opacity-50"
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
