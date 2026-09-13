import * as React from "react"
import { cn } from "cn"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        // See input.tsx for why this is bg-input (a raised surface of its
        // own) instead of bg-transparent — plan-38 §10.
        "flex field-sizing-content min-h-16 w-full rounded-lg border border-input bg-input px-2.5 py-2 text-base shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] transition-colors outline-none placeholder:text-muted-foreground hover:border-ring/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:opacity-50 disabled:shadow-none read-only:cursor-default read-only:border-border read-only:bg-muted/60 read-only:shadow-none aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
