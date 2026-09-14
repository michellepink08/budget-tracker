import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const cardVariants = cva("group rounded-lg border bg-card text-card-foreground", {
  variants: {
    variant: {
      default:
        "border-border shadow-[0_2px_8px_rgba(114,29,66,0.07),0_1px_2px_rgba(41,29,37,0.05)] dark:shadow-[0_4px_14px_rgba(0,0,0,0.28)]",
      raised:
        "border-border shadow-[0_8px_24px_rgba(114,29,66,0.12)] dark:shadow-[0_4px_14px_rgba(0,0,0,0.28)]",
      highlight: "border-primary/30 bg-panel-soft shadow-[0_2px_8px_rgba(114,29,66,0.07),0_1px_2px_rgba(41,29,37,0.05)]",
      flat: "border-border shadow-none",
      // Plan-38 §5/§6 semantic tones. "Purpose" tones color an account or
      // amount by what kind of money it is; "status" tones color a card by
      // what state it's in. Always paired with an icon + text label in the
      // component that uses them — never color alone (plan-38 §5).
      disposable: "border-disposable-accent/30 bg-disposable-surface text-foreground",
      savings: "border-savings-accent/30 bg-savings-surface text-foreground",
      restricted: "border-restricted-accent/30 bg-restricted-surface text-foreground",
      expense: "border-expense-accent/30 bg-expense-surface text-foreground",
      completed: "border-completed-accent/30 bg-completed-surface text-foreground",
      warning: "border-warning/30 bg-warning-background text-foreground",
      danger: "border-danger/30 bg-danger-background text-foreground",
      info: "border-info/30 bg-info-background text-foreground",
      success: "border-success/30 bg-success-background text-foreground",
    },
    interactive: {
      // Wine theme v3: 2-3px lift (vs. the old 1px), a subtle 1.01 scale,
      // a background brighten, and a per-variant border glow (added below
      // via compoundVariants, since the glow color must match whichever
      // semantic variant the card already has). 200ms sits in the spec's
      // 180-220ms range. motion-reduce keeps the glow/shadow/brighten and
      // the focus ring but drops all movement, matching the same pattern
      // already used in side-nav.tsx's nav links.
      true:
        "cursor-pointer transition-[transform,box-shadow,filter] duration-200 ease-out" +
        " hover:-translate-y-0.5 hover:scale-[1.01] hover:shadow-[0_8px_24px_rgba(114,29,66,0.16)] hover:brightness-105" +
        " focus-visible:-translate-y-0.5 focus-visible:scale-[1.01] focus-visible:shadow-[0_8px_24px_rgba(114,29,66,0.16)] focus-visible:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" +
        " active:translate-y-0 active:scale-100 active:shadow-[0_2px_8px_rgba(114,29,66,0.1)] active:brightness-100" +
        " motion-reduce:hover:translate-y-0 motion-reduce:hover:scale-100 motion-reduce:focus-visible:translate-y-0 motion-reduce:focus-visible:scale-100",
      false: "",
    },
  },
  compoundVariants: [
    { variant: "disposable", interactive: true, class: "hover:border-disposable-accent/70 focus-visible:border-disposable-accent/70" },
    { variant: "savings", interactive: true, class: "hover:border-savings-accent/70 focus-visible:border-savings-accent/70" },
    { variant: "restricted", interactive: true, class: "hover:border-restricted-accent/70 focus-visible:border-restricted-accent/70" },
    { variant: "expense", interactive: true, class: "hover:border-expense-accent/70 focus-visible:border-expense-accent/70" },
    { variant: "completed", interactive: true, class: "hover:border-completed-accent/70 focus-visible:border-completed-accent/70" },
    { variant: "warning", interactive: true, class: "hover:border-warning/70 focus-visible:border-warning/70" },
    { variant: "danger", interactive: true, class: "hover:border-danger/70 focus-visible:border-danger/70" },
    { variant: "info", interactive: true, class: "hover:border-info/70 focus-visible:border-info/70" },
    { variant: "success", interactive: true, class: "hover:border-success/70 focus-visible:border-success/70" },
    { variant: "default", interactive: true, class: "hover:border-primary/40 focus-visible:border-primary/40" },
    { variant: "raised", interactive: true, class: "hover:border-primary/40 focus-visible:border-primary/40" },
    { variant: "highlight", interactive: true, class: "hover:border-primary/50 focus-visible:border-primary/50" },
    { variant: "flat", interactive: true, class: "hover:border-primary/30 focus-visible:border-primary/30" },
  ],
  defaultVariants: { variant: "default", interactive: false },
})

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

function Card({ className, variant, interactive, ...props }: CardProps) {
  return (
    <div
      data-slot="card"
      className={cn(cardVariants({ variant, interactive }), className)}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="card-header" className={cn("flex flex-col gap-1", className)} {...props} />
}

function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 data-slot="card-title" className={cn("text-md font-semibold", className)} {...props} />
}

function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="card-content" className={cn("flex flex-col gap-2", className)} {...props} />
}

export { Card, CardHeader, CardTitle, CardContent, cardVariants }
