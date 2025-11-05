"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface ResourceTabsProps {
  gameId: string;
  resourceId: string;
  children: React.ReactNode;
}

export default function ResourceTabs({ gameId, resourceId, children }: ResourceTabsProps) {
  const pathname = usePathname();

  // Determine active tab from URL
  const isAttachmentsTab = pathname.endsWith("/attachments");
  const activeTab = isAttachmentsTab ? "attachments" : "details";

  return (
    <Tabs>
      <TabsList className="mb-8 -mx-4 px-4">
        <Link href={`/admin/games/${gameId}/resources/${resourceId}`}>
          <TabsTrigger active={activeTab === "details"}>Details</TabsTrigger>
        </Link>
        <Link href={`/admin/games/${gameId}/resources/${resourceId}/attachments`}>
          <TabsTrigger active={activeTab === "attachments"}>
            Attachments
          </TabsTrigger>
        </Link>
      </TabsList>

      <TabsContent className="mt-0">{children}</TabsContent>
    </Tabs>
  );
}
