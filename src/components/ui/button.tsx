import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
};

export function Button({ className, variant = "primary", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition disabled:pointer-events-none disabled:opacity-50",
        variant === "primary" &&
          "bg-[var(--brand)] text-white shadow-sm hover:bg-[var(--brand-dark)]",
        variant === "secondary" &&
          "border bg-white text-[var(--foreground)] hover:bg-[var(--surface-muted)]",
        variant === "ghost" && "text-[var(--muted)] hover:bg-[var(--surface-muted)]",
        className,
      )}
      {...props}
    />
  );
}
