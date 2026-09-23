export default function CrmLoading() {
  return <div className="mx-auto max-w-7xl animate-pulse space-y-6"><div className="h-20 rounded-2xl bg-white" /><div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-24 rounded-2xl bg-white" />)}</div><div className="h-96 rounded-2xl bg-white" /></div>;
}
