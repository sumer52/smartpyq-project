import * as React from "react"
import { cva } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * shadcn/ui Button — SmartPYQ theme.
 *
 * Variant tokens map onto the existing design system:
 *   default     → solid accent primary (btn-primary equivalent)
 *   secondary   → white surface with hairline border (btn-secondary equivalent)
 *   ghost       → transparent, hover surface only
 *   outline     → hairline border, accent on hover
 *   destructive → error-500 surface for destructive confirmations
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAF9F5] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-brand-500 text-white hover:bg-brand-600",
        secondary:
          "bg-white border border-line text-primary hover:bg-muted-100 hover:border-muted-300",
        ghost: "text-secondary hover:bg-muted-100 hover:text-primary",
        outline:
          "border border-brand-500/40 text-brand-600 hover:bg-brand-50 hover:text-brand-700",
        destructive:
          "bg-error-500 text-white hover:bg-error-600",
        link: "text-brand-600 underline-offset-4 hover:underline",
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
