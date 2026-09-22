import * as React from "react"
import { cva } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * shadcn/ui Badge — SmartPYQ theme.
 *
 * Variant tokens map onto the existing design system:
 *   default     → soft accent surface (topic/subject chips)
 *   success     → green surface (approved / published states)
 *   warning     → amber surface (pending review states)
 *   destructive → red surface (rejected / error states)
 *   outline     → hairline border, neutral
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAF9F5]",
  {
    variants: {
      variant: {
        default:
          "border-brand-500/25 bg-brand-50 text-brand-700",
        success:
          "border-success-500/30 bg-success-50 text-success",
        warning:
          "border-warning-500/30 bg-warning-50 text-warning",
        destructive:
          "border-error-500/30 bg-error-50 text-error",
        outline:
          "border-line bg-white text-secondary",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({ className, variant, ...props }) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
