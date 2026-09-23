export default function DebtsLoading() {
  return (
    <div className="mx-auto max-w-7xl animate-pulse space-y-6">
      <div className="h-5 w-44 rounded bg-[var(--surface-muted)]" />
      <div className="space-y-3"><div className="h-8 w-72 rounded bg-[var(--surface-muted)]" /><div className="h-4 w-full max-w-xl rounded bg-[var(--surface-muted)]" /></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-28 rounded-2xl bg-[var(--surface-muted)]" />)}</div>
      <div className="h-44 rounded-2xl bg-[var(--surface-muted)]" />
      <div className="h-20 rounded-2xl bg-[var(--surface-muted)]" />
      <div className="h-72 rounded-2xl bg-[var(--surface-muted)]" />
    </div>
  );
}
