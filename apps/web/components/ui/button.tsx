import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary-700 text-white hover:bg-primary-800 active:bg-primary-900 shadow-sm",
        accent: "bg-accent-500 text-white hover:bg-accent-600 active:bg-accent-700 shadow-accent",
        destructive: "bg-danger-500 text-white hover:bg-danger-700",
        outline: "border border-ink-200 bg-white text-ink-900 hover:bg-ink-100 dark:bg-ink-900 dark:border-ink-300 dark:text-ink-50 dark:hover:bg-ink-800",
        secondary: "bg-ink-100 text-ink-900 hover:bg-ink-200 dark:bg-ink-800 dark:text-ink-50 dark:hover:bg-ink-700",
        ghost: "hover:bg-ink-100 text-ink-900 dark:text-ink-50 dark:hover:bg-ink-800",
        link: "text-primary-700 underline-offset-4 hover:underline dark:text-primary-500",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-12 px-6 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
