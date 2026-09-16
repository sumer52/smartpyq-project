import * as React from "react"
import { cva } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * shadcn/ui Button — SmartPYQ theme.
 *
 * Variant tokens map onto the existing design system:
 *   default     → brand violet primary (btn-primary equivalent)
 *   secondary   → glassy surface on the dark bg (btn-secondary equivalent)
 *   ghost       → transparent, hover surface only
 *   outline     → hairline border, violet on hover
 *   destructive → red-500 surface for destructive confirmations
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0620] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-b from-brand-500 to-brand-600 text-white shadow-[0_6px_30px_rgba(108,78,246,0.25)] hover:from-brand-400 hover:to-brand-500",
        secondary:
          "bg-white/5 border border-white/10 text-white hover:bg-white/10 hover:border-white/20",
        ghost: "text-gray-300 hover:bg-white/5 hover:text-white",
        outline:
          "border border-brand-500/40 text-brand-300 hover:bg-brand-500/10 hover:text-brand-200",
        destructive:
          "bg-red-500/90 text-white hover:bg-red-500",
        link: "text-brand-300 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-12 rounded-xl px-7 text-sm",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(
  ({ className, variant, size, ...props }, ref) => (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  )
)
Button.displayName = "Button"

export { Button, buttonVariants }
