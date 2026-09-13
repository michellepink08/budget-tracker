import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "cn"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        // Plan-38 §10: form fields need a visibly raised surface of their
        // own (not bg-transparent, which just shows whatever's behind
        // them) — bg-input is the dedicated "editable field" token from
        // the Stage C palette, plus a soft inner shadow for depth and a
        // stronger border/ring on hover and focus.
        "h-8 w-full min-w-0 rounded-lg border border-input bg-input px-2.5 py-1 text-base shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground hover:border-ring/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:opacity-50 disabled:shadow-none read-only:cursor-default read-only:border-border read-only:bg-muted/60 read-only:shadow-none aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
