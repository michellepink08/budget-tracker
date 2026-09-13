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
