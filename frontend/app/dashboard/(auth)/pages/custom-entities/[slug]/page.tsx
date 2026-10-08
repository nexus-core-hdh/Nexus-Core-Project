"use client";

import * as React from "react";
import { useWorkspaceRecordLabel } from "@/hooks/use-workspace-tab-title";
import { useParams } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { customEntityPageApi, formTemplatesApi, entityDataApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";
import { CustomEntityTable } from "./custom-entity-table";

export default function CustomEntityPage() {
  const params = useParams();
  const slug = params?.slug as string;
  const [pageData, setPageData] = React.useState<any>(null);
  useWorkspaceRecordLabel(pageData?.name || undefined);
  const [loading, setLoading] = React.useState(true);
  const [refreshKey, setRefreshKey] = React.useState(0);
  const createDialogTriggerRef = React.useRef<(() => void) | null>(null);

  // Load custom entity page data
  React.useEffect(() => {
    const loadPageData = async () => {
      if (!slug) return;
      
      try {
        setLoading(true);
        const user = getCurrentUser();
        const page = await customEntityPageApi.getCustomEntityPageBySlug(
          slug,
          user?.companyId ?? undefined,
          user?.branchId ?? undefined
        );
        setPageData(page);
      } catch (error: any) {
        console.error("Error loading custom entity page:", error);
        toast.error(error?.error || "Failed to load page");
      } finally {
        setLoading(false);
      }
    };

    loadPageData();
  }, [slug]);

  const handleRefresh = React.useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  const handleCreateClick = React.useCallback(() => {
    createDialogTriggerRef.current?.();
  }, []);

  if (loading) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex items-center justify-center py-8">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      </div>
    );
  }

  if (!pageData) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex items-center justify-center py-8">
          <div className="text-destructive">Page not found</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{pageData.name}</h1>
          <p className="text-muted-foreground">
            {pageData.description || `Manage your ${pageData.name.toLowerCase()}`}
          </p>
        </div>
        <Button onClick={handleCreateClick}>
          <Plus className="mr-2 h-4 w-4" />
          Add {pageData.name}
        </Button>
      </div>

      <CustomEntityTable
        key={refreshKey}
        pageData={pageData}
        onRefresh={handleRefresh}
        onCreateClickRef={createDialogTriggerRef}
      />
    </div>
  );
}

