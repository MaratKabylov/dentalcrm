import { Card } from "@/components/ui/card";

export default function ClinicalLoading() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse space-y-6">
      <div className="h-24 rounded-2xl bg-[var(--surface-muted)]" />
      <div className="grid gap-4 sm:grid-cols-2"><Card className="h-28" /><Card className="h-28" /></div>
      <Card className="h-80" />
    </div>
  );
}
