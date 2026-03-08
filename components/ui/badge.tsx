import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-mono font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-white/10 text-white",
        emergency:
          "border-emergency/30 bg-emergency/10 text-emergency",
        civic: "border-civic/30 bg-civic/10 text-civic",
        field: "border-field/30 bg-field/10 text-field",
        dispatch: "border-dispatch/30 bg-dispatch/10 text-dispatch",
        ai: "border-ai/30 bg-ai/10 text-ai",
        outline: "text-white/70 border-white/20",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
