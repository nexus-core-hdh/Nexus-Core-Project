"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LayoutGrid, Plus, MoreVertical, Download, Trash2, Share2, Globe, Users, List, Grid3x3, Layout, Loader2 } from "lucide-react";
import { BoardTemplateDialog } from "./board-template-dialog";
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
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDistanceToNow } from "date-fns";
import { documentsApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";
import { useRouter } from "@/lib/app-navigation";

type ViewMode = "list" | "grid" | "tile";

interface Board {
  id: string;
  name: string;
  type: "BOARD";
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

export default function BoardsPage() {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);

  // Load boards on mount
  useEffect(() => {
    loadBoards();
  }, []);

  const loadBoards = async () => {
    try {
      setLoading(true);
      const user = getCurrentUser();
      const data = await documentsApi.getDocuments(
        "BOARD", // Filter by BOARD type
        user?.companyId || undefined,
        user?.branchId || undefined,
        user?.id || undefined
      );
      setBoards(data);
    } catch (error: any) {
      console.error("Failed to load boards:", error);
      toast.error("Failed to load boards");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateClick = () => {
    setTemplateDialogOpen(true);
  };

  const handleSelectTemplate = async (template: any) => {
    const user = getCurrentUser();
    if (!user) {
      toast.error("Please log in to create boards");
      return;
    }

    try {
      setCreating(true);
      const documentName = template.name || `New Board`;
      
      const result = await documentsApi.createBoardDocument({
        name: documentName,
        userId: user.id,
        companyId: user.companyId || undefined,
        branchId: user.branchId || undefined,
        initialContent: {
          columns: template.columns,
        },
      });

      toast.success(`${documentName} created successfully!`);
      
      // Reload boards
      await loadBoards();
      
      // Open board editor
      if (result.type === "BOARD") {
        router.push(`/collaboration/documents/board/${result.id}`);
      }
    } catch (error: any) {
      console.error("Failed to create board:", error);
      toast.error(error.message || "Failed to create board");
    } finally {
      setCreating(false);
    }
  };

  const toggleRowSelection = (boardId: string) => {
    setSelectedRows((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(boardId)) {
        newSet.delete(boardId);
      } else {
        newSet.add(boardId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedRows.size === boards.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(boards.map((board) => board.id)));
    }
  };

  const renderBoardsList = () => {
    return (
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={boards.length > 0 && selectedRows.size === boards.length}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Modified</TableHead>
                <TableHead>Created By</TableHead>
                <TableHead>Shared</TableHead>
                <TableHead>Publish</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {boards.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No boards yet. Create a board to get started.
                  </TableCell>
                </TableRow>
              ) : (
                boards.map((board) => (
                  <TableRow
                    key={board.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => {
                      router.push(`/collaboration/documents/board/${board.id}`);
                    }}
                  >
                    <TableCell>
                      <Checkbox
                        checked={selectedRows.has(board.id)}
                        onCheckedChange={() => toggleRowSelection(board.id)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Select row"
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <LayoutGrid className="h-5 w-5 text-cyan-500" />
                        <span>{board.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {formatDistanceToNow(new Date(board.updatedAt), { addSuffix: true })}
                    </TableCell>
                    <TableCell>{board.createdBy.name}</TableCell>
                    <TableCell>
                      {board.isShared ? (
                        <Badge variant="default" className="bg-green-500">
                          <Users className="mr-1 h-3 w-3" />
                          Shared
                        </Badge>
                      ) : (
                        <Badge variant="outline">Not Shared</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {board.isPublished ? (
                        <Badge variant="default" className="bg-blue-500">
                          <Globe className="mr-1 h-3 w-3" />
                          Published
                        </Badge>
                      ) : (
                        <Badge variant="outline">Draft</Badge>
                      )}
                    </TableCell>
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
                              const downloadUrl = documentsApi.downloadDocument(board.id);
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
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (confirm("Are you sure you want to delete this board?")) {
                                try {
                                  await documentsApi.deleteDocument(board.id);
                                  toast.success("Board deleted successfully");
                                  await loadBoards();
                                } catch (error: any) {
                                  toast.error(error.message || "Failed to delete board");
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

  const renderBoardsGrid = () => (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {boards.length === 0 ? (
        <Card className="col-span-full">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <LayoutGrid className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-center text-muted-foreground">
              No boards yet. Create a board to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        boards.map((board) => (
          <Card
            key={board.id}
            className="cursor-pointer transition-shadow hover:shadow-md"
            onClick={() => {
              router.push(`/collaboration/documents/board/${board.id}`);
            }}
          >
            <CardContent className="p-4">
              <div className="mb-3 flex items-center justify-center">
                <LayoutGrid className="h-12 w-12 text-cyan-500" />
              </div>
              <h3 className="mb-1 truncate font-medium">{board.name}</h3>
              <p className="mb-2 text-xs text-muted-foreground">Board</p>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{formatDistanceToNow(new Date(board.updatedAt), { addSuffix: true })}</span>
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
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (confirm("Are you sure you want to delete this board?")) {
                          try {
                            await documentsApi.deleteDocument(board.id);
                            toast.success("Board deleted successfully");
                            await loadBoards();
                          } catch (error: any) {
                            toast.error(error.message || "Failed to delete board");
                          }
                        }
                      }}
                    >
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

  const renderBoardsTile = () => (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {boards.length === 0 ? (
        <Card className="col-span-full">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <LayoutGrid className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-center text-muted-foreground">
              No boards yet. Create a board to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        boards.map((board) => (
          <Card
            key={board.id}
            className="cursor-pointer transition-shadow hover:shadow-md"
            onClick={() => {
              router.push(`/collaboration/documents/board/${board.id}`);
            }}
          >
            <CardContent className="flex flex-col items-center justify-center p-4">
              <div className="mb-2">
                <LayoutGrid className="h-8 w-8 text-cyan-500" />
              </div>
              <p className="truncate text-center text-xs font-medium">{board.name}</p>
              <p className="mt-1 text-center text-[10px] text-muted-foreground">
                {formatDistanceToNow(new Date(board.updatedAt), { addSuffix: true })}
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
          <h1 className="text-lg font-bold tracking-tight">Boards</h1>
          <p className="text-muted-foreground text-sm">
            Create and manage your boards
          </p>
        </div>
        <Button
          onClick={handleCreateClick}
          disabled={creating}
          className="gap-2"
        >
          {creating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Creating...
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" />
              Create Board
            </>
          )}
        </Button>
      </div>

      {/* View Toggle */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {boards.length} {boards.length === 1 ? "board" : "boards"}
        </div>
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

      {/* Boards based on view mode */}
      {loading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : (
        <>
          {viewMode === "list" && renderBoardsList()}
          {viewMode === "grid" && renderBoardsGrid()}
          {viewMode === "tile" && renderBoardsTile()}
        </>
      )}

      <BoardTemplateDialog
        open={templateDialogOpen}
        onOpenChange={setTemplateDialogOpen}
        onSelectTemplate={handleSelectTemplate}
      />
    </div>
  );
}



