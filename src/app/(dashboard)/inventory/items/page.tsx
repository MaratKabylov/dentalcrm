import Link from "next/link";
import { ArrowLeft, Boxes } from "lucide-react";
import { InventoryItemsManager } from "@/modules/inventory/inventory-items-manager";
import { getInventoryReferenceData } from "@/modules/inventory/repository";
import { getOrganizationContext } from "@/modules/organizations/repository";

export default async function InventoryItemsPage() { const [reference, context] = await Promise.all([getInventoryReferenceData(), getOrganizationContext()]); if (!context) return null; return <div className="mx-auto max-w-7xl space-y-6"><Link href="/inventory" className="inline-flex items-center gap-2 text-sm font-medium text-[var(--muted)]"><ArrowLeft className="size-4" />К складу</Link><div className="flex items-start gap-4"><div className="grid size-12 place-items-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)]"><Boxes className="size-6" /></div><div><p className="text-sm font-semibold text-[var(--brand)]">Справочник</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">Материалы</h1><p className="mt-2 text-sm text-[var(--muted)]">Артикулы, единицы измерения и пороги низкого остатка.</p></div></div><InventoryItemsManager categories={reference.categories} items={reference.items} canManage={context.can("inventory.manage")} /></div>; }
