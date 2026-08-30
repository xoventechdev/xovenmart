import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "bg-primary-100 text-primary-700 dark:bg-primary-800 dark:text-primary-100",
        accent: "bg-accent-500 text-white",
        outline: "border border-ink-300 text-ink-700",
        success: "bg-success-100 text-success-700 dark:bg-success-500/20",
        warning: "bg-warning-100 text-warning-700 dark:bg-warning-500/20",
        danger: "bg-danger-100 text-danger-700 dark:bg-danger-500/20",
        info: "bg-info-100 text-info-700 dark:bg-info-500/20",
        muted: "bg-ink-100 text-ink-700 dark:bg-ink-700 dark:text-ink-100",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
