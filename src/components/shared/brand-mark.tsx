import { Cross } from "lucide-react";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid size-10 place-items-center rounded-[14px] bg-[var(--brand)] text-white shadow-sm">
        <Cross className="size-5" strokeWidth={2.5} />
      </div>
      {!compact && (
        <div>
          <div className="text-[15px] font-bold tracking-[-0.02em]">Dental OS</div>
          <div className="text-[11px] font-medium text-[var(--muted)]">Clinic workspace</div>
        </div>
      )}
    </div>
  );
}
