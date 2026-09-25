import Link from "next/link";
import { AlertTriangle, ArrowLeftRight, Boxes, CalendarClock, PackageCheck, Ruler, Warehouse } from "lucide-react";

import { Card } from "@/components/ui/card";
import { listInventoryBalances, listPendingProcedureMaterialUsage, listStockBatches } from "@/modules/inventory/repository";
import { getOrganizationContext } from "@/modules/organizations/repository";

export default async function InventoryPage() {
  const [balances, batches, pendingUsage, context] = await Promise.all([listInventoryBalances(), listStockBatches(), listPendingProcedureMaterialUsage(), getOrganizationContext()]);
  if (!context) return null;
  const today = new Date();
  const expiryLimit = new Date(today); expiryLimit.setDate(expiryLimit.getDate() + 30);
  const expiring = batches.filter((batch) => batch.expirationDate && new Date(`${batch.expirationDate}T00:00:00`) <= expiryLimit);
  const lowStock = balances.filter((balance) => balance.minStock > 0 && balance.quantity <= balance.minStock);
  const totalValue = balances.reduce((sum, balance) => sum + balance.stockValue, 0);
  const money = new Intl.NumberFormat("ru-KZ", { style: "currency", currency: context.organization.currency, maximumFractionDigits: 2 });
  const links = [
    { href: "/inventory/items", title: "Материалы", text: "Номенклатура, категории и минимальные остатки", icon: Boxes },
    { href: "/inventory/warehouses", title: "Склады", text: "Склады по филиалам клиники", icon: Warehouse },
    { href: "/inventory/movements", title: "Движения", text: "Поступления, выдачи, списания и перемещения", icon: ArrowLeftRight },
    { href: "/inventory/norms", title: "Нормы процедур", text: "Расход материалов на услуги", icon: Ruler },
    { href: "/inventory/usage", title: "Списания по процедурам", text: `${pendingUsage.length} предложений ожидают обработки`, icon: PackageCheck },
  ];
  return <div className="mx-auto max-w-7xl space-y-6"><div><p className="text-sm font-semibold text-[var(--brand)]">Фаза 6</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">Склад и материалы</h1><p className="mt-2 text-sm text-[var(--muted)]">Партионный учёт, сроки годности и неизменяемый журнал движений.</p></div><div className="grid gap-4 md:grid-cols-3"><Card className="p-5"><Boxes className="size-6 text-[var(--brand)]" /><p className="mt-4 text-2xl font-semibold">{money.format(totalValue)}</p><p className="mt-1 text-sm text-[var(--muted)]">стоимость текущих остатков</p></Card><Card className="p-5"><AlertTriangle className="size-6 text-amber-700" /><p className="mt-4 text-2xl font-semibold">{lowStock.length}</p><p className="mt-1 text-sm text-[var(--muted)]">позиций ниже минимума</p></Card><Card className="p-5"><CalendarClock className="size-6 text-rose-700" /><p className="mt-4 text-2xl font-semibold">{expiring.length}</p><p className="mt-1 text-sm text-[var(--muted)]">партий истекают за 30 дней</p></Card></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{links.map(({ href, title, text, icon: Icon }) => <Link key={href} href={href} className="rounded-2xl border bg-white p-5 transition hover:border-[var(--brand)]"><Icon className="size-6 text-[var(--brand)]" /><h2 className="mt-4 font-semibold">{title}</h2><p className="mt-1 text-sm text-[var(--muted)]">{text}</p></Link>)}</div><div className="grid gap-5 lg:grid-cols-2"><Card className="overflow-hidden"><div className="border-b p-5"><h2 className="font-semibold">Низкие остатки</h2></div>{lowStock.length === 0 ? <p className="p-6 text-sm text-[var(--muted)]">Все позиции выше минимального уровня.</p> : <div className="divide-y">{lowStock.slice(0, 8).map((balance) => <div key={`${balance.warehouseId}:${balance.itemId}`} className="flex justify-between gap-4 p-4 text-sm"><div><p className="font-semibold">{balance.sku} — {balance.itemName}</p><p className="mt-1 text-xs text-[var(--muted)]">{balance.branchName} · {balance.warehouseName}</p></div><p className="text-right font-semibold text-amber-700">{balance.quantity} {balance.unit}<span className="block text-[10px] font-normal text-[var(--muted)]">минимум {balance.minStock}</span></p></div>)}</div>}</Card><Card className="overflow-hidden"><div className="border-b p-5"><h2 className="font-semibold">Сроки годности</h2></div>{expiring.length === 0 ? <p className="p-6 text-sm text-[var(--muted)]">В ближайшие 30 дней сроки не истекают.</p> : <div className="divide-y">{expiring.slice(0, 8).map((batch) => <div key={batch.id} className="flex justify-between gap-4 p-4 text-sm"><div><p className="font-semibold">{batch.sku} — {batch.itemName}</p><p className="mt-1 text-xs text-[var(--muted)]">{batch.warehouseName} · партия {batch.lotNumber ?? "без номера"}</p></div><p className="text-right font-semibold text-rose-700">{batch.expirationDate}<span className="block text-[10px] font-normal text-[var(--muted)]">{batch.availableQuantity} {batch.unit}</span></p></div>)}</div>}</Card></div></div>;
}
