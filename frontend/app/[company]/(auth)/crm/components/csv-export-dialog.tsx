"use client";

import * as React from "react";
import { Download, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";

export type ExportField = {
  key: string;
  label: string;
};

type CsvExportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  fields: ExportField[];
  defaultSelectedKeys?: string[];
  onExport: (selectedKeys: string[]) => Promise<void> | void;
};

export function CsvExportDialog({
  open,
  onOpenChange,
  title,
  description,
  fields,
  defaultSelectedKeys,
  onExport
}: CsvExportDialogProps) {
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [query, setQuery] = React.useState("");
  const [exporting, setExporting] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const defaults =
      defaultSelectedKeys && defaultSelectedKeys.length > 0
        ? defaultSelectedKeys
        : fields.slice(0, 10).map((f) => f.key);
    setSelected(new Set(defaults));
    setQuery("");
  }, [open, fields, defaultSelectedKeys]);

  const filteredFields = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return fields;
    return fields.filter((f) => f.label.toLowerCase().includes(q) || f.key.toLowerCase().includes(q));
  }, [fields, query]);

  const allVisibleSelected =
    filteredFields.length > 0 && filteredFields.every((f) => selected.has(f.key));
  const someVisibleSelected =
    filteredFields.some((f) => selected.has(f.key)) && !allVisibleSelected;

  const toggleAllVisible = (value: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      filteredFields.forEach((f) => {
        if (value) next.add(f.key);
        else next.delete(f.key);
      });
      return next;
    });
  };

  const toggleOne = (key: string, value: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (value) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const handleExport = async () => {
    const keys = Array.from(selected);
    if (keys.length === 0) return;
    try {
      setExporting(true);
      await onExport(keys);
      onOpenChange(false);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description || "Choose which fields you want to export to CSV."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search fields..."
              className="pl-9"
            />
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                onCheckedChange={(v) => toggleAllVisible(!!v)}
                id="select-all-fields"
              />
              <Label htmlFor="select-all-fields" className="cursor-pointer">
                Select all (visible)
              </Label>
            </div>
            <div className="text-sm text-muted-foreground">{selected.size} selected</div>
          </div>

          <ScrollArea className="h-[320px] rounded-md border">
            <div className="p-3 space-y-2">
              {filteredFields.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">No fields found.</div>
              ) : (
                filteredFields.map((f) => (
                  <div key={f.key} className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-accent">
                    <Checkbox
                      checked={selected.has(f.key)}
                      onCheckedChange={(v) => toggleOne(f.key, !!v)}
                      id={`field-${f.key}`}
                    />
                    <Label htmlFor={`field-${f.key}`} className="cursor-pointer flex-1">
                      {f.label}
                    </Label>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={exporting}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={exporting || selected.size === 0}>
            <Download className="mr-2 h-4 w-4" />
            {exporting ? "Exporting..." : "Export CSV"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


