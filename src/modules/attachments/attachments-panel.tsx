"use client";

import { useActionState } from "react";
import { Archive, Download, FileImage, FileText, LoaderCircle, Paperclip, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  archiveAttachment,
  downloadAttachment,
  uploadAttachment,
} from "@/modules/attachments/actions";
import { ALLOWED_ATTACHMENT_MIME_TYPES } from "@/modules/attachments/file-validation";
import type { AttachmentMediaType, PatientAttachment } from "@/modules/attachments/types";
import { initialFormState } from "@/modules/auth/types";

const mediaTypeLabels: Record<AttachmentMediaType, string> = {
  xray: "Рентген",
  photo: "Фото",
  scan: "Скан",
  ct: "КТ",
  document: "Документ",
  other: "Другое",
};

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.[0]) return null;
  return <span className="text-xs text-[var(--danger)]">{errors[0]}</span>;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(bytes / 1024 / 1024)} МБ`;
}

export function AttachmentsPanel({
  patientId,
  encounterId,
  attachments,
  editable,
  timeZone,
}: {
  patientId: string;
  encounterId?: string;
  attachments: PatientAttachment[];
  editable: boolean;
  timeZone: string;
}) {
  const [state, formAction, pending] = useActionState(uploadAttachment, initialFormState);
  const dateTime = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-semibold">Файлы и снимки</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          {encounterId ? "Материалы, прикреплённые к этому приёму." : "Медицинские изображения и документы пациента."}
        </p>
      </div>

      {attachments.length === 0 ? (
        <div className="rounded-xl bg-[var(--surface-muted)] px-4 py-6 text-center text-sm text-[var(--muted)]">
          Вложений пока нет.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {attachments.map((attachment) => (
            <div key={attachment.id} className="rounded-xl border p-4">
              <div className="flex items-start gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)]">
                  {attachment.mimeType === "application/pdf" ? <FileText className="size-5" /> : <FileImage className="size-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold" title={attachment.fileName}>{attachment.fileName}</p>
                  <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-[var(--muted)]">
                    <span>{mediaTypeLabels[attachment.mediaType]}</span>
                    <span>{formatFileSize(attachment.sizeBytes)}</span>
                    <span>{dateTime.format(new Date(attachment.createdAt))}</span>
                    {!encounterId && attachment.entityType === "encounter" && <span>Из врачебного приёма</span>}
                  </div>
                  {attachment.description && <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{attachment.description}</p>}
                </div>
                <form action={downloadAttachment}>
                  <input type="hidden" name="attachmentId" value={attachment.id} />
                  <button className="grid size-9 place-items-center rounded-lg text-[var(--brand)] hover:bg-[var(--brand-soft)]" aria-label={`Скачать ${attachment.fileName}`}><Download className="size-4" /></button>
                </form>
              </div>

              {editable && (
                <details className="mt-3 border-t pt-3">
                  <summary className="cursor-pointer text-xs font-medium text-[var(--danger)]">Архивировать вложение</summary>
                  <form action={archiveAttachment} className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <input type="hidden" name="attachmentId" value={attachment.id} />
                    <Input name="reason" minLength={3} maxLength={500} required placeholder="Причина архивирования" />
                    <Button type="submit" variant="secondary" className="shrink-0 text-[var(--danger)]"><Archive className="size-4" />В архив</Button>
                  </form>
                </details>
              )}
            </div>
          ))}
        </div>
      )}

      {editable && (
        <form action={formAction} className="space-y-5 rounded-2xl bg-[var(--surface-muted)] p-4 sm:p-5">
          <input type="hidden" name="patientId" value={patientId} />
          <input type="hidden" name="encounterId" value={encounterId ?? ""} />
          <div className="flex items-center gap-2">
            <Paperclip className="size-4 text-[var(--brand)]" />
            <h3 className="font-semibold">Добавить вложение</h3>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium">Тип материала</span>
              <select name="mediaType" defaultValue="document" className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm">
                {Object.entries(mediaTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <FieldError errors={state.fieldErrors?.mediaType} />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Файл *</span>
              <input
                name="file"
                type="file"
                accept={ALLOWED_ATTACHMENT_MIME_TYPES.join(",")}
                required
                className="block h-11 w-full rounded-xl border bg-white px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--brand-soft)] file:px-3 file:py-1 file:text-xs file:font-semibold file:text-[var(--brand-dark)]"
              />
              <p className="text-[11px] text-[var(--muted)]">JPEG, PNG, WebP, HEIC, TIFF или PDF · до 10 МБ</p>
              <FieldError errors={state.fieldErrors?.file} />
            </label>
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium">Описание</span>
              <textarea name="description" maxLength={1000} className="min-h-20 w-full resize-y rounded-xl border bg-white px-3.5 py-3 text-sm" placeholder="Например, прицельный снимок зуба 11 до лечения" />
              <FieldError errors={state.fieldErrors?.description} />
            </label>
          </div>

          {state.message && (
            <div role="status" className={state.status === "success"
              ? "rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
              : "rounded-xl bg-red-50 px-4 py-3 text-sm text-[var(--danger)]"}
            >
              {state.message}
            </div>
          )}

          <div className="flex justify-end">
            <Button disabled={pending}>
              {pending ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" />}
              {pending ? "Загрузка…" : "Загрузить файл"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
