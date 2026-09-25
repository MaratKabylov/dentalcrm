"use client";

import { useActionState } from "react";
import { CheckCircle2, Download, FileCheck2, FilePlus2, LoaderCircle, Printer, ShieldCheck, ShieldX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialFormState } from "@/modules/auth/types";
import { consentTypeLabels, documentTypeLabels } from "@/modules/documents/constants";
import { downloadGeneratedDocument, generatePatientDocument, revokePatientConsent, signPatientDocument, viewGeneratedDocument } from "@/modules/documents/actions";
import type { DocumentTemplate, GeneratedDocument, PatientConsent } from "@/modules/documents/types";

function formatDate(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(value));
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} Б`;
  return `${(value / 1024).toFixed(1)} КБ`;
}

function GenerateForm({ patientId, templates }: { patientId: string; templates: DocumentTemplate[] }) {
  const [state, action, pending] = useActionState(generatePatientDocument, initialFormState);
  return (
    <form action={action} className="rounded-2xl border bg-white p-5">
      <input type="hidden" name="patientId" value={patientId} />
      <div className="flex items-start gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)]"><FilePlus2 className="size-5" /></div><div><h2 className="font-semibold">Новый документ</h2><p className="mt-1 text-xs text-[var(--muted)]">PDF создаётся из текущей версии шаблона и сохраняется как неизменяемый снимок.</p></div></div>
      <label className="mt-4 block space-y-2"><span className="text-sm font-medium">Шаблон</span><select name="templateId" required defaultValue="" className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm shadow-sm"><option value="" disabled>Выберите шаблон</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>
      {state.message && <p role="status" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-[var(--danger)]">{state.message}</p>}
      <Button className="mt-4 w-full" disabled={pending || templates.length === 0}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <FilePlus2 className="size-4" />}{pending ? "Формирование…" : "Сформировать PDF"}</Button>
    </form>
  );
}

function SignForm({ document, patientName }: { document: GeneratedDocument; patientName: string }) {
  const [state, action, pending] = useActionState(signPatientDocument, initialFormState);
  return (
    <form action={action} className="mt-4 space-y-3 rounded-xl bg-[var(--surface-muted)] p-4">
      <input type="hidden" name="documentId" value={document.id} />
      <label className="block space-y-1.5"><span className="text-xs font-semibold">ФИО подписанта</span><Input name="signerName" defaultValue={patientName} maxLength={200} required /></label>
      <label className="flex items-start gap-2 text-xs leading-5"><input type="checkbox" name="confirmation" required className="mt-1" /><span>Пациент ознакомился с документом и подтвердил подписание. После этого снимок нельзя изменить.</span></label>
      {state.message && <p role="status" className={state.status === "success" ? "text-xs text-emerald-700" : "text-xs text-[var(--danger)]"}>{state.message}</p>}
      <Button className="w-full" disabled={pending}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <FileCheck2 className="size-4" />}{pending ? "Подписание…" : "Зафиксировать подписание"}</Button>
    </form>
  );
}

function RevokeForm({ consentId }: { consentId: string }) {
  const [state, action, pending] = useActionState(revokePatientConsent, initialFormState);
  return (
    <form action={action} className="mt-3 flex flex-col gap-2 sm:flex-row">
      <input type="hidden" name="consentId" value={consentId} />
      <Input name="reason" minLength={3} maxLength={500} required placeholder="Причина отзыва" className="h-9" />
      <Button variant="secondary" className="h-9 shrink-0" disabled={pending}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <ShieldX className="size-4" />}Отозвать</Button>
      {state.message && <span role="status" className={state.status === "success" ? "text-xs text-emerald-700 sm:self-center" : "text-xs text-[var(--danger)] sm:self-center"}>{state.message}</span>}
    </form>
  );
}

export function PatientDocumentsPanel({ patientId, patientName, templates, documents, consents, canManage, timeZone }: { patientId: string; patientName: string; templates: DocumentTemplate[]; documents: GeneratedDocument[]; consents: PatientConsent[]; canManage: boolean; timeZone: string }) {
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_0.52fr]">
      <section className="space-y-4">
        <div><h2 className="text-lg font-semibold">Документы</h2><p className="mt-1 text-sm text-[var(--muted)]">История PDF и подписанных снимков пациента.</p></div>
        {documents.length === 0 ? <div className="rounded-2xl border bg-white p-8 text-center"><FileCheck2 className="mx-auto size-9 text-[var(--brand)]" /><p className="mt-3 font-semibold">Документов пока нет</p><p className="mt-1 text-sm text-[var(--muted)]">Сформируйте документ из шаблона справа.</p></div> : documents.map((document) => (
          <article key={document.id} className="rounded-2xl border bg-white p-5">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{document.title}</h3><span className={document.status === "signed" ? "rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-800" : "rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-800"}>{document.status === "signed" ? "Подписан" : "Ожидает подписи"}</span></div><p className="mt-1 text-xs text-[var(--muted)]">{document.documentNumber} · {documentTypeLabels[document.documentType]} · {formatBytes(document.pdfSizeBytes)}</p><p className="mt-1 text-xs text-[var(--muted)]">Создан {formatDate(document.createdAt, timeZone)} · {document.createdByName}</p>{document.signedAt && <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-emerald-700"><CheckCircle2 className="size-3.5" />Подписал(а) {document.signedByName} · {formatDate(document.signedAt, timeZone)}</p>}</div>
              <div className="flex shrink-0 gap-2"><form action={viewGeneratedDocument}><input type="hidden" name="documentId" value={document.id} /><Button variant="secondary" className="h-9 px-3"><Printer className="size-4" />Открыть / печать</Button></form><form action={downloadGeneratedDocument}><input type="hidden" name="documentId" value={document.id} /><Button variant="secondary" className="h-9 px-3" aria-label={`Скачать ${document.title}`}><Download className="size-4" /></Button></form></div>
            </div>
            {canManage && document.status === "finalized" && <SignForm document={document} patientName={patientName} />}
          </article>
        ))}
      </section>
      <aside className="space-y-5">
        {canManage && <GenerateForm patientId={patientId} templates={templates} />}
        <div className="rounded-2xl border bg-white p-5">
          <div className="flex items-center gap-2"><ShieldCheck className="size-5 text-[var(--brand)]" /><h2 className="font-semibold">Согласия</h2></div>
          <p className="mt-1 text-xs text-[var(--muted)]">Согласие появляется только после фиксации подписи.</p>
          <div className="mt-4 space-y-3">
            {consents.length === 0 ? <p className="text-sm text-[var(--muted)]">Подписанных согласий пока нет.</p> : consents.map((consent) => <div key={consent.id} className="rounded-xl bg-[var(--surface-muted)] p-3"><div className="flex items-start justify-between gap-2"><div><p className="text-sm font-semibold">{consentTypeLabels[consent.consentType]}</p><p className="mt-1 text-xs text-[var(--muted)]">Версия {consent.version} · {formatDate(consent.grantedAt, timeZone)}</p></div><span className={consent.status === "granted" ? "rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold text-emerald-800" : "rounded-full bg-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-700"}>{consent.status === "granted" ? "Действует" : "Отозвано"}</span></div>{consent.revokedAt && <p className="mt-2 text-xs text-[var(--muted)]">Отозвано {formatDate(consent.revokedAt, timeZone)}{consent.revocationReason ? `: ${consent.revocationReason}` : ""}</p>}{canManage && consent.status === "granted" && <RevokeForm consentId={consent.id} />}</div>)}
          </div>
        </div>
      </aside>
    </div>
  );
}
