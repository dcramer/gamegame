import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Navigation tabs for use with Next.js Link components.
 * Unlike the standard Tabs component (which uses Radix for state management),
 * these tabs rely on URL-based state and work with Next.js routing.
 *
 * @example
 * ```tsx
 * import Link from "next/link";
 * import { usePathname } from "next/navigation";
 *
 * const pathname = usePathname();
 * const activeTab = pathname.includes("/resources") ? "resources" : "details";
 *
 * <NavigationTabs>
 *   <NavigationTabsList>
 *     <Link href="/game/123">
 *       <NavigationTabsTrigger active={activeTab === "details"}>
 *         Details
 *       </NavigationTabsTrigger>
 *     </Link>
 *     <Link href="/game/123/resources">
 *       <NavigationTabsTrigger active={activeTab === "resources"}>
 *         Resources
 *       </NavigationTabsTrigger>
 *     </Link>
 *   </NavigationTabsList>
 *
 *   <NavigationTabsContent>{children}</NavigationTabsContent>
 * </NavigationTabs>
 * ```
 */

const NavigationTabs = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("w-full", className)} {...props} />
));
NavigationTabs.displayName = "NavigationTabs";

const NavigationTabsList = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    role="tablist"
    className={cn(
      "flex items-center gap-6 border-b border-border",
      className
    )}
    {...props}
  />
));
NavigationTabsList.displayName = "NavigationTabsList";

interface NavigationTabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Whether this tab is currently active.
   * Usually determined from the current route pathname.
   */
  active?: boolean;
}

const NavigationTabsTrigger = React.forwardRef<HTMLButtonElement, NavigationTabsTriggerProps>(
  ({ className, active, ...props }, ref) => (
    <button
      ref={ref}
      role="tab"
      aria-selected={active}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap px-1 pb-3 text-sm font-medium transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border-b-2 -mb-[1px]",
        active
          ? "text-foreground border-primary"
          : "text-muted-foreground border-transparent hover:text-foreground hover:border-border",
        className
      )}
      {...props}
    />
  )
);
NavigationTabsTrigger.displayName = "NavigationTabsTrigger";

const NavigationTabsContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    role="tabpanel"
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
));
NavigationTabsContent.displayName = "NavigationTabsContent";

export {
  NavigationTabs,
  NavigationTabsList,
  NavigationTabsTrigger,
  NavigationTabsContent,
};
