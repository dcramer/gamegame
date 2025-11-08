import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost" | "link" | "destructive" | "danger";
  size?: "default" | "sm" | "lg";
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", asChild = false, ...props }, ref) => {
    const classes = cn(
      "inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background cursor-pointer",
      {
        "bg-primary text-primary-foreground hover:bg-primary/90":
          variant === "default",
        "border border-border bg-background text-foreground hover:bg-accent":
          variant === "outline",
        "hover:bg-accent hover:text-accent-foreground":
          variant === "ghost",
        "underline-offset-4 hover:underline text-primary":
          variant === "link",
        "bg-destructive text-destructive-foreground hover:bg-destructive/90":
          variant === "destructive",
        "border border-destructive/50 bg-background text-destructive hover:bg-destructive/10 hover:border-destructive":
          variant === "danger",
      },
      {
        "h-10 py-2 px-4 rounded": size === "default",
        "h-9 px-3 rounded": size === "sm",
        "h-11 px-8 rounded": size === "lg",
      },
      className
    );

    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        className={classes}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
