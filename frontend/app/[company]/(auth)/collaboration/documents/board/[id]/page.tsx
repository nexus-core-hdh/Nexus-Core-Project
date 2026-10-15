"use client";

import { useState, useEffect, useRef } from "react";
import { useWorkspaceRecordLabel } from "@/hooks/use-workspace-tab-title";
import { useParams, useRouter } from "@/lib/app-navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Save, Plus, Trash2, GripVertical } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { documentsApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";
import * as Kanban from "@/components/ui/kanban";

interface Card {
  id: string;
  title: string;
  description?: string;
}

interface Column {
  id: string;
  title: string;
  cards: Card[];
}

interface BoardData {
  columns: Column[];
}

export default function BoardEditorPage() {
  const params = useParams();
  const router = useRouter();
  const documentId = params.id as string;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [document, setDocument] = useState<any>(null);
  useWorkspaceRecordLabel(document?.name || undefined);
  const [columns, setColumns] = useState<Column[]>([]);
  const [isEditingName, setIsEditingName] = useState(false);
  const [documentName, setDocumentName] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadDocument();
  }, [documentId]);

  const loadDocument = async () => {
    try {
      setLoading(true);
      const doc = await documentsApi.getDocument(documentId);
      if (doc) {
        setDocument(doc);
        setDocumentName(doc.name || "");
        if (doc.content) {
          try {
            const parsed = JSON.parse(doc.content);
            if (parsed.columns && Array.isArray(parsed.columns)) {
              setColumns(parsed.columns);
            } else {
              // Default columns if content is invalid
              setColumns([
                { id: "1", title: "To Do", cards: [] },
                { id: "2", title: "In Progress", cards: [] },
                { id: "3", title: "Done", cards: [] },
              ]);
            }
          } catch (e) {
            // If parsing fails, use default columns
            setColumns([
              { id: "1", title: "To Do", cards: [] },
              { id: "2", title: "In Progress", cards: [] },
              { id: "3", title: "Done", cards: [] },
            ]);
          }
        } else {
          // Default columns if no content
          setColumns([
            { id: "1", title: "To Do", cards: [] },
            { id: "2", title: "In Progress", cards: [] },
            { id: "3", title: "Done", cards: [] },
          ]);
        }
      }
    } catch (error: any) {
      console.error("Failed to load document:", error);
      toast.error("Failed to load document");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const content = JSON.stringify({ columns });
      await documentsApi.updateDocument(documentId, {
        name: documentName || document.name,
        content,
      });
      
      // Update document state
      setDocument({ ...document, name: documentName || document.name });
      toast.success("Board saved successfully!");
    } catch (error: any) {
      console.error("Failed to save board:", error);
      toast.error(error.message || "Failed to save board");
    } finally {
      setSaving(false);
    }
  };

  const addColumn = () => {
    const newColumn: Column = {
      id: Date.now().toString(),
      title: "New Column",
      cards: [],
    };
    setColumns([...columns, newColumn]);
  };

  const updateColumnTitle = (columnId: string, title: string) => {
    setColumns(
      columns.map((col) => (col.id === columnId ? { ...col, title } : col))
    );
  };

  const deleteColumn = (columnId: string) => {
    setColumns(columns.filter((col) => col.id !== columnId));
  };

  const addCard = (columnId: string) => {
    const newCard: Card = {
      id: Date.now().toString(),
      title: "New Card",
      description: "",
    };
    setColumns(
      columns.map((col) =>
        col.id === columnId
          ? { ...col, cards: [...col.cards, newCard] }
          : col
      )
    );
  };

  const updateCard = (columnId: string, cardId: string, updates: Partial<Card>) => {
    setColumns(
      columns.map((col) =>
        col.id === columnId
          ? {
              ...col,
              cards: col.cards.map((card) =>
                card.id === cardId ? { ...card, ...updates } : card
              ),
            }
          : col
      )
    );
  };

  const deleteCard = (columnId: string, cardId: string) => {
    setColumns(
      columns.map((col) =>
        col.id === columnId
          ? { ...col, cards: col.cards.filter((card) => card.id !== cardId) }
          : col
      )
    );
  };

  // Convert columns to kanban format (Record<string, Card[]>)
  const kanbanData = columns.reduce((acc, col) => {
    acc[col.id] = col.cards;
    return acc;
  }, {} as Record<string, Card[]>);

  const handleValueChange = (newData: Record<string, Card[]>) => {
    // Convert back to columns format, preserving the order from newData keys
    // Object.keys() preserves insertion order in modern JavaScript
    const newColumnOrder = Object.keys(newData);
    const columnMap = new Map(columns.map(col => [col.id, col]));
    
    const newColumns = newColumnOrder.map((id) => {
      const existingColumn = columnMap.get(id);
      return {
        id,
        title: existingColumn?.title || "Untitled",
        cards: newData[id] || [],
      };
    });
    
    setColumns(newColumns);
  };

  const handleColumnMove = (event: any) => {
    // Handle column reordering when columns are dragged
    const { active, over, activeIndex, overIndex } = event;
    if (!active || !over || active.id === over.id) return;

    // Check if we're moving a column (when both IDs are column IDs)
    const isColumnMove = active.id in kanbanData && over.id in kanbanData;
    
    if (isColumnMove && activeIndex !== overIndex) {
      // Reorder columns array using the indices from the event
      const newColumns = [...columns];
      const [movedColumn] = newColumns.splice(activeIndex, 1);
      newColumns.splice(overIndex, 0, movedColumn);
      setColumns(newColumns);
    }
  };

  // Auto-save when columns change (debounced)
  useEffect(() => {
    if (!loading && columns.length > 0) {
      const timeoutId = setTimeout(() => {
        // Only save if not currently saving
        if (!saving) {
          const content = JSON.stringify({ columns });
          documentsApi.updateDocument(documentId, {
            name: documentName || document?.name,
            content,
          }).catch((error: any) => {
            console.error("Auto-save failed:", error);
            // Don't show error toast for auto-save failures
          });
        }
      }, 1000); // Debounce by 1 second

      return () => clearTimeout(timeoutId);
    }
  }, [columns, documentId, documentName, document, loading, saving]);

  const handleNameSave = async () => {
    if (!documentName.trim()) {
      setDocumentName(document?.name || "");
      setIsEditingName(false);
      return;
    }

    if (documentName === document?.name) {
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
      setDocumentName(document?.name || "");
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
          <p className="text-muted-foreground">Loading board...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <div className="border-b bg-background">
        <div className="flex items-center justify-between px-6 py-3">
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
                      setDocumentName(document?.name || "");
                      setIsEditingName(false);
                    }
                  }}
                  className="h-7 text-lg font-semibold"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <h1
                  className="text-lg font-semibold cursor-pointer hover:text-primary transition-colors"
                  onClick={() => setIsEditingName(true)}
                  title="Click to rename"
                >
                  {document?.name || "Untitled Board"}
                </h1>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="gap-2"
            >
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </div>

      {/* Board Content */}
      <div className="flex-1 overflow-auto bg-muted/30 p-6">
        <Kanban.Root
          value={kanbanData}
          onValueChange={handleValueChange}
          onMove={handleColumnMove}
          getItemValue={(item) => item.id}
        >
          <Kanban.Board className="flex w-full gap-4 overflow-x-auto pb-4">
            {columns.map((column) => (
              <Kanban.Column
                key={column.id}
                value={column.id}
                className="w-[300px] min-w-[300px]"
              >
                <div className="mb-2 flex items-center justify-between rounded-lg bg-background p-3 shadow-sm gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Kanban.ColumnHandle asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 cursor-grab active:cursor-grabbing flex-shrink-0"
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </Kanban.ColumnHandle>
                    <Input
                      value={column.title}
                      onChange={(e) => updateColumnTitle(column.id, e.target.value)}
                      className="h-8 border-0 bg-transparent p-0 font-semibold focus-visible:ring-0 flex-1 min-w-0"
                      onBlur={handleSave}
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      placeholder="Column title"
                    />
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={(e) => {
                        e.stopPropagation();
                        addCard(column.id);
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      title="Add card"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                    {columns.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteColumn(column.id);
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        title="Delete column"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
                {column.cards.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {column.cards.map((card) => (
                      <Kanban.Item key={card.id} value={card.id} asChild asHandle>
                        <Card className="mb-2 cursor-grab active:cursor-grabbing">
                          <CardContent className="p-3">
                            <div className="flex items-start gap-2 mb-2">
                              <GripVertical className="h-4 w-4 text-muted-foreground mt-1 flex-shrink-0" />
                              <Input
                                value={card.title}
                                onChange={(e) =>
                                  updateCard(column.id, card.id, { title: e.target.value })
                                }
                                className="flex-1 border-0 bg-transparent p-0 font-medium focus-visible:ring-0"
                                placeholder="Card title"
                                onBlur={handleSave}
                                onClick={(e) => e.stopPropagation()}
                                onMouseDown={(e) => e.stopPropagation()}
                              />
                            </div>
                            <Textarea
                              value={card.description || ""}
                              onChange={(e) =>
                                updateCard(column.id, card.id, {
                                  description: e.target.value,
                                })
                              }
                              className="min-h-[60px] border-0 bg-transparent p-0 text-sm text-muted-foreground focus-visible:ring-0 ml-6"
                              placeholder="Add description..."
                              onBlur={handleSave}
                              onClick={(e) => e.stopPropagation()}
                              onMouseDown={(e) => e.stopPropagation()}
                            />
                            <div className="mt-2 flex justify-end">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteCard(column.id, card.id);
                                }}
                                onMouseDown={(e) => e.stopPropagation()}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      </Kanban.Item>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border-2 border-dashed border-muted-foreground/25 p-8 text-center text-sm text-muted-foreground">
                    No cards yet. Click + to add one.
                  </div>
                )}
              </Kanban.Column>
            ))}
          </Kanban.Board>
        </Kanban.Root>

        {/* Add Column Button */}
        <div className="mt-4 flex justify-center">
          <Button
            variant="outline"
            onClick={addColumn}
            className="gap-2"
            size="lg"
          >
            <Plus className="h-4 w-4" />
            Add Stage
          </Button>
        </div>
      </div>
    </div>
  );
}

