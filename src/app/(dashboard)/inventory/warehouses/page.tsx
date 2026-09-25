import Link from "next/link";
import { ArrowLeft, Warehouse } from "lucide-react";
import { getInventoryReferenceData } from "@/modules/inventory/repository";
import { WarehouseManager } from "@/modules/inventory/warehouse-manager";
import { getOrganizationContext } from "@/modules/organizations/repository";

export default async function WarehousesPage() { const [reference, context] = await Promise.all([getInventoryReferenceData(), getOrganizationContext()]); if (!context) return null; return <div className="mx-auto max-w-7xl space-y-6"><Link href="/inventory" className="inline-flex items-center gap-2 text-sm font-medium text-[var(--muted)]"><ArrowLeft className="size-4" />К складу</Link><div className="flex items-start gap-4"><div className="grid size-12 place-items-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)]"><Warehouse className="size-6" /></div><div><p className="text-sm font-semibold text-[var(--brand)]">Структура хранения</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">Склады</h1><p className="mt-2 text-sm text-[var(--muted)]">Отдельные остатки материалов по филиалам.</p></div></div><WarehouseManager warehouses={reference.warehouses} branches={reference.branches} canManage={context.can("inventory.manage")} /></div>; }
