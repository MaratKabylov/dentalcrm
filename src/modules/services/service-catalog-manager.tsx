"use client";

import { useActionState, useMemo, useState } from "react";
import { Clock3, LoaderCircle, Pencil, Plus, Power, Save, Tags } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialFormState } from "@/modules/auth/types";
import { saveService, saveServiceBranchOverride, saveServiceCategory, setServiceActive } from "@/modules/services/actions";
import type { BranchAccessSummary } from "@/modules/organizations/types";
import type { ServiceCategory, TreatmentService } from "@/modules/services/types";

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.[0]) return null;
  return <span className="text-xs text-[var(--danger)]">{errors[0]}</span>;
}

function categoryPath(category: ServiceCategory, categories: ServiceCategory[]) {
  const names = [category.name];
  let parentId = category.parentId;
  let guard = 0;
  while (parentId && guard < 20) {
    const parent = categories.find((item) => item.id === parentId);
    if (!parent) break;
    names.unshift(parent.name);
    parentId = parent.parentId;
    guard += 1;
  }
  return names.join(" / ");
}

function descendantsOf(categoryId: string, categories: ServiceCategory[]) {
  const descendants = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const category of categories) {
      if (category.parentId === categoryId || (category.parentId && descendants.has(category.parentId))) {
        if (!descendants.has(category.id)) {
          descendants.add(category.id);
          changed = true;
        }
      }
    }
  }
  return descendants;
}

function CategoryForm({
  category,
  categories,
  onCancel,
}: {
  category: ServiceCategory | null;
  categories: ServiceCategory[];
  onCancel: () => void;
}) {
  const [state, formAction, pending] = useActionState(saveServiceCategory, initialFormState);
  const unavailableParents = category ? descendantsOf(category.id, categories) : new Set<string>();
  if (category) unavailableParents.add(category.id);

  return (
    <form action={formAction} className="space-y-4 rounded-2xl bg-[var(--surface-muted)] p-4">
      {category && <input type="hidden" name="categoryId" value={category.id} />}
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">{category ? "Изменить категорию" : "Новая категория"}</h3>
        {category && <button type="button" onClick={onCancel} className="text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)]">Отмена</button>}
      </div>
      <label className="block space-y-2">
        <span className="text-sm font-medium">Название</span>
        <Input name="name" defaultValue={category?.name ?? ""} maxLength={160} required />
        <FieldError errors={state.fieldErrors?.name} />
      </label>
      <label className="block space-y-2">
        <span className="text-sm font-medium">Родительская категория</span>
        <select name="parentId" defaultValue={category?.parentId ?? ""} className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm">
          <option value="">Корневая категория</option>
          {categories.filter((item) => !unavailableParents.has(item.id)).map((item) => <option key={item.id} value={item.id}>{categoryPath(item, categories)}</option>)}
        </select>
      </label>
      <label className="block space-y-2">
        <span className="text-sm font-medium">Порядок сортировки</span>
        <Input name="sortOrder" type="number" min={0} max={10000} defaultValue={category?.sortOrder ?? 100} required />
      </label>
      {state.message && <div role="status" className={state.status === "success" ? "rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800" : "rounded-xl bg-red-50 px-3 py-2 text-xs text-[var(--danger)]"}>{state.message}</div>}
      <Button disabled={pending} className="w-full">{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}{pending ? "Сохранение…" : "Сохранить категорию"}</Button>
    </form>
  );
}

