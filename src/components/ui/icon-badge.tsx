import type { LucideIcon } from "lucide-react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const iconBadgeVariants = cva("flex shrink-0 items-center justify-center rounded-full", {
  variants: {
    tone: {
      wine: "bg-primary/10 text-primary",
      berry: "bg-[color-mix(in_oklch,var(--chart-1),transparent_85%)] text-[var(--chart-1)]",
      blush: "bg-accent text-accent-foreground",
      success: "bg-success-background text-success",
      "dusty-rose": "bg-[color-mix(in_oklch,var(--dusty-rose),transparent_80%)] text-[var(--dusty-rose)]",
      plum: "bg-[color-mix(in_oklch,var(--plum),transparent_80%)] text-[var(--plum)]",
      cream: "bg-cream text-foreground",
      // Plan-38 §5/§6 semantic tones — same account-purpose and status
      // pairing used by Card's matching variants, for the small icon
      // badges placed next to a card's label/title.
      disposable: "bg-disposable-surface text-disposable-accent",
      savings: "bg-savings-surface text-savings-accent",
      restricted: "bg-restricted-surface text-restricted-accent",
      expense: "bg-expense-surface text-expense-accent",
      completed: "bg-completed-surface text-completed-accent",
      warning: "bg-warning-background text-warning",
      danger: "bg-danger-background text-danger",
      info: "bg-info-background text-info",
    },
    size: {
      sm: "size-7 [&_svg]:size-3.5",
      md: "size-9 [&_svg]:size-4.5",
    },
  },
  defaultVariants: { tone: "wine", size: "md" },
})

export interface IconBadgeProps extends VariantProps<typeof iconBadgeVariants> {
  icon: LucideIcon
  className?: string
}

function IconBadge({ icon: Icon, tone, size, className }: IconBadgeProps) {
  return (
    <span className={cn(iconBadgeVariants({ tone, size }), className)}>
      <Icon />
    </span>
  )
}

export { IconBadge, iconBadgeVariants }
