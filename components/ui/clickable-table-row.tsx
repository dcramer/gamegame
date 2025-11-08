"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { TableRow } from "./table";

interface ClickableTableRowProps
  extends React.HTMLAttributes<HTMLTableRowElement> {
  href: string;
}

/**
 * A table row that is fully clickable and navigates to a URL when clicked.
 *
 * Features:
 * - Entire row is clickable (cursor pointer on hover)
 * - Nested interactive elements (buttons, links) with stopPropagation prevent row click
 * - Preserves all TableRow styling (hover effects, transitions)
 *
 * Usage:
 * ```tsx
 * <ClickableTableRow href="/admin/games/123">
 *   <TableCell>Game Name</TableCell>
 *   <TableCell>
 *     <Button onClick={(e) => { e.stopPropagation(); handleDelete(); }}>Delete</Button>
 *   </TableCell>
 * </ClickableTableRow>
 * ```
 */
export const ClickableTableRow = React.forwardRef<
  HTMLTableRowElement,
  ClickableTableRowProps
>(({ href, className, children, onClick, ...props }, ref) => {
  const router = useRouter();

  const handleClick = (e: React.MouseEvent<HTMLTableRowElement>) => {
    // Call custom onClick if provided
    onClick?.(e);

    // Navigate using router
    if (!e.defaultPrevented) {
      router.push(href);
    }
  };

  return (
    <TableRow
      ref={ref}
      className={cn("cursor-pointer hover:bg-secondary transition-colors", className)}
      onClick={handleClick}
      {...props}
    >
      {children}
    </TableRow>
  );
});

ClickableTableRow.displayName = "ClickableTableRow";
