"use client";

import { useState, useEffect } from "react";
import { Download, Folder, MoreVertical, Share2, Star, Trash2 } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { StarFilledIcon } from "@radix-ui/react-icons";
import { folderApi } from "@/lib/api";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface Folder {
  id: number;
  name: string;
  items: number;
  starred: boolean;
  updatedAt: string;
}

export function FolderListCards() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFolders = async () => {
      try {
        setLoading(true);
        const currentUser = getCurrentUser();
        const data = await folderApi.getFolders({ 
          parentFolderId: null,
          companyId: currentUser?.companyId || undefined,
          branchId: currentUser?.branchId || undefined
        });
        // Get top-level folders only (parentFolderId is null)
        const topLevelFolders = (data || []).filter((f: any) => f.parentFolderId === null).slice(0, 3);
        setFolders(topLevelFolders.map((f: any) => ({
          id: f.id,
          name: f.name,
          items: f.items || 0,
          starred: f.starred || false,
          updatedAt: f.updatedAt
        })));
      } catch (error) {
        console.error("Failed to fetch folders:", error);
        toast.error("Failed to load folders");
      } finally {
        setLoading(false);
      }
    };

    fetchFolders();
  }, []);

  const toggleStar = async (id: number, currentStarred: boolean) => {
    try {
      await folderApi.updateFolder(id, { starred: !currentStarred });
      setFolders(folders.map(f => f.id === id ? { ...f, starred: !currentStarred } : f));
    } catch (error) {
      console.error("Failed to update folder:", error);
      toast.error("Failed to update folder");
    }
  };

  const deleteFolder = async (id: number) => {
    try {
      await folderApi.deleteFolder(id);
      setFolders(folders.filter(f => f.id !== id));
      toast.success("Folder deleted successfully");
    } catch (error) {
      console.error("Failed to delete folder:", error);
      toast.error("Failed to delete folder");
    }
  };
  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="hover:bg-muted transition-colors">
            <CardContent className="p-6">
              <div className="text-muted-foreground">Loading...</div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {folders.map((folder) => (
        <Card key={folder.id} className="hover:bg-muted transition-colors">
          <CardHeader>
            <CardTitle className="flex gap-2">
              <Folder className="size-4 text-yellow-600" />
              <h3 className="leading-none font-semibold tracking-tight">{folder.name}</h3>
            </CardTitle>
            <CardAction>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreVertical className="size-4" />
                    <span className="sr-only">More options</span>
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
                  <DropdownMenuItem onClick={() => deleteFolder(folder.id)}>
                    <Trash2 />
                    <span>Delete</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </CardAction>
          </CardHeader>
          <CardContent className="spcae-y-4">
            <div className="bg-muted rounded-md border px-4 py-2 text-sm">{folder.items} items</div>
            <div className="flex items-center justify-between">
              <div className="text-muted-foreground text-xs">
                Last update: {formatDistanceToNow(new Date(folder.updatedAt), { addSuffix: true })}
              </div>
              <Button variant="ghost" size="icon" onClick={() => toggleStar(folder.id, folder.starred)}>
                {folder.starred ? (
                  <StarFilledIcon className="size-4 text-orange-400" />
                ) : (
                  <Star className="text-muted-foreground size-4" />
                )}
                <span className="sr-only">{folder.starred ? "Unstar" : "Star"} folder</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
