import * as React from "react";
import { cn } from "@/lib/utils";

interface FieldProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Field wrapper component that provides consistent spacing
 * between label, input, and help text
 */
export function Field({ children, className }: FieldProps) {
  return (
    <div className={cn("space-y-2", className)}>
      {children}
    </div>
  );
}

interface FieldLabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  children: React.ReactNode;
}

export function FieldLabel({ children, className, ...props }: FieldLabelProps) {
  return (
    <label
      className={cn(
        "block text-sm font-medium leading-none",
        className
      )}
      {...props}
    >
      {children}
    </label>
  );
}

interface FieldHelpProps {
  children: React.ReactNode;
  className?: string;
}

export function FieldHelp({ children, className }: FieldHelpProps) {
  return (
    <p className={cn("text-xs text-muted-foreground", className)}>
      {children}
    </p>
  );
}

interface FieldErrorProps {
  children: React.ReactNode;
  className?: string;
}

export function FieldError({ children, className }: FieldErrorProps) {
  return (
    <p className={cn("text-xs text-destructive", className)}>
      {children}
    </p>
  );
}