function ServiceForm({
  service,
  categories,
  branches,
  onCancel,
}: {
  service: TreatmentService | null;
  categories: ServiceCategory[];
  branches: BranchAccessSummary[];
  onCancel: () => void;
}) {
  const [state, formAction, pending] = useActionState(saveService, initialFormState);
  const [scope, setScope] = useState<"organization" | "branch">(service?.scope ?? "organization");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={formAction} className="space-y-5 rounded-2xl bg-[var(--surface-muted)] p-4 sm:p-5">
      {service && <input type="hidden" name="serviceId" value={service.id} />}
      {service && <input type="hidden" name="scope" value={service.scope} />}
      {service?.branchId && <input type="hidden" name="branchId" value={service.branchId} />}
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">{service ? "Изменить услугу" : "Новая услуга"}</h3>
        {service && <button type="button" onClick={onCancel} className="text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)]">Отмена</button>}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm font-medium">Область действия *</span>
          <select name={service ? undefined : "scope"} value={scope} onChange={(event) => setScope(event.target.value as "organization" | "branch")} disabled={Boolean(service)} className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm">
            <option value="organization">Вся сеть</option><option value="branch">Один филиал</option>
          </select>
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">Филиал</span>
          <select name={service ? undefined : "branchId"} defaultValue={service?.branchId ?? ""} disabled={scope !== "branch" || Boolean(service)} className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm disabled:bg-slate-100">
            <option value="">Выберите филиал</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
          <FieldError errors={state.fieldErrors?.branchId} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">Категория *</span>
          <select name="categoryId" defaultValue={service?.categoryId ?? ""} className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm" required>
            <option value="" disabled>Выберите категорию</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{categoryPath(category, categories)}</option>)}
          </select>
          <FieldError errors={state.fieldErrors?.categoryId} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">Код *</span>
          <Input name="code" defaultValue={service?.code ?? ""} maxLength={40} placeholder="THERAPY-001" required />
          <FieldError errors={state.fieldErrors?.code} />
        </label>
        <label className="space-y-2 md:col-span-2">
          <span className="text-sm font-medium">Название *</span>
          <Input name="name" defaultValue={service?.name ?? ""} maxLength={240} required />
          <FieldError errors={state.fieldErrors?.name} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">Длительность, минут</span>
          <Input name="durationMinutes" type="number" min={5} max={1440} step={5} defaultValue={service?.durationMinutes ?? 30} required />
          <FieldError errors={state.fieldErrors?.durationMinutes} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">{scope === "organization" ? "Сетевая цена" : "Цена филиала"}</span>
          <Input name="basePrice" type="number" min={0} step="0.01" defaultValue={service?.basePrice ?? 0} required />
          <FieldError errors={state.fieldErrors?.basePrice} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">Цена действует с</span>
          <Input name="priceValidFrom" type="date" defaultValue={today} required />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">Себестоимость</span>
          <Input name="costPrice" type="number" min={0} step="0.01" defaultValue={service?.costPrice ?? ""} />
          <FieldError errors={state.fieldErrors?.costPrice} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">НДС, %</span>
          <Input name="vatRate" type="number" min={0} max={100} step="0.01" defaultValue={service?.vatRate ?? ""} />
          <FieldError errors={state.fieldErrors?.vatRate} />
        </label>
      </div>
      {state.message && <div role="status" className={state.status === "success" ? "rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800" : "rounded-xl bg-red-50 px-4 py-3 text-sm text-[var(--danger)]"}>{state.message}</div>}
      <div className="flex justify-end"><Button disabled={pending}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}{pending ? "Сохранение…" : "Сохранить услугу"}</Button></div>
    </form>
  );
}

function BranchOverrideForm({ service, branches }: { service: TreatmentService; branches: BranchAccessSummary[] }) {
  const [state, action, pending] = useActionState(saveServiceBranchOverride, initialFormState);
  const today = new Date().toISOString().slice(0, 10);
  return <details className="mt-3 rounded-xl bg-[var(--surface-muted)] p-3"><summary className="cursor-pointer text-xs font-semibold text-[var(--brand-dark)]">Настроить для филиала</summary><form action={action} className="mt-3 grid gap-3 sm:grid-cols-2"><input type="hidden" name="serviceId" value={service.id} /><label className="space-y-1"><span className="text-xs text-[var(--muted)]">Филиал</span><select name="branchId" className="h-10 w-full rounded-xl border bg-white px-3 text-sm" required><option value="">Выберите филиал</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label><label className="flex items-end gap-2 pb-2 text-sm"><input name="isAvailable" type="checkbox" defaultChecked />Доступна</label><label className="space-y-1"><span className="text-xs text-[var(--muted)]">Длительность, если отличается</span><Input name="durationMinutes" type="number" min={5} max={1440} step={5} /></label><label className="space-y-1"><span className="text-xs text-[var(--muted)]">Цена, если отличается</span><Input name="price" type="number" min={0} step="0.01" /></label><label className="space-y-1"><span className="text-xs text-[var(--muted)]">Цена действует с</span><Input name="priceValidFrom" type="date" defaultValue={today} required /></label><div className="flex items-end"><Button disabled={pending} variant="secondary">{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}Сохранить для филиала</Button></div></form>{state.message && <p className={state.status === "error" ? "mt-2 text-xs text-[var(--danger)]" : "mt-2 text-xs text-emerald-700"}>{state.message}</p>}</details>;
}

