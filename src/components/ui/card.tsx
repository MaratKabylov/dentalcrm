import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-2xl border bg-white shadow-[0_1px_2px_rgba(23,52,46,0.04)]", className)}
      {...props}
    />
  );
}
