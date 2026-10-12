"use client";

import { useState, useEffect } from "react";
import Link from "@/components/app-link";
import { toast } from "sonner";
import { fileApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import {
  MoreHorizontal,
  File,
  FileText,
  Film,
  Music,
  Archive,
  Trash2,
  Download,
  Share2,
  ChevronRight,
  ImageIcon
} from "lucide-react";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function getFileIcon(type: string) {
  switch (type) {
    case "image":
      return <ImageIcon className="size-4" />;
    case "video":
      return <Film className="size-4" />;
    case "audio":
      return <Music className="size-4" />;
    case "archive":
      return <Archive className="size-4" />;
    case "document":
      return <FileText className="size-4" />;
    default:
      return <File className="size-4" />;
  }
}

const fileTypeMap: Record<string, string> = {
  DOCUMENT: "document",
  IMAGE: "image",
  VIDEO: "video",
  AUDIO: "audio",
  ARCHIVE: "archive",
  OTHER: "document"
};

export function TableRecentFiles() {
  const [fileList, setFileList] = useState<Array<{
    id: number;
    name: string;
    type: string;
    size: number;
    uploadDate: Date;
  }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFiles = async () => {
      try {
        setLoading(true);
        const currentUser = getCurrentUser();
        const data = await fileApi.getRecentFiles({ 
          limit: 10,
          companyId: currentUser?.companyId || undefined,
          branchId: currentUser?.branchId || undefined
        });
        setFileList((data || []).map((f: any) => ({
          id: f.id,
          name: f.name,
          type: fileTypeMap[f.type] || "document",
          size: f.size || 0,
          uploadDate: new Date(f.createdAt)
        })));
      } catch (error) {
        console.error("Failed to fetch recent files:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchFiles();
  }, []);

  const deleteFile = async (id: number) => {
    try {
      await fileApi.deleteFile(id);
      setFileList(fileList.filter((file) => file.id !== id));
      toast.success("File deleted successfully");
    } catch (error) {
      console.error("Failed to delete file:", error);
      toast.error("Failed to delete file");
    }
  };

  return (
    <Card>
      <CardHeader className="relative">
        <CardTitle>Recently Uploaded Files</CardTitle>
        <CardAction className="relative -mt-2.5">
          <div className="absolute end-0 top-0">
            <Button variant="outline" asChild>
              <Link href="/file-manager/all">
                <span className="hidden lg:inline">View All</span>
                <ChevronRight />
              </Link>
            </Button>
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center h-24">
            <div className="text-muted-foreground">Loading files...</div>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="lg:w-[300px]">Name</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Upload Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fileList.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No recent files
                  </TableCell>
                </TableRow>
              ) : (
                fileList.map((file) => (
              <TableRow key={file.id}>
                <TableCell className="font-medium">
                  <Link
                    href="#"
                    className="text-muted-foreground hover:text-primary flex items-center space-x-2 hover:underline">
                    {getFileIcon(file.type)}
                    <span>{file.name}</span>
                  </Link>
                </TableCell>
                <TableCell>{formatFileSize(file.size)}</TableCell>
                <TableCell>{format(file.uploadDate, "MMM d, yyyy")}</TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost">
                        <span className="sr-only">Open menu</span>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>
                        <Download />
                        <span>Download</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Share2 />
                        <span>Share</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => deleteFile(file.id)}>
                        <Trash2 />
                        <span>Delete</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
