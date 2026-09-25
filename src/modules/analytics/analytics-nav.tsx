import Link from "next/link";
import { Boxes, LayoutDashboard, Megaphone, Stethoscope, UsersRound } from "lucide-react";

const items = [
  { href: "/analytics", label: "Сводка", icon: LayoutDashboard },
  { href: "/analytics/doctors", label: "Врачи", icon: Stethoscope },
  { href: "/analytics/reception", label: "Регистратура", icon: UsersRound },
  { href: "/analytics/sources", label: "Источники", icon: Megaphone },
  { href: "/analytics/inventory", label: "Материалы", icon: Boxes },
];

export function AnalyticsNav() {
  return <nav className="flex flex-wrap gap-2">{items.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className="inline-flex h-9 items-center gap-2 rounded-xl border bg-white px-3 text-sm font-medium hover:border-[var(--brand)]"><Icon className="size-4 text-[var(--brand)]" />{label}</Link>)}</nav>;
}
