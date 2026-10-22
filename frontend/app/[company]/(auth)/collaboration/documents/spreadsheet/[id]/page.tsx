"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useWorkspaceRecordLabel } from "@/hooks/use-workspace-tab-title";
import { useParams, useRouter } from "@/lib/app-navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Save, Download, Share2 } from "lucide-react";
import { documentsApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";
import { HotTable } from "@handsontable/react";
import { registerAllModules } from "handsontable/registry";
import type { GridSettings } from "handsontable/settings";
import "handsontable/dist/handsontable.full.min.css";

// Register all Handsontable modules
registerAllModules();

interface SpreadsheetData {
  data: any[][];
}

// Helper function to create default empty data (outside component to prevent re-creation)
const createDefaultData = (rows: number = 20, cols: number = 10): any[][] => {
  const defaultData: any[][] = [];
  for (let i = 0; i < rows; i++) {
    defaultData[i] = [];
    for (let j = 0; j < cols; j++) {
      defaultData[i][j] = "";
    }
  }
  return defaultData;
};

// Create a stable default data reference
const DEFAULT_DATA = createDefaultData();

export default function SpreadsheetEditorPage() {
  const params = useParams();
  const router = useRouter();
  const documentId = params?.id as string;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [document, setDocument] = useState<any>(null);
  useWorkspaceRecordLabel(document?.name || undefined);
  const [isEditingName, setIsEditingName] = useState(false);
  const [documentName, setDocumentName] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [data, setData] = useState<any[][]>(DEFAULT_DATA);
  const [containerHeight, setContainerHeight] = useState<number>(600);
  const hotTableRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadDocument();
  }, [documentId]);

  useEffect(() => {
    // Calculate container height
    const updateHeight = () => {
      if (containerRef.current) {
        const headerHeight = 80; // Approximate header height
        const newHeight = window.innerHeight - headerHeight;
        setContainerHeight(newHeight);
      }
    };

    updateHeight();
    window.addEventListener("resize", updateHeight);
    return () => window.removeEventListener("resize", updateHeight);
  }, []);

  const loadDocument = async () => {
    try {
      setLoading(true);
      const doc = await documentsApi.getDocument(documentId);
      if (doc) {
        setDocument(doc);
        setDocumentName(doc.name || "");
        // Parse the saved data
        if (doc.content) {
          try {
            const parsed = JSON.parse(doc.content);
            // Handle different data formats
            if (parsed.data && Array.isArray(parsed.data)) {
              // If it's Luckysheet format, try to extract cell data
              if (parsed.data[0]?.celldata) {
                // Convert Luckysheet format to Handsontable format
                const converted = convertLuckysheetToHandsontable(parsed.data[0]);
                setData(converted);
              } else if (Array.isArray(parsed.data[0])) {
                // Already in Handsontable format
                setData(parsed.data);
              } else {
                setData(createDefaultData());
              }
            } else if (Array.isArray(parsed)) {
              setData(parsed);
            } else {
              setData(createDefaultData());
            }
          } catch (e) {
            console.error("Error parsing document content:", e);
            setData(createDefaultData());
          }
        } else {
          setData(createDefaultData());
        }
      } else {
        toast.error("Document not found");
        router.push("/collaboration/documents");
      }
    } catch (error: any) {
      console.error("Failed to load document:", error);
      toast.error("Failed to load document");
      router.push("/collaboration/documents");
    } finally {
      setLoading(false);
    }
  };

  // Convert Luckysheet format to Handsontable format
  const convertLuckysheetToHandsontable = (sheet: any): any[][] => {
    const rows: any[][] = [];
    const maxRow = sheet.row || 84;
    const maxCol = sheet.column || 60;

    // Initialize empty grid
    for (let r = 0; r < maxRow; r++) {
      rows[r] = [];
      for (let c = 0; c < maxCol; c++) {
        rows[r][c] = "";
      }
    }

    // Fill in cell data
    if (sheet.celldata && Array.isArray(sheet.celldata)) {
      sheet.celldata.forEach((cell: any) => {
        const r = cell.r || 0;
        const c = cell.c || 0;
        const v = cell.v;
        if (v !== null && v !== undefined) {
          // Handle different value types
          if (typeof v === "object" && v.v !== undefined) {
            rows[r][c] = v.v;
          } else {
            rows[r][c] = v;
          }
        }
      });
    }

    return rows;
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const user = getCurrentUser();
      if (!user) {
        toast.error("Please log in to save documents");
        return;
      }

      // Get data from Handsontable
      if (!hotTableRef.current) {
        toast.error("Spreadsheet not initialized");
        return;
      }

      const hotInstance = hotTableRef.current.hotInstance;
      if (!hotInstance) {
        toast.error("Spreadsheet instance not available");
        return;
      }

      const sheetData = hotInstance.getData();
      
      // Save content to backend
      await documentsApi.updateDocument(documentId, {
        name: documentName || document.name,
        content: JSON.stringify(sheetData),
      });
      
      // Update document state
      setDocument({ ...document, name: documentName || document.name });

      toast.success("Spreadsheet saved successfully!");
    } catch (error: any) {
      console.error("Failed to save spreadsheet:", error);
      toast.error(error.message || "Failed to save spreadsheet");
    } finally {
      setSaving(false);
    }
  };

  // Only update settings when data or containerHeight changes, not on every render
  const hotSettings = useMemo<GridSettings>(() => {
    const settingsData = data.length > 0 && data[0]?.length > 0 ? data : DEFAULT_DATA;
    return {
      data: settingsData,
      licenseKey: "non-commercial-and-evaluation", // Free for non-commercial use
      width: "100%",
      height: containerHeight,
      rowHeaders: true,
      colHeaders: true,
      contextMenu: true,
      manualColumnResize: true,
      manualRowResize: true,
      columnSorting: true,
      filters: true,
      dropdownMenu: true,
      copyPaste: true,
      search: true,
      undo: true,
      redo: true,
      stretchH: "all",
      autoWrapRow: true,
      autoWrapCol: true,
      // Don't update state in afterChange to avoid infinite loops
      // Data will be read directly from the instance when saving
      // Prevent Handsontable from updating data prop on changes
      preventOverflow: "horizontal",
    };
  }, [data, containerHeight]);

  const handleNameSave = async () => {
    if (!documentName.trim()) {
      setDocumentName(document.name || "");
      setIsEditingName(false);
      return;
    }

    if (documentName === document.name) {
      setIsEditingName(false);
      return;
    }

    try {
      await documentsApi.updateDocument(documentId, {
        name: documentName.trim(),
      });
      setDocument({ ...document, name: documentName.trim() });
      toast.success("Document name updated");
      setIsEditingName(false);
    } catch (error: any) {
      console.error("Failed to update document name:", error);
      toast.error("Failed to update document name");
      setDocumentName(document.name || "");
      setIsEditingName(false);
    }
  };

  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
          <p className="text-muted-foreground">Loading spreadsheet...</p>
        </div>
      </div>
    );
  }

  if (!document) {
    return null;
  }

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <div className="border-b bg-background px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              {isEditingName ? (
                <Input
                  ref={nameInputRef}
                  value={documentName}
                  onChange={(e) => setDocumentName(e.target.value)}
                  onBlur={handleNameSave}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleNameSave();
                    } else if (e.key === "Escape") {
                      setDocumentName(document.name || "");
                      setIsEditingName(false);
                    }
                  }}
                  className="h-7 text-xl font-semibold"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <h1
                  className="text-lg font-semibold cursor-pointer hover:text-primary transition-colors"
                  onClick={() => setIsEditingName(true)}
                  title="Click to rename"
                >
                  {document.name}
                </h1>
              )}
              <p className="text-sm text-muted-foreground">Spreadsheet Editor</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <Share2 className="mr-2 h-4 w-4" />
              Share
            </Button>
            <Button variant="outline" size="sm">
              <Download className="mr-2 h-4 w-4" />
              Download
            </Button>
            <Button onClick={handleSave} disabled={saving} size="sm">
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </div>

      {/* Handsontable Container */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-hidden relative" 
        style={{ 
          height: `${containerHeight}px`,
          minHeight: "400px"
        }}
      >
        <div style={{ width: "100%", height: "100%", position: "relative" }}>
          {!loading && data.length > 0 && (
            <HotTable
              ref={hotTableRef}
              settings={hotSettings}
            />
          )}
        </div>
      </div>
    </div>
  );
}
