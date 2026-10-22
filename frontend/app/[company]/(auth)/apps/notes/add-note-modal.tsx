"use client";

import React from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { ImageIcon, Tag, PenSquare, Check, Trash2Icon, ArchiveIcon } from "lucide-react";
import { MinimalTiptapEditor } from "@/components/ui/custom/minimal-tiptap";
import { Content } from "@tiptap/react";

import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from "@/components/ui/command";
import { NoteLabel } from "@/app/[company]/(auth)/apps/notes/types";
import { Badge } from "@/components/ui/badge";
import { noteLabels } from "@/app/[company]/(auth)/apps/notes/data";
import { notesApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";

interface AddNoteModalProps {
  onNoteCreated?: () => void;
}

export function AddNoteModal({ onNoteCreated }: AddNoteModalProps) {
  const [imagePreview, setImagePreview] = React.useState<string | null>(null);
  const [value, setValue] = React.useState<Content>("");
  const [selectedTags, setSelectedTags] = React.useState<NoteLabel[]>([]);
  const [title, setTitle] = React.useState("");
  const [isOpen, setIsOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim()) {
      toast.error("Please enter a title");
      return;
    }

    const user = getCurrentUser();
    if (!user) {
      toast.error("Please log in to create notes");
      return;
    }

    setIsSubmitting(true);

    try {
      // Extract HTML content from the editor
      let content: string | null = null;
      if (value) {
        if (typeof value === 'string') {
          content = value;
        } else if ((value as any)?.html) {
          content = (value as any).html;
        } else if ((value as any)?.text) {
          content = (value as any).text;
        }
      }
      
      // Determine note type based on content
      let noteType: "text" | "checklist" | "image" = "text";
      if (imagePreview) {
        noteType = "image";
      }

      const noteData = {
        title: title.trim(),
        content: content || null,
        type: noteType,
        userId: user.id,
        isArchived: false,
        image: imagePreview || null,
        labelIds: selectedTags.map(tag => tag.id),
      };

      console.log('Creating note with data:', noteData);

      await notesApi.createNote(noteData);
      
      toast.success("Note created successfully!");
      
      // Reset form
      setTitle("");
      setValue("");
      setImagePreview(null);
      setSelectedTags([]);
      setIsOpen(false);
      
      // Call callback to refresh notes list
      if (onNoteCreated) {
        onNoteCreated();
      }
      
      // Dispatch custom event for other components to listen
      window.dispatchEvent(new CustomEvent('noteCreated'));
      
      // Fallback: reload the page if no callback
      if (!onNoteCreated) {
        setTimeout(() => window.location.reload(), 500);
      }
    } catch (error: any) {
      console.error("Failed to create note:", error);
      toast.error("Failed to create note", {
        description: error.message || "An error occurred",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="w-full">
          <PenSquare />
          <span className="hidden md:block">Add Note</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-screen max-w-(--breakpoint-sm) overflow-y-scroll p-0 lg:overflow-y-auto">
        {imagePreview && (
          <figure>
            <Image
              src={imagePreview}
              width={200}
              height={200}
              alt="shadcn/ui"
              className="aspect-video w-full rounded-tl-md rounded-tr-md object-cover"
              unoptimized
            />
          </figure>
        )}
        <VisuallyHidden>
          <DialogTitle>Add Note</DialogTitle>
        </VisuallyHidden>

        <form onSubmit={handleSubmit} className={cn({ "p-6": !imagePreview, "p-6 pt-0": imagePreview })}>
          <div className="space-y-6">
            <Input
              placeholder="Title"
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mb-4 rounded-none border-0 px-0 text-xl focus-visible:ring-0"
              required
            />

            <MinimalTiptapEditor
              value={value}
              onChange={setValue}
              className="w-full"
              editorContentClassName="p-5"
              output="html"
              placeholder="Enter note description..."
              autofocus={true}
              editable={true}
              editorClassName="focus:outline-hidden"
            />
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-1">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      <Input
                        id="picture"
                        type="file"
                        className="hidden"
                        accept="image/*"
                        onChange={handleFileChange}
                      />
                      <Button type="button" variant="ghost" size="icon">
                        <label htmlFor="picture" className="cursor-pointer">
                          <ImageIcon className="size-4" />
                        </label>
                      </Button>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Add image</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <Tag className="h-4 w-4" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[200px] p-0">
                          <Command>
                            <CommandInput placeholder="Search tags..." className="h-9" />
                            <CommandList>
                              <CommandEmpty>No labels found.</CommandEmpty>
                              <CommandGroup className="p-2">
                                {noteLabels &&
                                  noteLabels.length &&
                                  noteLabels.map((label, key: number) => (
                                    <CommandItem
                                      key={key}
                                      className="flex items-center py-2"
                                      onSelect={() => {
                                        if (selectedTags.includes(label)) {
                                          return setSelectedTags(
                                            selectedTags.filter((item) => item.id !== label.id)
                                          );
                                        }

                                        return setSelectedTags(
                                          [...noteLabels].filter((u) =>
                                            [...selectedTags, label].includes(u)
                                          )
                                        );
                                      }}>
                                      <div className="flex grow items-center gap-2">
                                        <span
                                          className={cn(
                                            "block size-3 rounded-full",
                                            label.color
                                          )}></span>
                                        <span className="text-sm leading-none">{label.title}</span>
                                        {selectedTags.includes(label) ? (
                                          <Check className="text-primary ms-auto size-3" />
                                        ) : null}
                                      </div>
                                    </CommandItem>
                                  ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Add tag</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <ArchiveIcon className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Archive</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <Trash2Icon className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Delete</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Add Note"}
            </Button>
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            {selectedTags.map((tag, key) => (
              <Badge key={key} variant="outline">
                {tag.title}
              </Badge>
            ))}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
