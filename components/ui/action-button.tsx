import * as React from "react";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: LucideIcon;
  title: string;
  description: string;
  variant?: "default" | "danger";
}

const ActionButton = React.forwardRef<HTMLButtonElement, ActionButtonProps>(
  ({ className, icon: Icon, title, description, variant = "default", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "w-full text-left p-3 rounded-lg border transition-colors group cursor-pointer",
          variant === "danger"
            ? "border-red-500/50 bg-card hover:bg-red-500/10 hover:border-red-500"
            : "border-border bg-card hover:bg-accent hover:border-accent-foreground/20",
          className
        )}
        {...props}
      >
        <div className="flex items-start gap-3">
          {Icon && (
            <Icon
              className={cn(
                "h-4 w-4 mt-0.5",
                variant === "danger"
                  ? "text-red-500"
                  : "text-muted-foreground group-hover:text-foreground"
              )}
            />
          )}
          <div className="flex-1 min-w-0">
            <div
              className={cn(
                "font-medium text-sm mb-1",
                variant === "danger" && "text-red-500"
              )}
            >
              {title}
            </div>
            <div className="text-xs text-muted-foreground leading-relaxed">
              {description}
            </div>
          </div>
        </div>
      </button>
    );
  }
);

ActionButton.displayName = "ActionButton";

export { ActionButton };
