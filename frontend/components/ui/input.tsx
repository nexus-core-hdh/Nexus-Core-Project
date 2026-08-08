import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, value, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      // A `null` value prop (as opposed to `undefined`, which correctly means "uncontrolled")
      // makes React log "value prop on input should not be null" and then, the next time the
      // value becomes a real string, "changing an uncontrolled input to be controlled" — this
      // is the one place every Input/InputGroupInput in the app renders a native <input>, so
      // guarding it here permanently closes off that whole class of warning regardless of
      // what any caller's state happens to hold.
      value={value === null ? "" : value}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground border-input h-9 w-full min-w-0 rounded-md border bg-muted/30 px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium md:text-sm dark:bg-input/20",
        "hover:bg-muted/50 dark:hover:bg-input/30",
        "focus-visible:border-ring focus-visible:bg-background focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:border-input/50 disabled:bg-muted/60 disabled:text-muted-foreground disabled:shadow-none disabled:hover:bg-muted/60",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }
