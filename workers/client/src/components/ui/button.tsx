import * as React from "react";
import { cn } from "../../lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "secondary" | "outline" | "ghost" | "link";
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
      },
      {
        "h-10 py-2 px-4 rounded": size === "default",
        "h-9 px-3 rounded": size === "sm",
        "h-11 px-8 rounded": size === "lg",
      },
      className
    );

    if (asChild && children && React.isValidElement(children)) {
      return React.cloneElement(children, {
        ...children.props,
        className: cn(classes, children.props.className),
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
