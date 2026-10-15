"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "@/lib/app-navigation";
import Link from "@/components/app-link";
import { toast } from "sonner";
import { fileApi } from "@/lib/api";
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
  ImageIcon,
  ArrowLeft,
  Search
} from "lucide-react";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

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

const typeFilterMap: Record<string, string> = {
  Documents: "DOCUMENT",
  Images: "IMAGE",
  Videos: "VIDEO",
  Others: "OTHER",
  // Handle both "Others" and "Other" for consistency
  Other: "OTHER"
};

export default function AllFilesPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const typeParam = searchParams.get("type");
  
  const [fileList, setFileList] = useState<Array<{
    id: number;
    name: string;
    type: string;
    size: number;
    uploadDate: Date;
    url?: string;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState<string>(typeParam || "all");

  // Update selectedType when URL param changes
  useEffect(() => {
    if (typeParam) {
      setSelectedType(typeParam);
    }
  }, [typeParam]);

  useEffect(() => {
    const fetchFiles = async () => {
      try {
        setLoading(true);
        const params: any = {};
        
        // Map type filter to database type
        if (selectedType !== "all" && typeFilterMap[selectedType]) {
          params.type = typeFilterMap[selectedType];
        }
        
        if (searchQuery) {
          params.search = searchQuery;
        }

        const data = await fileApi.getFiles(params);
        setFileList((data || []).map((f: any) => ({
          id: f.id,
          name: f.name,
          type: fileTypeMap[f.type] || "document",
          size: f.size || 0,
          uploadDate: new Date(f.createdAt),
          url: f.url
        })));
      } catch (error) {
        console.error("Failed to fetch files:", error);
        toast.error("Failed to load files");
      } finally {
        setLoading(false);
      }
    };

    fetchFiles();
  }, [selectedType, searchQuery]);

  const handleTypeChange = (type: string) => {
    setSelectedType(type);
    // Update URL with type filter
    if (type === "all") {
      router.push("/file-manager/all");
    } else {
      router.push(`/file-manager/all?type=${type}`);
    }
  };

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

  const downloadFile = (file: { url?: string; name: string }) => {
    if (file.url) {
      const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';
      window.open(`${API_BASE_URL}/${file.url}`, '_blank');
    }
  };

  const filteredFiles = fileList.filter((file) =>
    file.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-bold tracking-tight">All Files</h1>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Files</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-1 items-center gap-2">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search files..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <Select value={selectedType} onValueChange={handleTypeChange}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="Documents">Documents</SelectItem>
                <SelectItem value="Images">Images</SelectItem>
                <SelectItem value="Videos">Videos</SelectItem>
                <SelectItem value="Others">Others</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-24">
              <div className="text-muted-foreground">Loading files...</div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="lg:w-[300px]">Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Upload Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredFiles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      {searchQuery ? "No files found matching your search" : "No files found"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredFiles.map((file) => (
                    <TableRow key={file.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center space-x-2">
                          {getFileIcon(file.type)}
                          <span>{file.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="capitalize">{file.type}</TableCell>
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
                            <DropdownMenuItem onClick={() => downloadFile(file)}>
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
    </div>
  );
}

