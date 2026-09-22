import * as React from "react"
import { cva } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * shadcn/ui Badge — SmartPYQ theme.
 *
 * Variant tokens map onto the existing design system:
 *   default     → soft violet surface (topic/subject chips)
 *   success     → green surface (approved / published states)
 *   warning     → amber surface (pending review states)
 *   destructive → red surface (rejected / error states)
 *   outline     → hairline border, neutral
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0620]",
  {
    variants: {
      variant: {
        default:
          "border-brand-500/30 bg-brand-500/15 text-brand-200",
        success:
          "border-green-500/30 bg-green-500/15 text-green-300",
        warning:
          "border-amber-500/30 bg-amber-500/15 text-amber-300",
        destructive:
          "border-red-500/30 bg-red-500/15 text-red-300",
        outline:
          "border-white/15 bg-white/5 text-gray-300",
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
