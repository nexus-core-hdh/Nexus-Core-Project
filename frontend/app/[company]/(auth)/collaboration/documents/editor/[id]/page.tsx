"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "@/lib/app-navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Save, Download, Share2 } from "lucide-react";
import { useEditor, EditorContent } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Underline } from "@tiptap/extension-underline";
import { Link } from "@tiptap/extension-link";
import { Image } from "@tiptap/extension-image";
import { TextAlign } from "@tiptap/extension-text-align";
import { Placeholder } from "@tiptap/extension-placeholder";
import { Color } from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import { Highlight } from "@/components/documents/highlight-extension";
import { OfficeRibbon } from "@/components/documents/office-ribbon";
import { documentsApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";
import type { Content } from "@tiptap/react";
import "../../office-styles.css";

export default function DocumentEditorPage() {
  const params = useParams();
  const router = useRouter();
  const documentId = params.id as string;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [document, setDocument] = useState<any>(null);
  const [content, setContent] = useState<Content>("");
  const [activeTab, setActiveTab] = useState("home");
  const [isContentLoaded, setIsContentLoaded] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [documentName, setDocumentName] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        horizontalRule: false,
        codeBlock: false,
      }),
      Underline,
      TextStyle,
      Color,
      Highlight.configure({
        multicolor: true,
      }),
      Link.configure({
        openOnClick: false,
      }),
      Image,
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      Placeholder.configure({
        placeholder: "Start writing your document...",
      }),
    ],
    content: content || "<p></p>",
    onUpdate: ({ editor }) => {
      setContent(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: "office-document-editor focus:outline-none min-h-[500px] prose prose-sm sm:prose lg:prose-lg xl:prose-xl mx-auto max-w-none",
      },
    },
    editable: true,
    immediatelyRender: false,
  });

  // Update editor content when it's loaded from the document (only once)
  useEffect(() => {
    if (editor && isContentLoaded && content && content !== "<p></p>") {
      // Only update if content is different and editor is empty
      const currentContent = editor.getHTML();
      // Check if editor is essentially empty (just empty paragraph or whitespace)
      const isEmpty = !currentContent || currentContent.trim() === "<p></p>" || currentContent.trim() === "";
      
      if (isEmpty && content !== currentContent) {
        // Use a small delay to ensure editor is ready
        setTimeout(() => {
          if (editor && !editor.isDestroyed) {
            editor.commands.setContent(content, false);
          }
        }, 100);
      }
    }
  }, [isContentLoaded]); // Only depend on isContentLoaded to run once

  useEffect(() => {
    loadDocument();
  }, [documentId]);

  const loadDocument = async () => {
    try {
      setLoading(true);
      setIsContentLoaded(false);
      const doc = await documentsApi.getDocument(documentId);
      if (doc) {
        setDocument(doc);
        setDocumentName(doc.name || "");
        // If content is a string, use it directly; if it's HTML, parse it
        const contentValue = doc.content || "";
        const parsedContent = typeof contentValue === "string" ? contentValue : "";
        setContent(parsedContent || "<p></p>");
        setIsContentLoaded(true);
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

  const handleSave = async () => {
    try {
      setSaving(true);
      const user = getCurrentUser();
      if (!user) {
        toast.error("Please log in to save documents");
        return;
      }

      // Save content to backend
      const htmlContent = editor?.getHTML() || (typeof content === "string" ? content : "");
      await documentsApi.updateDocument(documentId, {
        name: documentName || document.name,
        content: htmlContent,
      });
      
      // Update document state
      setDocument({ ...document, name: documentName || document.name });

      toast.success("Document saved successfully!");
    } catch (error: any) {
      console.error("Failed to save document:", error);
      toast.error(error.message || "Failed to save document");
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
          <p className="text-muted-foreground">Loading document...</p>
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
              <p className="text-sm text-muted-foreground">Document Editor</p>
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

      {/* Office Ribbon */}
      {editor && <OfficeRibbon editor={editor} activeTab={activeTab} onTabChange={setActiveTab} />}

      {/* Editor */}
      <div className="flex-1 overflow-auto bg-white dark:bg-[#1e1e1e]">
        <div className="mx-auto max-w-4xl bg-white dark:bg-[#1e1e1e] shadow-lg min-h-full">
          <div className="p-8">
            {editor ? (
              <EditorContent editor={editor} />
            ) : (
              <div className="flex items-center justify-center min-h-[500px]">
                <div className="text-center">
                  <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
                  <p className="text-muted-foreground">Initializing editor...</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

