"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

interface GameTabsProps {
  gameId: string;
  resourceCount: number;
  attachmentCount: number;
  children: React.ReactNode;
}

export default function GameTabs({ gameId, resourceCount, attachmentCount, children }: GameTabsProps) {
  const pathname = usePathname();

  // Determine active tab from URL
  // Check for attachments at game level (not resource level)
  const isAttachmentsTab = pathname.endsWith("/attachments") && !pathname.includes("/resources/");
  // Check if we're on any resources route (including resource detail pages)
  const isResourcesTab = pathname.includes("/resources");
  const activeTab = isAttachmentsTab
    ? "attachments"
    : isResourcesTab
      ? "resources"
      : "details";

  return (
    <Tabs>
      <TabsList className="mb-6 mt-4">
        <Link href={`/admin/games/${gameId}`}>
          <TabsTrigger active={activeTab === "details"}>Details</TabsTrigger>
        </Link>
        <Link href={`/admin/games/${gameId}/resources`}>
          <TabsTrigger active={activeTab === "resources"}>
            <span className="flex items-center gap-2">
              Resources
              {resourceCount > 0 && (
                <Badge variant="secondary" className="text-xs px-1.5 py-0 h-5">
                  {resourceCount}
                </Badge>
              )}
            </span>
          </TabsTrigger>
        </Link>
        <Link href={`/admin/games/${gameId}/attachments`}>
          <TabsTrigger active={activeTab === "attachments"}>
            <span className="flex items-center gap-2">
              Attachments
              {attachmentCount > 0 && (
                <Badge variant="secondary" className="text-xs px-1.5 py-0 h-5">
                  {attachmentCount}
                </Badge>
              )}
            </span>
          </TabsTrigger>
        </Link>
      </TabsList>

      <TabsContent className="mt-0">{children}</TabsContent>
    </Tabs>
  );
}
