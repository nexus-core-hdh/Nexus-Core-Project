import { generateMeta } from "@/lib/utils";

import {
  FileUploadDialog,
  TableRecentFiles,
  SummaryCards,
  ChartFileTransfer,
  FolderListCards
} from "@/app/[company]/(auth)/file-manager/components";

export async function generateMetadata() {
  return generateMeta({
    title: "File Manager Admin Dashboard",
    description:
      "An admin dashboard template for managing files, folders, and monitoring storage status. Perfect for building streamlined file management systems.",
    canonical: "/file-manager"
  });
}

export default function Page() {
  return (
    <div className="space-y-4">
      <div className="flex flex-row items-center justify-between">
        <h1 className="text-lg font-bold tracking-tight">File Manager</h1>
        <FileUploadDialog />
      </div>
      <SummaryCards />
      <div className="mb-4">
        <FolderListCards />
      </div>
      <div className="gap-4 space-y-4 lg:grid lg:grid-cols-2 lg:space-y-0">
        <ChartFileTransfer />
        <TableRecentFiles />
      </div>
    </div>
  );
}
