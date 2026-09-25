"use client";

import { useActionState, useMemo, useState } from "react";
import { ChevronDown, LoaderCircle, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialFormState } from "@/modules/auth/types";
import { saveLead } from "@/modules/crm/actions";
import type {
  CrmAssignee,
  CrmOption,
  LeadAttribution,
  LeadListItem,
  MarketingCampaign,
  PatientSource,
} from "@/modules/crm/types";

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.[0]) return null;
  return <span className="text-xs text-[var(--danger)]">{errors[0]}</span>;
}

export function LeadForm({
  lead,
  attribution,
  sources,
  campaigns,
  branches,
  assignees,
}: {
  lead?: LeadListItem;
  attribution?: LeadAttribution | null;
  sources: PatientSource[];
  campaigns: MarketingCampaign[];
  branches: CrmOption[];
  assignees: CrmAssignee[];
}) {
  const [state, formAction, pending] = useActionState(saveLead, initialFormState);
  const [sourceId, setSourceId] = useState(lead?.sourceId ?? "");
  const [branchId, setBranchId] = useState(lead?.branchId ?? "");
  const [campaignId, setCampaignId] = useState(attribution?.campaignId ?? "");
  const matchingCampaigns = useMemo(
    () => campaigns.filter((campaign) => (
      (!sourceId || campaign.sourceId === sourceId)
      && (!campaign.branchId || campaign.branchId === branchId)
    )),
    [branchId, campaigns, sourceId],
  );

  return (
    <form action={formAction} className="space-y-6">
      {lead && <input type="hidden" name="leadId" value={lead.id} />}
      <div className="grid gap-5 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm font-medium">Имя лида *</span>
          <Input name="fullName" defaultValue={lead?.fullName ?? ""} autoComplete="name" maxLength={200} required />
          <FieldError errors={state.fieldErrors?.fullName} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">Телефон *</span>
          <Input name="phone" defaultValue={lead?.phone ?? ""} type="tel" autoComplete="tel" placeholder="+7 700 000 00 00" required />
          <FieldError errors={state.fieldErrors?.phone} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">Email</span>
          <Input name="email" defaultValue={lead?.email ?? ""} type="email" autoComplete="email" maxLength={254} />
          <FieldError errors={state.fieldErrors?.email} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">Источник</span>
          <select
            name="sourceId"
            value={sourceId}
            onChange={(event) => {
              const nextSourceId = event.target.value;
              setSourceId(nextSourceId);
              if (!campaigns.some((campaign) => campaign.id === campaignId && campaign.sourceId === nextSourceId)) {
                setCampaignId("");
              }
            }}
            className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm shadow-sm"
          >
            <option value="">Неизвестно</option>
            {sources.map((source) => <option key={source.id} value={source.id}>{source.name}{source.isActive ? "" : " (неактивен)"}</option>)}
          </select>
          <FieldError errors={state.fieldErrors?.sourceId} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">Кампания</span>
          <select name="campaignId" value={campaignId} onChange={(event) => setCampaignId(event.target.value)} className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm shadow-sm">
            <option value="">Без кампании</option>
            {matchingCampaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}{campaign.isActive ? "" : " (завершена)"}</option>)}
          </select>
          <FieldError errors={state.fieldErrors?.campaignId} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">Филиал</span>
          <select
            name="branchId"
            value={branchId}
            onChange={(event) => {
              const nextBranchId = event.target.value;
              setBranchId(nextBranchId);
              const selectedCampaign = campaigns.find((campaign) => campaign.id === campaignId);
              if (selectedCampaign?.branchId && selectedCampaign.branchId !== nextBranchId) setCampaignId("");
            }}
            className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm shadow-sm"
          >
            <option value="">Не выбран</option>
            {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
          <FieldError errors={state.fieldErrors?.branchId} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">Ответственный</span>
          <select name="assignedTo" defaultValue={lead?.assignedTo ?? ""} className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm shadow-sm">
            <option value="">Не назначен</option>
            {assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.fullName}</option>)}
          </select>
          <FieldError errors={state.fieldErrors?.assignedTo} />
        </label>
      </div>

      <details className="group rounded-xl border bg-[var(--surface-muted)] p-4" open={Boolean(attribution?.utmSource || attribution?.utmMedium || attribution?.utmCampaign || attribution?.utmContent || attribution?.utmTerm || attribution?.landingPage)}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold">
          UTM и посадочная страница
          <ChevronDown className="size-4 transition group-open:rotate-180" />
        </summary>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="space-y-2"><span className="text-xs font-medium">utm_source</span><Input name="utmSource" defaultValue={attribution?.utmSource ?? ""} maxLength={120} /><FieldError errors={state.fieldErrors?.utmSource} /></label>
          <label className="space-y-2"><span className="text-xs font-medium">utm_medium</span><Input name="utmMedium" defaultValue={attribution?.utmMedium ?? ""} maxLength={120} /><FieldError errors={state.fieldErrors?.utmMedium} /></label>
          <label className="space-y-2"><span className="text-xs font-medium">utm_campaign</span><Input name="utmCampaign" defaultValue={attribution?.utmCampaign ?? ""} maxLength={160} /><FieldError errors={state.fieldErrors?.utmCampaign} /></label>
          <label className="space-y-2"><span className="text-xs font-medium">utm_content</span><Input name="utmContent" defaultValue={attribution?.utmContent ?? ""} maxLength={160} /><FieldError errors={state.fieldErrors?.utmContent} /></label>
          <label className="space-y-2"><span className="text-xs font-medium">utm_term</span><Input name="utmTerm" defaultValue={attribution?.utmTerm ?? ""} maxLength={160} /><FieldError errors={state.fieldErrors?.utmTerm} /></label>
          <label className="space-y-2"><span className="text-xs font-medium">Посадочная страница</span><Input name="landingPage" type="url" defaultValue={attribution?.landingPage ?? ""} maxLength={500} placeholder="https://example.kz/implant" /><FieldError errors={state.fieldErrors?.landingPage} /></label>
        </div>
      </details>

      <label className="block space-y-2">
        <span className="text-sm font-medium">Комментарий</span>
        <textarea name="notes" defaultValue={lead?.notes ?? ""} rows={5} maxLength={5000} className="w-full rounded-xl border bg-white px-3.5 py-3 text-sm shadow-sm focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)]" />
        <FieldError errors={state.fieldErrors?.notes} />
      </label>

      {state.message && <div role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-[var(--danger)]">{state.message}</div>}

      <div className="flex justify-end">
        <Button className="min-w-44" disabled={pending}>
          {pending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
          {pending ? "Сохранение…" : lead ? "Сохранить изменения" : "Создать лид"}
        </Button>
      </div>
    </form>
  );
}
