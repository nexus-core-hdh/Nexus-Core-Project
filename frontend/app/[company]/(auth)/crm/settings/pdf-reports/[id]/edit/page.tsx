"use client";

import dynamic from "next/dynamic";
import { use } from "react";

const PdfReportBuilder = dynamic(() => import("../../components/pdf-report-builder"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-64">
      <div className="text-muted-foreground">Loading builder...</div>
    </div>
  )
});

export default function EditPdfReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <PdfReportBuilder reportId={parseInt(id)} />;
}







