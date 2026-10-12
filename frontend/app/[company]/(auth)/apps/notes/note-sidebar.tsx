import React, { useState, useEffect } from "react";
import { Archive, Edit3, PenSquare } from "lucide-react";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { API_BASE_URL, notesApi } from "@/lib/api";
import { NoteLabel } from "./types";
import { AddNoteModal } from "./add-note-modal";
import { EditLabelsModal } from "./edit-labels-modal";

export default function NoteSidebar() {
  return (
    <div className="sticky top-18 hidden space-y-4 xl:block">
      <AddNoteModal />
      <NoteSidebarContent />
    </div>
  );
}

export function NoteMobileSidebar({ children }: { children?: React.ReactNode }) {
  return (
    <Sheet>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent className="px-0">
        <VisuallyHidden>
          <DialogHeader>
            <DialogTitle>Dialog</DialogTitle>
          </DialogHeader>
        </VisuallyHidden>
        <NoteSidebarContent />
      </SheetContent>
    </Sheet>
  );
}

export function NoteSidebarContent() {
  const [noteLabels, setNoteLabels] = useState<NoteLabel[]>([]);
  const [loading, setLoading] = useState(true);

  // For now, using a hardcoded userId. In a real app, this would come from auth context
  const userId = 1;

  useEffect(() => {
    const fetchLabels = async () => {
      try {
        const fetchedNotes = await fetch(`${API_BASE_URL}/notelabels`);
                if (fetchedNotes.ok) {
                  const data = await fetchedNotes.json();
                setNoteLabels(data);
                }
      } catch (error) {
        console.error('Failed to fetch note labels:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchLabels();
  }, [userId]);

  return (
    <div className="flex flex-col rounded-md p-2 xl:w-64 xl:border">
      <div className="space-y-1">
        <Button variant="ghost" className="w-full justify-start">
          <PenSquare />
          Notes
        </Button>
        <Button variant="ghost" className="w-full justify-start">
          <Archive />
          Archive
        </Button>
        <EditLabelsModal>
          <Button variant="ghost" className="w-full justify-start">
            <Edit3 />
            Edit Labels
          </Button>
        </EditLabelsModal>
      </div>

      <Separator className="my-4" />

      <div className="flex-1">
        <div className="text-muted-foreground mb-3 px-2 text-sm font-medium">Labels</div>
        <nav>
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading labels...</div>
          ) : (
            noteLabels.map((label) => (
              <Button key={label.id} variant="ghost" className="w-full justify-start font-normal">
                <span className={`me-1 size-2 rounded-full ${label.color}`} />
                {label.title}
              </Button>
            ))
          )}
        </nav>
      </div>
    </div>
  );
}
