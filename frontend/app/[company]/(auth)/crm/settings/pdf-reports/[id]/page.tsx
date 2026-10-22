"use client";

import * as React from "react";
import { useWorkspaceRecordLabel } from "@/hooks/use-workspace-tab-title";
import { use } from "react";
import { useRouter } from "@/lib/app-navigation";
import { pdfReportApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Eye, Pencil } from "lucide-react";
import { toast } from "sonner";
import ReportPreview from "../components/report-preview";

export default function PdfReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [report, setReport] = React.useState<any>(null);
  useWorkspaceRecordLabel(report?.name || undefined);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    loadReport();
  }, [id]);

  const loadReport = async () => {
    try {
      setLoading(true);
      const data = await pdfReportApi.getPdfReportById(parseInt(id));
      setReport(data);
    } catch (error: any) {
      console.error("Error loading report:", error);
      toast.error("Failed to load report");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading report...</div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Report not found</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-lg font-bold tracking-tight">{report.name}</h1>
            {report.description && (
              <p className="text-muted-foreground text-sm mt-1">{report.description}</p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push(`/crm/settings/pdf-reports/${id}/edit`)}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Eye className="mr-2 h-4 w-4" />
            Print
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Report Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-sm font-medium text-muted-foreground">Status</div>
              <Badge variant={report.isActive ? "default" : "outline"} className="mt-1">
                {report.isActive ? "Active" : "Inactive"}
              </Badge>
            </div>
            {report.entityType && (
              <div>
                <div className="text-sm font-medium text-muted-foreground">Entity Type</div>
                <Badge variant="outline" className="mt-1 capitalize">
                  {report.entityType.replace("_", " ")}
                </Badge>
              </div>
            )}
            <div>
              <div className="text-sm font-medium text-muted-foreground">Created</div>
              <div className="text-sm mt-1">
                {new Date(report.createdAt).toLocaleDateString()}
              </div>
            </div>
            {report.createdBy && (
              <div>
                <div className="text-sm font-medium text-muted-foreground">Created By</div>
                <div className="text-sm mt-1">{report.createdBy.name}</div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <ReportPreview elements={report.layout || []} pageSettings={report.pageSettings || {}} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}





