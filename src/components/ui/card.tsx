import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const cardVariants = cva("rounded-lg border bg-card text-card-foreground", {
  variants: {
    variant: {
      default:
        "border-border shadow-[0_2px_8px_rgba(84,19,43,0.07),0_1px_2px_rgba(44,23,32,0.05)] dark:shadow-[0_4px_14px_rgba(0,0,0,0.28)]",
      raised:
        "border-border shadow-[0_8px_24px_rgba(84,19,43,0.12)] dark:shadow-[0_4px_14px_rgba(0,0,0,0.28)]",
      highlight: "border-primary/30 bg-panel-soft shadow-[0_2px_8px_rgba(84,19,43,0.07),0_1px_2px_rgba(44,23,32,0.05)]",
      flat: "border-border shadow-none",
    },
    interactive: {
      true: "cursor-pointer transition-[transform,box-shadow] duration-150 hover:-translate-y-px hover:shadow-[0_8px_24px_rgba(84,19,43,0.12)] active:translate-y-0 active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      false: "",
    },
  },
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
