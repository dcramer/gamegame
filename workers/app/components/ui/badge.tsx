import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        destructive: "bg-destructive text-destructive-foreground",
        outline: "border border-input bg-background",
        success: "bg-green-50 text-green-600 dark:bg-green-950 dark:text-green-400",
        warning: "bg-yellow-50 text-yellow-600 dark:bg-yellow-950 dark:text-yellow-400",
        error: "bg-red-50 text-red-500 dark:bg-red-950 dark:text-red-400",
        info: "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400",
        neutral: "bg-gray-50 text-gray-600 dark:bg-gray-950 dark:text-gray-400",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
