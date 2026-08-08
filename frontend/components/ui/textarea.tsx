import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:bg-background focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive bg-muted/30 hover:bg-muted/50 dark:bg-input/20 dark:hover:bg-input/30 flex field-sizing-content min-h-16 w-full rounded-md border px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:pointer-events-none disabled:cursor-not-allowed disabled:border-input/50 disabled:bg-muted/60 disabled:text-muted-foreground disabled:hover:bg-muted/60 disabled:shadow-none md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
