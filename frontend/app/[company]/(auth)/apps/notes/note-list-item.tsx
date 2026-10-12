import { cn } from "@/lib/utils";
import Image from "next/image";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Note } from "@/app/[company]/(auth)/apps/notes/types";
import { noteLabels } from "@/app/[company]/(auth)/apps/notes/data";
import { Checkbox } from "@/components/ui/checkbox";

export default function NoteListItem({ note }: { note: Note }) {
  return (
    <Card className="relative mb-4 block break-inside-avoid gap-0 overflow-hidden rounded-md transition-shadow group-data-[view-mode=list]:py-0 group-data-[view-mode=masonry]:pt-0 hover:shadow-lg md:group-data-[view-mode=list]:flex md:group-data-[view-mode=list]:flex-row">
      {note.type === "image" && note.image && (
        <figure className="top-0 h-full shrink-0 md:group-data-[view-mode=list]:w-62">
          <Image
            width={200}
            height={150}
            src={note.image}
            className="aspect-square h-full w-full object-cover group-data-[view-mode=list]:md:absolute md:group-data-[view-mode=list]:w-62"
            alt="shadcn/ui"
            unoptimized
          />
        </figure>
      )}
      <CardContent className="pt-6 group-data-[view-mode=list]:pb-6">
        <div className="space-y-4">
          <h3 className="font-display text-xl lg:text-2xl">{note.title}</h3>
          {note.type === "checklist" && note.items && (
            <ul className="peer space-y-4">
              {note.items.map((item, key) => (
                <li
                  key={key}
                  className={cn("flex items-center space-x-2", {
                    "text-muted-foreground line-through": item.checked
                  })}>
                  <Checkbox
                    className="peer"
                    id={`checklist_${key}`}
                    defaultChecked={item.checked}
                  />
                  <label
                    htmlFor={`checklist_${key}`}
                    className="text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70 aria-checked:line-through">
                    {item.text}
                  </label>
                </li>
              ))}
            </ul>
          )}
          {note.type === "text" && note.content && (
            <div 
              className="text-muted-foreground text-sm prose prose-sm max-w-none dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: note.content }}
            />
          )}
          {note.type === "image" && note.content && (
            <div 
              className="text-muted-foreground text-sm prose prose-sm max-w-none dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: note.content }}
            />
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {note.labels.map((id, key) => {
              const label = noteLabels.find((e) => e.id === id);
              if (label)
                return (
                  <Badge key={key} variant="outline">
                    <span className={cn("me-1 size-2 shrink-0 rounded-full", label.color)}></span>
                    {label.title}
                  </Badge>
                );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
