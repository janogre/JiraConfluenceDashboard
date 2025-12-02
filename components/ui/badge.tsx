import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-atlassian-blue text-white shadow hover:bg-atlassian-blue/80",
        secondary:
          "border-transparent bg-surface-raised text-gray-900 hover:bg-gray-200",
        destructive:
          "border-transparent bg-priority-highest text-white shadow hover:bg-priority-highest/80",
        outline: "text-gray-900",
        todo: "border-transparent bg-status-todo text-gray-700",
        "in-progress": "border-transparent bg-status-in-progress text-white",
        done: "border-transparent bg-status-done text-white",
        "priority-highest": "border-transparent bg-priority-highest text-white",
        "priority-high": "border-transparent bg-priority-high text-white",
        "priority-medium": "border-transparent bg-priority-medium text-gray-900",
        "priority-low": "border-transparent bg-priority-low text-white",
        "priority-lowest": "border-transparent bg-priority-lowest text-white",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
