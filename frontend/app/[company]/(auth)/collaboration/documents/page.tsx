"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FileText, FileSpreadsheet, Presentation, LayoutGrid, HardDrive, Cloud, FileCode, Box, List, Grid3x3, Layout, MoreVertical, Download, Trash2, Share2, Globe, Users, Columns, Settings2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDistanceToNow } from "date-fns";
import { documentsApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";
import { useRouter } from "@/lib/app-navigation";

type ViewMode = "list" | "grid" | "tile";

interface Document {
  id: string;
  name: string;
  type: "DOCUMENT" | "SPREADSHEET" | "PRESENTATION" | "BOARD";
  filePath?: string;
  fileSize?: number;
  mimeType?: string;
  createdById: string;
  companyId?: string | null;
  branchId?: string | null;
  isShared: boolean;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: {
    id: string;
    name: string;
    email: string;
    image?: string;
  };
  downloadUrl?: string;
}

type ColumnKey = "name" | "type" | "modified" | "createdBy" | "shared" | "publish";

export default function OnlineDocumentsPage() {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState<string | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [columnVisibility, setColumnVisibility] = useState<Record<ColumnKey, boolean>>({
    name: true,
    type: true,
    modified: true,
    createdBy: true,
    shared: true,
    publish: true,
  });

  // Load documents on mount
  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = async () => {
    try {
      setLoading(true);
      const user = getCurrentUser();
      const data = await documentsApi.getDocuments(
        undefined,
        user?.companyId || undefined,
        user?.branchId || undefined,
        user?.id || undefined
      );
      setDocuments(data);
    } catch (error: any) {
      console.error("Failed to load documents:", error);
      toast.error("Failed to load documents");
    } finally {
      setLoading(false);
    }
  };

  const createOptions = [
    {
      id: "document",
      label: "Document",
      icon: FileText,
      color: "bg-blue-500",
      iconBg: "bg-blue-100 dark:bg-blue-900/20",
      text: "DOC",
    },
    {
      id: "spreadsheet",
      label: "Spreadsheet",
      icon: FileSpreadsheet,
      color: "bg-green-500",
      iconBg: "bg-green-100 dark:bg-green-900/20",
      text: "XLS",
    },
    {
      id: "presentation",
      label: "Presentation",
      icon: Presentation,
      color: "bg-orange-500",
      iconBg: "bg-orange-100 dark:bg-orange-900/20",
      text: "PPT",
    },
    {
      id: "board",
      label: "Board",
      icon: LayoutGrid,
      color: "bg-cyan-500",
      iconBg: "bg-cyan-100 dark:bg-cyan-900/20",
      text: "BOARD",
    },
  ];

  const openOptions = [
    {
      id: "computer",
      label: "Open from my computer",
      icon: HardDrive,
    },
    {
      id: "drive",
      label: "Open from Nexus Core Drive",
      icon: Cloud,
    },
    {
      id: "google",
      label: "Select from Google Docs",
      icon: FileCode,
    },
    {
      id: "dropbox",
      label: "Select from Dropbox",
      icon: Box,
    },
  ];

  const handleCreate = async (type: string) => {
    const user = getCurrentUser();
    if (!user) {
      toast.error("Please log in to create documents");
      return;
    }

    try {
      setCreating(type);
      const documentName = `New ${type.charAt(0).toUpperCase() + type.slice(1)}`;
      
      let result;
      if (type === "document") {
        result = await documentsApi.createWordDocument({
          name: documentName,
          userId: user.id,
          companyId: user.companyId || undefined,
          branchId: user.branchId || undefined,
        });
      } else if (type === "spreadsheet") {
        result = await documentsApi.createExcelDocument({
          name: documentName,
          userId: user.id,
          companyId: user.companyId || undefined,
          branchId: user.branchId || undefined,
        });
      } else if (type === "presentation") {
        result = await documentsApi.createPowerPointDocument({
          name: documentName,
          userId: user.id,
          companyId: user.companyId || undefined,
          branchId: user.branchId || undefined,
        });
      } else if (type === "board") {
        result = await documentsApi.createBoardDocument({
          name: documentName,
          userId: user.id,
          companyId: user.companyId || undefined,
          branchId: user.branchId || undefined,
        });
      } else {
        toast.error("Document type not supported yet");
        return;
      }

      toast.success(`${documentName} created successfully!`);
      
      // Reload documents
      await loadDocuments();
      
      // Open editor based on document type
      if (result.type === "DOCUMENT") {
        router.push(`/collaboration/documents/editor/${result.id}`);
      } else if (result.type === "SPREADSHEET") {
        router.push(`/collaboration/documents/spreadsheet/${result.id}`);
      } else if (result.type === "PRESENTATION") {
        router.push(`/collaboration/documents/presentation/${result.id}`);
      } else if (result.type === "BOARD") {
        router.push(`/collaboration/documents/board/${result.id}`);
      }
    } catch (error: any) {
      console.error("Failed to create document:", error);
      toast.error(error.message || "Failed to create document");
    } finally {
      setCreating(null);
    }
  };

  const handleOpen = (source: string) => {
    console.log("Open from:", source);
    // TODO: Implement document opening logic
  };

  const getFileIcon = (type: Document["type"]) => {
    switch (type) {
      case "DOCUMENT":
        return <FileText className="h-5 w-5 text-blue-500" />;
      case "SPREADSHEET":
        return <FileSpreadsheet className="h-5 w-5 text-green-500" />;
      case "PRESENTATION":
        return <Presentation className="h-5 w-5 text-orange-500" />;
      case "BOARD":
        return <LayoutGrid className="h-5 w-5 text-cyan-500" />;
    }
  };

  const getTypeLabel = (type: Document["type"]) => {
    switch (type) {
      case "DOCUMENT":
        return "document";
      case "SPREADSHEET":
        return "spreadsheet";
      case "PRESENTATION":
        return "presentation";
      case "BOARD":
        return "board";
    }
  };

  const toggleRowSelection = (docId: string) => {
    setSelectedRows((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(docId)) {
        newSet.delete(docId);
      } else {
        newSet.add(docId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedRows.size === documents.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(documents.map((doc) => doc.id)));
    }
  };

  const toggleColumnVisibility = (column: ColumnKey) => {
    setColumnVisibility((prev) => ({
      ...prev,
      [column]: !prev[column],
    }));
  };

  const renderDocumentsList = () => {
    const visibleColumnsCount = Object.values(columnVisibility).filter(Boolean).length + 2; // +2 for checkbox and actions
    
    return (
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={documents.length > 0 && selectedRows.size === documents.length}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all"
                  />
                </TableHead>
                {columnVisibility.name && <TableHead>Name</TableHead>}
                {columnVisibility.type && <TableHead>Type</TableHead>}
                {columnVisibility.modified && <TableHead>Modified</TableHead>}
                {columnVisibility.createdBy && <TableHead>Created By</TableHead>}
                {columnVisibility.shared && <TableHead>Shared</TableHead>}
                {columnVisibility.publish && <TableHead>Publish</TableHead>}
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={visibleColumnsCount} className="text-center text-muted-foreground py-8">
                    No documents yet. Create or upload a document to get started.
                  </TableCell>
                </TableRow>
              ) : (
                documents.map((doc) => (
                  <TableRow
                    key={doc.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => {
                      if (doc.type === "DOCUMENT") {
                        router.push(`/collaboration/documents/editor/${doc.id}`);
                      } else if (doc.type === "SPREADSHEET") {
                        router.push(`/collaboration/documents/spreadsheet/${doc.id}`);
                      } else if (doc.type === "PRESENTATION") {
                        router.push(`/collaboration/documents/presentation/${doc.id}`);
                      } else if (doc.type === "BOARD") {
                        router.push(`/collaboration/documents/board/${doc.id}`);
                      }
                    }}
                  >
                    <TableCell>
                      <Checkbox
                        checked={selectedRows.has(doc.id)}
                        onCheckedChange={() => toggleRowSelection(doc.id)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Select row"
                      />
                    </TableCell>
                    {columnVisibility.name && (
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {getFileIcon(doc.type)}
                          <span>{doc.name}</span>
                        </div>
                      </TableCell>
                    )}
                    {columnVisibility.type && (
                      <TableCell className="capitalize">{getTypeLabel(doc.type)}</TableCell>
                    )}
                    {columnVisibility.modified && (
                      <TableCell>{formatDistanceToNow(new Date(doc.updatedAt), { addSuffix: true })}</TableCell>
                    )}
                    {columnVisibility.createdBy && (
                      <TableCell>{doc.createdBy.name}</TableCell>
                    )}
                    {columnVisibility.shared && (
                      <TableCell>
                        {doc.isShared ? (
                          <Badge variant="default" className="bg-green-500">
                            <Users className="mr-1 h-3 w-3" />
                            Shared
                          </Badge>
                        ) : (
                          <Badge variant="outline">Not Shared</Badge>
                        )}
                      </TableCell>
                    )}
                    {columnVisibility.publish && (
                      <TableCell>
                        {doc.isPublished ? (
                          <Badge variant="default" className="bg-blue-500">
                            <Globe className="mr-1 h-3 w-3" />
                            Published
                          </Badge>
                        ) : (
                          <Badge variant="outline">Draft</Badge>
                        )}
                      </TableCell>
                    )}
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              const downloadUrl = documentsApi.downloadDocument(doc.id);
                              window.open(downloadUrl, "_blank");
                            }}
                          >
                            <Download className="mr-2 h-4 w-4" />
                            Download
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Share2 className="mr-2 h-4 w-4" />
                            Share
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={async () => {
                              if (confirm("Are you sure you want to delete this document?")) {
                                try {
                                  await documentsApi.deleteDocument(doc.id);
                                  toast.success("Document deleted successfully");
                                  await loadDocuments();
                                } catch (error: any) {
                                  toast.error(error.message || "Failed to delete document");
                                }
                              }
                            }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );
  };

  const renderDocumentsGrid = () => (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {documents.length === 0 ? (
        <Card className="col-span-full">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-center text-muted-foreground">
              No documents yet. Create or upload a document to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        documents.map((doc) => (
          <Card
            key={doc.id}
            className="cursor-pointer transition-shadow hover:shadow-md"
            onClick={() => {
              if (doc.type === "DOCUMENT") {
                router.push(`/collaboration/documents/editor/${doc.id}`);
              } else if (doc.type === "SPREADSHEET") {
                router.push(`/collaboration/documents/spreadsheet/${doc.id}`);
              } else if (doc.type === "PRESENTATION") {
                router.push(`/collaboration/documents/presentation/${doc.id}`);
              }
            }}
          >
            <CardContent className="p-4">
              <div className="mb-3 flex items-center justify-center">
                {getFileIcon(doc.type)}
              </div>
              <h3 className="mb-1 truncate font-medium">{doc.name}</h3>
              <p className="mb-2 text-xs text-muted-foreground capitalize">{getTypeLabel(doc.type)}</p>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{formatDistanceToNow(new Date(doc.updatedAt), { addSuffix: true })}</span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-6 w-6">
                      <MoreVertical className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>
                      <Download className="mr-2 h-4 w-4" />
                      Download
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Share2 className="mr-2 h-4 w-4" />
                      Share
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive">
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );

  const renderDocumentsTile = () => (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {documents.length === 0 ? (
        <Card className="col-span-full">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-center text-muted-foreground">
              No documents yet. Create or upload a document to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        documents.map((doc) => (
          <Card
            key={doc.id}
            className="cursor-pointer transition-shadow hover:shadow-md"
            onClick={() => {
              if (doc.type === "DOCUMENT") {
                router.push(`/collaboration/documents/editor/${doc.id}`);
              } else if (doc.type === "SPREADSHEET") {
                router.push(`/collaboration/documents/spreadsheet/${doc.id}`);
              } else if (doc.type === "PRESENTATION") {
                router.push(`/collaboration/documents/presentation/${doc.id}`);
              }
            }}
          >
            <CardContent className="flex flex-col items-center justify-center p-4">
              <div className="mb-2">{getFileIcon(doc.type)}</div>
              <p className="truncate text-center text-xs font-medium">{doc.name}</p>
              <p className="mt-1 text-center text-[10px] text-muted-foreground">
                {formatDistanceToNow(new Date(doc.updatedAt), { addSuffix: true })}
              </p>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between space-y-2">
        <div className="space-y-1">
          <h1 className="text-lg font-bold tracking-tight">Online Documents</h1>
          <p className="text-muted-foreground text-sm">
            Create new documents or open existing ones
          </p>
        </div>
      </div>

      {/* Create and Open Section - Fixed Tiles */}
      <div className="flex gap-4">
        {/* Create Section - Left */}
        <div className="flex flex-1 gap-4">
          {createOptions.map((option) => {
            const Icon = option.icon;
            return (
              <Card
                key={option.id}
                className={cn(
                  "group w-full cursor-pointer transition-shadow hover:shadow-md",
                  creating === option.id && "opacity-50 cursor-not-allowed"
                )}
                onClick={() => !creating && handleCreate(option.id)}
              >
                <CardContent className="flex flex-col items-center justify-center p-6">
                  {/* Document Icon */}
                  <div className="relative mb-3">
                    <div className="relative h-16 w-14">
                      {/* Document background */}
                      <div className="absolute inset-0 rounded-sm bg-muted shadow-sm" />
                      {/* Document content area */}
                      <div
                        className={cn(
                          "absolute inset-x-1.5 top-1.5 bottom-6 rounded-sm",
                          option.iconBg
                        )}
                      >
                        <div
                          className={cn(
                            "flex h-full items-center justify-center rounded-sm",
                            option.color
                          )}
                        >
                          <span className="text-[10px] font-bold text-white">{option.text}</span>
                        </div>
                        {/* Board pattern for board type */}
                        {option.id === "board" && (
                          <div className="absolute inset-0 flex flex-wrap gap-0.5 p-0.5">
                            {Array.from({ length: 8 }).map((_, i) => (
                              <div
                                key={i}
                                className="h-1 w-1 rounded-full bg-cyan-400/30"
                              />
                            ))}
                          </div>
                        )}
                      </div>
                      {/* Folded corner */}
                      <div className="absolute right-0 top-0 h-3 w-3">
                        <div className="h-full w-full rounded-br-sm bg-muted/60" />
                      </div>
                    </div>
                  </div>

                  {/* Action Button */}
                  <Button
                    size="icon"
                    disabled={creating === option.id}
                    className={cn(
                      "h-8 w-8 rounded-full transition-all group-hover:scale-105",
                      option.color
                    )}
                  >
                    {creating === option.id ? (
                      <Loader2 className="h-4 w-4 animate-spin text-white" />
                    ) : (
                      <span className="text-sm font-bold text-white">+</span>
                    )}
                  </Button>

                  {/* Label */}
                  <p className="mt-3 text-xs font-medium text-foreground">{option.label}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Vertical Divider */}
        <div className="w-px bg-border" />

        {/* Open Section - Right */}
        <div className="flex flex-1 gap-4">
          {openOptions.map((option) => {
            const Icon = option.icon;
            return (
              <Card
                key={option.id}
                className="group w-full cursor-pointer transition-shadow hover:shadow-md"
                onClick={() => handleOpen(option.id)}
              >
                <CardContent className="flex flex-col items-center justify-center p-6">
                  <div className="mb-3 rounded-lg bg-muted p-3">
                    <Icon className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-center text-xs font-medium text-muted-foreground">
                    {option.label}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Documents Section with View Toggle */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">My Documents</h2>
          <div className="flex items-center gap-2">
            {/* Column Visibility Toggle - Only show in list view */}
            {viewMode === "list" && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8">
                    <Columns className="mr-2 h-4 w-4" />
                    Columns
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[150px]">
                  <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuCheckboxItem
                    checked={columnVisibility.name}
                    onCheckedChange={() => toggleColumnVisibility("name")}
                  >
                    Name
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={columnVisibility.type}
                    onCheckedChange={() => toggleColumnVisibility("type")}
                  >
                    Type
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={columnVisibility.modified}
                    onCheckedChange={() => toggleColumnVisibility("modified")}
                  >
                    Modified
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={columnVisibility.createdBy}
                    onCheckedChange={() => toggleColumnVisibility("createdBy")}
                  >
                    Created By
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={columnVisibility.shared}
                    onCheckedChange={() => toggleColumnVisibility("shared")}
                  >
                    Shared
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={columnVisibility.publish}
                    onCheckedChange={() => toggleColumnVisibility("publish")}
                  >
                    Publish
                  </DropdownMenuCheckboxItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {/* View Toggle */}
            <div className="flex items-center gap-0 rounded-md border">
            <Button
              variant={viewMode === "list" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("list")}
              className="h-8 rounded-none border-0"
            >
              <List className="mr-2 h-4 w-4" />
              List
            </Button>
            <div className="h-6 w-px bg-border" />
            <Button
              variant={viewMode === "grid" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("grid")}
              className="h-8 rounded-none border-0"
            >
              <Grid3x3 className="mr-2 h-4 w-4" />
              Grid
            </Button>
            <div className="h-6 w-px bg-border" />
            <Button
              variant={viewMode === "tile" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("tile")}
              className="h-8 rounded-none border-0"
            >
              <Layout className="mr-2 h-4 w-4" />
              Tile
            </Button>
          </div>
          </div>
        </div>

        {/* Documents based on view mode */}
        {loading ? (
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        ) : (
          <>
            {viewMode === "list" && renderDocumentsList()}
            {viewMode === "grid" && renderDocumentsGrid()}
            {viewMode === "tile" && renderDocumentsTile()}
          </>
        )}
      </div>
    </div>
  );
}
