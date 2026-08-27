"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search, MousePointerClick } from "lucide-react";

export interface Column<T> { key: keyof T | string; label: string; render?: (row: T) => React.ReactNode; }

interface Props<T extends { id: string }> {
  title: string;
  data: T[];
  loading: boolean;
  columns: Column<T>[];
  onAdd?: () => void;
  onEdit?: (row: T) => void;
  onDelete?: (row: T) => Promise<void>;
  searchPlaceholder?: string;
  searchKey?: string;
  emptyMessage?: string;
  addLabel?: string;
  /** When set alongside `onSelectRow`, renders an extra "Select" action per row (and makes a
   *  row double-click select it too) — used when this table is opened as an F2 lookup target
   *  (see hooks/use-plm-lookup-return.ts). Full CRUD stays available at the same time; this is
   *  purely additive and every existing caller that omits it sees no behavior change. */
  lookupMode?: boolean;
  onSelectRow?: (row: T) => void;
}

export function PlmCrudTable<T extends { id: string }>({
  title, data, loading, columns, onAdd, onEdit, onDelete,
  searchPlaceholder = "Search...", searchKey, emptyMessage = "No records found", addLabel = "Add",
  lookupMode, onSelectRow,
}: Props<T>) {
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<T | null>(null);

  const filtered = searchKey
    ? data.filter((r) => String((r as any)[searchKey] || "").toLowerCase().includes(search.toLowerCase()))
    : data;

  const handleDelete = async () => {
    if (!confirmDelete || !onDelete) return;
    setDeleting(confirmDelete.id);
    try {
      await onDelete(confirmDelete);
      toast.success("Deleted successfully");
    } catch (e: any) {
      toast.error(e.message || "Delete failed");
    } finally {
      setDeleting(null);
      setConfirmDelete(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="flex items-center gap-2">
          {searchKey && (
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder={searchPlaceholder} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 w-48 h-9" />
            </div>
          )}
          {onAdd && <Button size="sm" onClick={onAdd}><Plus className="h-4 w-4 mr-1" />{addLabel}</Button>}
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c) => <TableHead key={String(c.key)}>{c.label}</TableHead>)}
              {(onEdit || onDelete || (lookupMode && onSelectRow)) && <TableHead className="w-24">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                {columns.map((c) => <TableCell key={String(c.key)}><Skeleton className="h-4 w-full" /></TableCell>)}
                {(onEdit || onDelete || (lookupMode && onSelectRow)) && <TableCell><Skeleton className="h-4 w-16" /></TableCell>}
              </TableRow>
            )) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={columns.length + 1} className="text-center py-8 text-muted-foreground">{emptyMessage}</TableCell></TableRow>
            ) : filtered.map((row) => (
              <TableRow key={row.id} onDoubleClick={lookupMode && onSelectRow ? () => onSelectRow(row) : undefined} className={lookupMode && onSelectRow ? "cursor-pointer" : undefined}>
                {columns.map((c) => (
                  <TableCell key={String(c.key)}>
                    {c.render ? c.render(row) : String((row as any)[c.key] ?? "")}
                  </TableCell>
                ))}
                {(onEdit || onDelete || (lookupMode && onSelectRow)) && (
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {lookupMode && onSelectRow && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Select" onClick={() => onSelectRow(row)}><MousePointerClick className="h-3.5 w-3.5" /></Button>
                      )}
                      {onEdit && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(row)}><Pencil className="h-3.5 w-3.5" /></Button>}
                      {onDelete && <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setConfirmDelete(row)}><Trash2 className="h-3.5 w-3.5" /></Button>}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirm Delete</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This action cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={!!deleting}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