export function ServiceCatalogManager({
  categories,
  services,
  canManageGlobal,
  canManageBranch,
  branches,
  currency,
}: {
  categories: ServiceCategory[];
  services: TreatmentService[];
  canManageGlobal: boolean;
  canManageBranch: boolean;
  branches: BranchAccessSummary[];
  currency: string;
}) {
  const [editingCategory, setEditingCategory] = useState<ServiceCategory | null>(null);
  const [editingService, setEditingService] = useState<TreatmentService | null>(null);
  const money = useMemo(() => new Intl.NumberFormat("ru-KZ", { style: "currency", currency, maximumFractionDigits: 2 }), [currency]);

  return (
    <div className="grid gap-6 xl:grid-cols-[0.75fr_1.25fr]">
      <div className="space-y-5">
        <div className="rounded-2xl border bg-white p-5">
          <div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold">Категории</h2><p className="mt-1 text-xs text-[var(--muted)]">Иерархия направлений лечения.</p></div><Tags className="size-5 text-[var(--brand)]" /></div>
          <div className="mt-4 space-y-2">
            {categories.length === 0 ? <p className="rounded-xl bg-[var(--surface-muted)] p-4 text-sm text-[var(--muted)]">Категорий пока нет.</p> : categories.map((category) => (
              <div key={category.id} className="flex items-center gap-3 rounded-xl border px-3 py-2.5">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{categoryPath(category, categories)}</span>
                {canManageGlobal && <button type="button" onClick={() => setEditingCategory(category)} className="grid size-8 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-muted)]" aria-label={`Изменить категорию ${category.name}`}><Pencil className="size-3.5" /></button>}
              </div>
            ))}
          </div>
        </div>
        {canManageGlobal && <CategoryForm key={editingCategory?.id ?? "new-category"} category={editingCategory} categories={categories} onCancel={() => setEditingCategory(null)} />}
      </div>

      <div className="space-y-5">
        <div className="rounded-2xl border bg-white p-5">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div><h2 className="font-semibold">Услуги</h2><p className="mt-1 text-xs text-[var(--muted)]">{services.length} позиций в каталоге.</p></div>
            {(canManageGlobal || canManageBranch) && editingService && <Button variant="secondary" onClick={() => setEditingService(null)}><Plus className="size-4" />Новая услуга</Button>}
          </div>
          <div className="mt-4 space-y-3">
            {services.length === 0 ? <p className="rounded-xl bg-[var(--surface-muted)] p-6 text-center text-sm text-[var(--muted)]">Добавьте первую категорию и услугу.</p> : services.map((service) => {
              const category = categories.find((item) => item.id === service.categoryId);
              return (
                <div key={service.id} className={service.isActive ? "rounded-xl border p-4" : "rounded-xl border bg-[var(--surface-muted)] p-4 opacity-70"}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><span className="rounded-md bg-[var(--surface-muted)] px-2 py-0.5 text-[10px] font-bold">{service.code}</span><p className="font-semibold">{service.name}</p><span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">{service.scope === "organization" ? "Вся сеть" : service.branchName}</span>{!service.isActive && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold">Неактивна</span>}</div>
                      <p className="mt-1 text-xs text-[var(--muted)]">{category ? categoryPath(category, categories) : "Без категории"}</p>
                      <div className="mt-3 flex flex-wrap gap-3 text-xs"><span className="font-semibold text-[var(--brand-dark)]">{money.format(service.basePrice)}</span><span className="text-[var(--muted)]">{service.priceSource === "branch" ? "Цена филиала" : "Сетевая цена"}</span><span className="inline-flex items-center gap-1 text-[var(--muted)]"><Clock3 className="size-3.5" />{service.durationMinutes} мин.</span>{service.vatRate !== null && <span className="text-[var(--muted)]">НДС {service.vatRate}%</span>}</div>
                      {service.scope === "organization" && canManageBranch && <BranchOverrideForm service={service} branches={branches} />}
                    </div>
                    {((service.scope === "organization" && canManageGlobal) || (service.scope === "branch" && canManageBranch)) && <div className="flex gap-1"><button type="button" onClick={() => setEditingService(service)} className="grid size-9 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-muted)]" aria-label={`Изменить услугу ${service.name}`}><Pencil className="size-4" /></button><form action={setServiceActive}><input type="hidden" name="serviceId" value={service.id} /><input type="hidden" name="isActive" value={service.isActive ? "false" : "true"} /><input type="hidden" name="scope" value={service.scope} />{service.branchId && <input type="hidden" name="branchId" value={service.branchId} />}<button className="grid size-9 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-muted)]" aria-label={service.isActive ? `Отключить услугу ${service.name}` : `Включить услугу ${service.name}`}><Power className="size-4" /></button></form></div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {(canManageGlobal || canManageBranch) && <ServiceForm key={editingService?.id ?? "new-service"} service={editingService} categories={categories} branches={branches} onCancel={() => setEditingService(null)} />}
      </div>
    </div>
  );
}
