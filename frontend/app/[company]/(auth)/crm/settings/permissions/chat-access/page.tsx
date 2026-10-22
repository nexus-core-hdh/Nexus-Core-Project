"use client";

import * as React from "react";
import { useState, useEffect, useCallback } from "react";
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable
} from "@tanstack/react-table";
import { ArrowUpDown, Columns, Loader2, Users, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { chatAccessApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { generateAvatarFallback } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";

export type ChatAccessUser = {
  id: number;
  name: string;
  email: string;
  image?: string;
  status?: string;
  canChatWith: number[]; // Array of user IDs this user can chat with
};

export const createColumns = (
  allUsers: ChatAccessUser[],
  onToggleAccess: (userId: number, targetUserId: number) => void,
  updating: { userId: number; targetUserId: number } | null
): ColumnDef<ChatAccessUser>[] => [
  {
    accessorKey: "name",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="-ml-3">
          User
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      const user = row.original;
      return (
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarImage src={user.image} alt={user.name} />
            <AvatarFallback>{generateAvatarFallback(user.name)}</AvatarFallback>
          </Avatar>
          <div>
            <div className="font-medium">{user.name}</div>
            <div className="text-sm text-muted-foreground">{user.email}</div>
          </div>
        </div>
      );
    }
  },
  {
    accessorKey: "canChatWith",
    header: "Can Chat With",
    cell: ({ row }) => {
      const user = row.original;
      const canChatWithCount = user.canChatWith.length;
      const canChatWithUsers = allUsers.filter(u => user.canChatWith.includes(u.id));
      
      return (
        <div className="flex items-center gap-2">
          <Badge variant="outline">
            {canChatWithCount} user{canChatWithCount !== 1 ? 's' : ''}
          </Badge>
          {canChatWithUsers.length > 0 && (
            <span className="text-sm text-muted-foreground">
              {canChatWithUsers.slice(0, 3).map(u => u.name).join(', ')}
              {canChatWithUsers.length > 3 && ` +${canChatWithUsers.length - 3} more`}
            </span>
          )}
        </div>
      );
    }
  },
  {
    id: "actions",
    enableHiding: false,
    header: "Actions",
    cell: ({ row }) => {
      const user = row.original;
      return (
        <ManageAccessDialog
          user={user}
          allUsers={allUsers}
          onToggleAccess={onToggleAccess}
          updating={updating}
        />
      );
    }
  }
];

function ManageAccessDialog({
  user,
  allUsers,
  onToggleAccess,
  updating
}: {
  user: ChatAccessUser;
  allUsers: ChatAccessUser[];
  onToggleAccess: (userId: number, targetUserId: number) => void;
  updating: { userId: number; targetUserId: number } | null;
}) {
  const [open, setOpen] = useState(false);
  const otherUsers = allUsers.filter(u => u.id !== user.id);

  const handleToggle = (targetUserId: number) => {
    onToggleAccess(user.id, targetUserId);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Users className="mr-2 h-4 w-4" />
          Manage Access
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Chat Access for {user.name}</DialogTitle>
          <DialogDescription>
            Select which users {user.name} can chat with. Check the boxes to grant access.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 mt-4">
          {otherUsers.map((targetUser) => {
            const hasAccess = user.canChatWith.includes(targetUser.id);
            const isUpdating = updating?.userId === user.id && updating?.targetUserId === targetUser.id;
            
            return (
              <div
                key={targetUser.id}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50"
              >
                <div className="flex items-center gap-3 flex-1">
                  <Checkbox
                    checked={hasAccess}
                    onCheckedChange={() => handleToggle(targetUser.id)}
                    disabled={isUpdating}
                  />
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={targetUser.image} alt={targetUser.name} />
                    <AvatarFallback>{generateAvatarFallback(targetUser.name)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="font-medium">{targetUser.name}</div>
                    <div className="text-sm text-muted-foreground">{targetUser.email}</div>
                  </div>
                  {isUpdating && (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                  {!isUpdating && hasAccess && (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  )}
                  {!isUpdating && !hasAccess && (
                    <XCircle className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ChatAccessPage() {
  const [users, setUsers] = useState<ChatAccessUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<{ userId: number; targetUserId: number } | null>(null);
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      const data = await chatAccessApi.getAllUsersWithChatAccess();
      setUsers(data || []);
    } catch (error: any) {
      console.error("Failed to load users:", error);
      if (error.message?.includes('Admin access required')) {
        toast.error("Admin access required to manage chat access");
      } else {
        toast.error("Failed to load users");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleToggleAccess = useCallback(async (userId: number, targetUserId: number) => {
    try {
      setUpdating({ userId, targetUserId });
      
      const user = users.find(u => u.id === userId);
      const hasAccess = user?.canChatWith.includes(targetUserId) || false;
      
      if (hasAccess) {
        await chatAccessApi.adminRevokeChatAccess(userId, targetUserId);
        const targetUserName = users.find(u => u.id === targetUserId)?.name || "User";
        toast.success(`${user?.name} can no longer chat with ${targetUserName}`);
      } else {
        await chatAccessApi.adminGrantChatAccess(userId, targetUserId);
        const targetUserName = users.find(u => u.id === targetUserId)?.name || "User";
        toast.success(`${user?.name} can now chat with ${targetUserName}`);
      }
      
      loadUsers();
    } catch (error: any) {
      console.error("Failed to toggle chat access:", error);
      toast.error(error.message || "Failed to update chat access");
    } finally {
      setUpdating(null);
    }
  }, [users, loadUsers]);

  const columns = React.useMemo(
    () => createColumns(users, handleToggleAccess, updating),
    [users, updating]
  );

  const table = useReactTable({
    data: users,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    state: {
      sorting,
      columnFilters,
      columnVisibility
    }
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-muted-foreground">Loading users...</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h1 className="text-lg font-bold tracking-tight">Chat Access Management</h1>
          <p className="text-muted-foreground">
            Manage chat access between users. Configure which users can chat with each other. 
            Click "Manage Access" for any user to select which other users they can chat with.
          </p>
        </div>
      </div>

      <div className="w-full">
        <div className="flex items-center gap-4 py-4">
          <Input
            placeholder="Search users..."
            value={(table.getColumn("name")?.getFilterValue() as string) ?? ""}
            onChange={(event) => table.getColumn("name")?.setFilterValue(event.target.value)}
            className="max-w-sm"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="ml-auto">
                <Columns className="mr-2 h-4 w-4" />
                <span className="hidden md:inline">Columns</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {table
                .getAllColumns()
                .filter((column) => column.getCanHide())
                .map((column) => {
                  return (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      className="capitalize"
                      checked={column.getIsVisible()}
                      onCheckedChange={(value) => column.toggleVisibility(value)}>
                      {column.id}
                    </DropdownMenuCheckboxItem>
                  );
                })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    return (
                      <TableHead key={header.id}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <p className="text-muted-foreground">No users found.</p>
                      <p className="text-sm text-muted-foreground">Select users from your organization to manage their chat access.</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-end space-x-2 pt-4">
          <div className="space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}>
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}>
              Next
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
