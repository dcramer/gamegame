import * as React from "react";
import { cn } from "../../lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "secondary" | "outline" | "ghost" | "link" | "destructive" | "destructive-outline";
  size?: "default" | "sm" | "lg";
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", asChild = false, children, ...props }, ref) => {
    const classes = cn(
      "inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background",
      {
        "bg-primary text-primary-foreground hover:bg-primary/90":
          variant === "default",
        "bg-secondary text-secondary-foreground hover:bg-secondary/80":
          variant === "secondary",
        "border border-input hover:bg-accent hover:text-accent-foreground":
          variant === "outline",
        "hover:bg-accent hover:text-accent-foreground":
          variant === "ghost",
        "underline-offset-4 hover:underline text-primary":
          variant === "link",
        "bg-destructive text-destructive-foreground hover:bg-destructive/90":
          variant === "destructive",
        "border border-destructive/50 bg-background text-destructive hover:bg-destructive/10 hover:border-destructive":
          variant === "destructive-outline",
      },
      {
        "h-10 py-2 px-4 rounded": size === "default",
        "h-9 px-3 rounded": size === "sm",
        "h-11 px-8 rounded": size === "lg",
      },
      className
    );

    if (asChild && children && React.isValidElement(children)) {
      const childProps = children.props as Record<string, unknown>;
      return React.cloneElement(children, {
        ...childProps,
        className: cn(classes, childProps.className as string | undefined),
      } as any);
    }

    return (
      <button
        className={classes}
        ref={ref}
        {...props}
      >
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";

export { Button };
