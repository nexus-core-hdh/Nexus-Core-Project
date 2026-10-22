"use client";

import * as React from "react";
import { Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { parseCsv } from "./csv-utils";

type CsvImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  requiredHeaders?: string[];
  onImportRows: (rows: Array<Record<string, string>>) => Promise<void> | void;
};

export function CsvImportDialog({
  open,
  onOpenChange,
  title,
  description,
  requiredHeaders,
  onImportRows
}: CsvImportDialogProps) {
  const [file, setFile] = React.useState<File | null>(null);
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [preview, setPreview] = React.useState<Array<Record<string, string>>>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [importing, setImporting] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setFile(null);
      setHeaders([]);
      setPreview([]);
      setError(null);
      setImporting(false);
    }
  }, [open]);

  const readFile = async (f: File) => {
    const text = await f.text();
    const parsed = parseCsv(text);
    setHeaders(parsed.headers);
    setPreview(parsed.rows.slice(0, 10));

    if (requiredHeaders && requiredHeaders.length > 0) {
      const missing = requiredHeaders.filter((h) => !parsed.headers.includes(h));
      if (missing.length > 0) {
        setError(`Missing required column(s): ${missing.join(", ")}`);
        return;
      }
    }
    setError(null);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setHeaders([]);
    setPreview([]);
    setError(null);
    if (f) {
      try {
        await readFile(f);
      } catch (err: any) {
        setError(err?.message || "Failed to read CSV");
      }
    }
  };

  const handleImport = async () => {
    if (!file || error) return;
    try {
      setImporting(true);
      const text = await file.text();
      const parsed = parseCsv(text);
      await onImportRows(parsed.rows);
      onOpenChange(false);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description || "Upload a CSV file. The first row must contain the column headers."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="csv-file">CSV file</Label>
            <Input id="csv-file" type="file" accept=".csv,text/csv" onChange={handleFileChange} />
          </div>

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {headers.length > 0 && (
            <div className="rounded-md border p-3">
              <div className="text-sm font-medium">Detected columns</div>
              <div className="mt-2 text-xs text-muted-foreground break-words">{headers.join(", ")}</div>
            </div>
          )}

          {preview.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm font-medium">Preview (first {preview.length} rows)</div>
              <ScrollArea className="h-[220px] rounded-md border">
                <pre className="p-3 text-xs">{JSON.stringify(preview, null, 2)}</pre>
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={!file || !!error || importing}>
            <Upload className="mr-2 h-4 w-4" />
            {importing ? "Importing..." : "Import CSV"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


















