import type { InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-xl border bg-white px-3.5 text-sm text-[var(--foreground)] shadow-sm placeholder:text-[#8ba099] focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)]",
        className,
      )}
      {...props}
    />
  );
}
