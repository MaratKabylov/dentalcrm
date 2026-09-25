"use client";

import { useActionState, useState } from "react";
import { LoaderCircle, Pencil, Plus, Power, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { initialFormState } from "@/modules/auth/types";
import { saveMarketingCampaign, setMarketingCampaignActive } from "@/modules/crm/actions";
import type { CrmOption, MarketingCampaign, PatientSource } from "@/modules/crm/types";

function FieldError({ errors }: { errors?: string[] }) {
  return errors?.[0] ? <span className="text-xs text-[var(--danger)]">{errors[0]}</span> : null;
}

function CampaignForm({
  campaign,
  sources,
  branches,
  today,
  currency,
  onCancel,
}: {
  campaign: MarketingCampaign | null;
  sources: PatientSource[];
  branches: CrmOption[];
  today: string;
  currency: string;
  onCancel: () => void;
}) {
  const [state, formAction, pending] = useActionState(saveMarketingCampaign, initialFormState);
  return (
    <Card className="p-5 lg:p-6">
      <form action={formAction} className="space-y-5">
        {campaign && <input type="hidden" name="campaignId" value={campaign.id} />}
        <input type="hidden" name="isActive" value={String(campaign?.isActive ?? true)} />
        <div className="flex items-start justify-between gap-3">
          <div><h2 className="font-semibold">{campaign ? "Изменить кампанию" : "Новая кампания"}</h2><p className="mt-1 text-xs text-[var(--muted)]">Бюджет используется для расчёта ROI.</p></div>
          {campaign && <Button type="button" variant="ghost" onClick={onCancel}>Отмена</Button>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 sm:col-span-2"><span className="text-sm font-medium">Название *</span><Input name="name" defaultValue={campaign?.name ?? ""} maxLength={160} required /><FieldError errors={state.fieldErrors?.name} /></label>
          <label className="space-y-2"><span className="text-sm font-medium">Код *</span><Input name="code" defaultValue={campaign?.code ?? ""} placeholder="implant_google_q4" maxLength={60} required /><FieldError errors={state.fieldErrors?.code} /></label>
          <label className="space-y-2"><span className="text-sm font-medium">Источник *</span><select name="sourceId" defaultValue={campaign?.sourceId ?? ""} className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm shadow-sm" required><option value="">Выберите</option>{sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</select><FieldError errors={state.fieldErrors?.sourceId} /></label>
          <label className="space-y-2"><span className="text-sm font-medium">Филиал</span><select name="branchId" defaultValue={campaign?.branchId ?? ""} className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm shadow-sm"><option value="">Все филиалы</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select><FieldError errors={state.fieldErrors?.branchId} /></label>
          <label className="space-y-2"><span className="text-sm font-medium">Бюджет, {currency}</span><Input name="budgetAmount" type="number" min="0" step="0.01" defaultValue={campaign?.budgetAmount ?? 0} required /><FieldError errors={state.fieldErrors?.budgetAmount} /></label>
          <label className="space-y-2"><span className="text-sm font-medium">Начало *</span><Input name="startsOn" type="date" defaultValue={campaign?.startsOn ?? today} required /><FieldError errors={state.fieldErrors?.startsOn} /></label>
          <label className="space-y-2"><span className="text-sm font-medium">Окончание</span><Input name="endsOn" type="date" defaultValue={campaign?.endsOn ?? ""} /><FieldError errors={state.fieldErrors?.endsOn} /></label>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="space-y-2"><span className="text-xs font-medium">utm_source</span><Input name="utmSource" defaultValue={campaign?.utmSource ?? ""} maxLength={120} /></label>
          <label className="space-y-2"><span className="text-xs font-medium">utm_medium</span><Input name="utmMedium" defaultValue={campaign?.utmMedium ?? ""} maxLength={120} /></label>
          <label className="space-y-2"><span className="text-xs font-medium">utm_campaign</span><Input name="utmCampaign" defaultValue={campaign?.utmCampaign ?? ""} maxLength={160} /></label>
        </div>
        {state.message && <div role="status" className={state.status === "error" ? "rounded-xl bg-red-50 px-4 py-3 text-sm text-[var(--danger)]" : "rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800"}>{state.message}</div>}
        <div className="flex justify-end"><Button disabled={pending}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}{pending ? "Сохранение…" : "Сохранить кампанию"}</Button></div>
      </form>
    </Card>
  );
}

export function MarketingCampaignManager({
  campaigns,
  sources,
  branches,
  today,
  currency,
}: {
  campaigns: MarketingCampaign[];
  sources: PatientSource[];
  branches: CrmOption[];
  today: string;
  currency: string;
}) {
  const [editing, setEditing] = useState<MarketingCampaign | null>(null);
  const [creating, setCreating] = useState(false);
  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b px-5 py-4"><div><h2 className="font-semibold">Кампании</h2><p className="mt-1 text-xs text-[var(--muted)]">{campaigns.length} кампаний в реестре.</p></div>{editing && <Button variant="secondary" onClick={() => { setEditing(null); setCreating(true); }}><Plus className="size-4" />Новая</Button>}</div>
        {campaigns.length === 0 ? <div className="grid min-h-52 place-items-center p-8 text-center"><div><h3 className="font-semibold">Кампаний пока нет</h3><p className="mt-1 text-sm text-[var(--muted)]">Добавьте первую рекламную кампанию и укажите бюджет.</p></div></div> : <div className="divide-y">{campaigns.map((campaign) => (
          <div key={campaign.id} className={campaign.isActive ? "p-5" : "bg-[var(--surface-muted)] p-5 opacity-65"}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{campaign.name}</p>{!campaign.isActive && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold">Выключена</span>}</div><p className="mt-1 text-sm text-[var(--muted)]"><span className="mr-2 inline-block size-2 rounded-full" style={{ backgroundColor: campaign.sourceColor }} />{campaign.sourceName} · {campaign.branchName ?? "Все филиалы"}</p><p className="mt-2 text-xs text-[var(--muted)]">{campaign.startsOn} — {campaign.endsOn ?? "без даты окончания"} · {campaign.budgetAmount.toLocaleString("ru-KZ")} {currency}</p></div>
              <div className="flex shrink-0 gap-1"><button type="button" onClick={() => { setEditing(campaign); setCreating(false); }} className="grid size-9 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-muted)]" aria-label={`Изменить кампанию ${campaign.name}`}><Pencil className="size-4" /></button><form action={setMarketingCampaignActive}><input type="hidden" name="campaignId" value={campaign.id} /><input type="hidden" name="isActive" value={campaign.isActive ? "false" : "true"} /><button className="grid size-9 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-muted)]" aria-label={campaign.isActive ? `Выключить кампанию ${campaign.name}` : `Включить кампанию ${campaign.name}`}><Power className="size-4" /></button></form></div>
            </div>
          </div>
        ))}</div>}
      </Card>
      <div>{!creating && !editing ? <Button onClick={() => setCreating(true)} className="w-full"><Plus className="size-4" />Добавить кампанию</Button> : <CampaignForm key={editing?.id ?? "new"} campaign={editing} sources={sources} branches={branches} today={today} currency={currency} onCancel={() => { setEditing(null); setCreating(false); }} />}</div>
    </div>
  );
}
