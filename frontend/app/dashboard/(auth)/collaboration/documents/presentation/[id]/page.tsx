"use client";

import { useState, useEffect, useRef } from "react";
import { useWorkspaceRecordLabel } from "@/hooks/use-workspace-tab-title";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Save, ArrowLeft, Download, Share2, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { documentsApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";

interface Slide {
  id: string;
  title: string;
  content: string;
}

export default function PresentationEditorPage() {
  const params = useParams();
  const router = useRouter();
  const documentId = params.id as string;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [document, setDocument] = useState<any>(null);
  useWorkspaceRecordLabel(document?.name || undefined);
  const [slides, setSlides] = useState<Slide[]>([
    { id: "1", title: "Slide 1", content: "Add your content here..." },
  ]);
  const [selectedSlide, setSelectedSlide] = useState<string>("1");
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
            if (parsed.slides && Array.isArray(parsed.slides)) {
              setSlides(parsed.slides);
              if (parsed.slides.length > 0) {
                setSelectedSlide(parsed.slides[0].id);
              }
            }
          } catch {
            // If parsing fails, use default slides
          }
        }
      } else {
        toast.error("Document not found");
        router.push("/dashboard/collaboration/documents");
      }
    } catch (error: any) {
      console.error("Failed to load document:", error);
      toast.error("Failed to load document");
      router.push("/dashboard/collaboration/documents");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const user = getCurrentUser();
      if (!user) {
        toast.error("Please log in to save documents");
        return;
      }

      // Save content to backend
      await documentsApi.updateDocument(documentId, {
        name: documentName || document.name,
        content: JSON.stringify({ slides }),
      });
      
      // Update document state
      setDocument({ ...document, name: documentName || document.name });

      toast.success("Presentation saved successfully!");
    } catch (error: any) {
      console.error("Failed to save presentation:", error);
      toast.error(error.message || "Failed to save presentation");
    } finally {
      setSaving(false);
    }
  };

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
      toast.success("Presentation name updated");
      setIsEditingName(false);
    } catch (error: any) {
      console.error("Failed to update presentation name:", error);
      toast.error("Failed to update presentation name");
      setDocumentName(document.name || "");
      setIsEditingName(false);
    }
  };

  const addSlide = () => {
    const newId = Date.now().toString();
    const newSlide: Slide = {
      id: newId,
      title: `Slide ${slides.length + 1}`,
      content: "Add your content here...",
    };
    setSlides([...slides, newSlide]);
    setSelectedSlide(newId);
  };

  const deleteSlide = (id: string) => {
    if (slides.length === 1) {
      toast.error("Cannot delete the last slide");
      return;
    }
    const newSlides = slides.filter((s) => s.id !== id);
    setSlides(newSlides);
    if (selectedSlide === id) {
      setSelectedSlide(newSlides[0].id);
    }
  };

  const updateSlide = (id: string, field: "title" | "content", value: string) => {
    setSlides(
      slides.map((slide) => (slide.id === id ? { ...slide, [field]: value } : slide))
    );
  };

  const currentSlide = slides.find((s) => s.id === selectedSlide);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
          <p className="text-muted-foreground">Loading presentation...</p>
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
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push("/dashboard/collaboration/documents")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
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
                  className="text-xl font-semibold cursor-pointer hover:text-primary transition-colors"
                  onClick={() => setIsEditingName(true)}
                  title="Click to rename"
                >
                  {document.name}
                </h1>
              )}
              <p className="text-sm text-muted-foreground">Presentation Editor</p>
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

      {/* Editor */}
      <div className="flex flex-1 overflow-hidden">
        {/* Slides Sidebar */}
        <div className="w-64 border-r bg-muted/30 overflow-y-auto p-4">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold">Slides</h3>
            <Button size="icon" variant="outline" onClick={addSlide}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-2">
            {slides.map((slide, index) => (
              <Card
                key={slide.id}
                className={`cursor-pointer transition-colors ${
                  selectedSlide === slide.id ? "border-primary bg-primary/5" : ""
                }`}
                onClick={() => setSelectedSlide(slide.id)}
              >
                <CardContent className="p-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground mb-1">Slide {index + 1}</p>
                      <p className="text-sm font-medium truncate">{slide.title}</p>
                    </div>
                    {slides.length > 1 && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteSlide(slide.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Slide Editor */}
        <div className="flex-1 overflow-auto p-6">
          {currentSlide && (
            <Card className="h-full">
              <CardContent className="p-6">
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Slide Title</label>
                    <Input
                      value={currentSlide.title}
                      onChange={(e) => updateSlide(currentSlide.id, "title", e.target.value)}
                      placeholder="Enter slide title"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Slide Content</label>
                    <Textarea
                      value={currentSlide.content}
                      onChange={(e) => updateSlide(currentSlide.id, "content", e.target.value)}
                      placeholder="Enter slide content"
                      className="min-h-[400px]"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

