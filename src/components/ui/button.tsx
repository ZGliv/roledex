import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-xl border border-transparent bg-clip-padding text-[13px] font-semibold whitespace-nowrap outline-none select-none transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:not-aria-[haspopup]:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 motion-reduce:transition-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_1px_2px_rgba(17,24,39,.12)] hover:bg-[color-mix(in_oklch,var(--primary),black_9%)]",
        outline:
          "border-border/80 bg-background/72 text-foreground shadow-[0_1px_1px_rgba(17,24,39,.04)] hover:border-border hover:bg-background aria-expanded:border-border aria-expanded:bg-background dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "border-border/45 bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_4%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "bg-transparent shadow-none hover:bg-muted/75 hover:text-foreground aria-expanded:bg-muted/75 aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "border-destructive/15 bg-destructive/10 text-destructive shadow-none hover:bg-destructive/16 focus-visible:ring-destructive/25 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "rounded-none text-primary shadow-none underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-11 gap-2 px-4 has-data-[icon=inline-end]:pr-3.5 has-data-[icon=inline-start]:pl-3.5",
        xs: "h-11 gap-1.5 px-2.5 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        sm: "h-11 gap-1.5 px-3 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-12 gap-2 px-5 text-sm",
        icon: "size-11 p-0",
        "icon-xs":
          "size-11 p-0 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm":
          "size-11 p-0 [&_svg:not([class*='size-'])]:size-4",
        "icon-lg": "size-12 p-0 [&_svg:not([class*='size-'])]:size-[1.125rem]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
