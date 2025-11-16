"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  NavigationTabs,
  NavigationTabsList,
  NavigationTabsTrigger,
  NavigationTabsContent,
} from "@/components/ui/navigation-tabs";
import { Badge } from "@/components/ui/badge";

interface ResourceTabsProps {
  gameId: string;
  resourceId: string;
  attachmentCount: number;
  children: React.ReactNode;
}

export default function ResourceTabs({ gameId, resourceId, attachmentCount, children }: ResourceTabsProps) {
  const pathname = usePathname();

  // Determine active tab from URL
  const isAttachmentsTab = pathname.endsWith("/attachments");
  const activeTab = isAttachmentsTab ? "attachments" : "details";

  return (
    <NavigationTabs>
      <NavigationTabsList className="mb-6 mt-4">
        <Link href={`/admin/games/${gameId}/resources/${resourceId}`}>
          <NavigationTabsTrigger active={activeTab === "details"}>
            Details
          </NavigationTabsTrigger>
        </Link>
        <Link href={`/admin/games/${gameId}/resources/${resourceId}/attachments`}>
          <NavigationTabsTrigger active={activeTab === "attachments"}>
            <span className="flex items-center gap-2">
              Attachments
              {attachmentCount > 0 && (
                <Badge variant="secondary" className="text-xs px-1.5 py-0 h-5">
                  {attachmentCount}
                </Badge>
              )}
            </span>
          </NavigationTabsTrigger>
        </Link>
      </NavigationTabsList>

      <NavigationTabsContent className="mt-0">{children}</NavigationTabsContent>
    </NavigationTabs>
  );
}
