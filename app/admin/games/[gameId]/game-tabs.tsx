"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface GameTabsProps {
  gameId: string;
  children: React.ReactNode;
}

export default function GameTabs({ gameId, children }: GameTabsProps) {
  const pathname = usePathname();

  // Determine active tab from URL
  const isAttachmentsTab = pathname.endsWith("/attachments");
  const isResourcesTab = pathname.endsWith("/resources");
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
            Resources
          </TabsTrigger>
        </Link>
        <Link href={`/admin/games/${gameId}/attachments`}>
          <TabsTrigger active={activeTab === "attachments"}>
            Attachments
          </TabsTrigger>
        </Link>
      </TabsList>

      <TabsContent className="mt-0">{children}</TabsContent>
    </Tabs>
  );
}
