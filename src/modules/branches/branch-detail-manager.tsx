"use client";

import { useActionState } from "react";
import { Archive, Building2, CheckCircle2, Clock3, DoorOpen, LoaderCircle, RotateCcw, Save, ShieldCheck, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { initialFormState } from "@/modules/auth/types";
import { saveBranchRoom, saveBranchWorkingHours, setBranchActive, updateMemberBranchAccess, updateMemberBranchScope } from "@/modules/branches/actions";
import { BranchForm } from "@/modules/branches/branch-form";
import type { BranchManagementDetail, BranchMemberAccess, BranchRoom } from "@/modules/branches/types";

const weekdays = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];

function StateMessage({ state }: { state: { status: string; message?: string } }) {
  if (!state.message) return null;
  return <p role={state.status === "error" ? "alert" : "status"} className={state.status === "error" ? "mt-3 text-xs text-[var(--danger)]" : "mt-3 text-xs text-emerald-700"}>{state.message}</p>;
}

function BranchStatus({ branchId, isActive }: { branchId: string; isActive: boolean }) {
  const [state, action, pending] = useActionState(setBranchActive, initialFormState);
  return <div><form action={action}><input type="hidden" name="branchId" value={branchId} /><input type="hidden" name="isActive" value={isActive ? "false" : "true"} /><Button variant="secondary" disabled={pending} className={isActive ? "text-[var(--danger)]" : "text-emerald-700"}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : isActive ? <Archive className="size-4" /> : <RotateCcw className="size-4" />}{isActive ? "Архивировать филиал" : "Восстановить филиал"}</Button></form><StateMessage state={state} /></div>;
}

function WorkingHours({ detail }: { detail: BranchManagementDetail }) {
  const [state, action, pending] = useActionState(saveBranchWorkingHours, initialFormState);
  const byDay = new Map(detail.workingHours.map((item) => [item.weekday, item]));
  return <Card className="p-5 sm:p-6"><div className="flex items-start gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)]"><Clock3 className="size-5" /></div><div><h2 className="font-semibold">Часы работы</h2><p className="mt-1 text-sm text-[var(--muted)]">Базовый график самого филиала.</p></div></div><form action={action} className="mt-5 space-y-3"><input type="hidden" name="branchId" value={detail.branch.id} />{weekdays.map((label, index) => { const weekday = index + 1; const value = byDay.get(weekday); return <div key={weekday} className="grid gap-3 rounded-xl bg-[var(--surface-muted)] p-3 sm:grid-cols-[minmax(150px,1fr)_110px_130px_130px] sm:items-center"><span className="text-sm font-medium">{label}</span><label className="flex items-center gap-2 text-sm"><input name={`working-${weekday}`} type="checkbox" defaultChecked={value?.isWorking ?? weekday <= 5} />Рабочий</label><Input name={`start-${weekday}`} type="time" defaultValue={value?.startTime ?? "09:00"} aria-label={`Начало, ${label}`} /><Input name={`end-${weekday}`} type="time" defaultValue={value?.endTime ?? "18:00"} aria-label={`Конец, ${label}`} /></div>; })}<div className="flex justify-end"><Button disabled={pending}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}Сохранить график</Button></div></form><StateMessage state={state} /></Card>;
}

function RoomEditor({ branchId, room }: { branchId: string; room?: BranchRoom }) {
  const [state, action, pending] = useActionState(saveBranchRoom, initialFormState);
  return <form action={action} className="rounded-xl border p-3"><input type="hidden" name="branchId" value={branchId} />{room && <input type="hidden" name="roomId" value={room.id} />}<input type="hidden" name="isActive" value={room?.isActive === false ? "false" : "true"} /><div className="flex gap-2"><Input name="name" defaultValue={room?.name ?? ""} placeholder="Название кабинета" maxLength={100} required /><Button variant="secondary" disabled={pending} className="shrink-0 px-3" aria-label="Сохранить кабинет">{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}</Button></div>{room && <button name="isActive" value={room.isActive ? "false" : "true"} className="mt-2 text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)]">{room.isActive ? "Перевести в архив" : "Восстановить"}</button>}<StateMessage state={state} /></form>;
}

function Rooms({ detail }: { detail: BranchManagementDetail }) {
  if (!detail.canManageRooms) return null;
  return <Card className="p-5 sm:p-6"><div className="flex items-start gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-700"><DoorOpen className="size-5" /></div><div><h2 className="font-semibold">Кабинеты</h2><p className="mt-1 text-sm text-[var(--muted)]">Кабинеты доступны только внутри этого филиала.</p></div></div><div className="mt-5 grid gap-3 md:grid-cols-2">{detail.rooms.map((room) => <RoomEditor key={room.id} branchId={detail.branch.id} room={room} />)}<RoomEditor branchId={detail.branch.id} /></div></Card>;
}

function MemberAccessRow({ branchId, member, canManageAll }: { branchId: string; member: BranchMemberAccess; canManageAll: boolean }) {
  const [state, action, pending] = useActionState(updateMemberBranchAccess, initialFormState);
  const [scopeState, scopeAction, scopePending] = useActionState(updateMemberBranchScope, initialFormState);
  return <div className="border-b py-4 last:border-b-0"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div className="flex min-w-0 items-center gap-3"><div className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--surface-muted)]"><UserRound className="size-4" /></div><div className="min-w-0"><p className="truncate text-sm font-semibold">{member.fullName || member.email}</p><p className="truncate text-xs text-[var(--muted)]">{member.roleName ?? "Без роли"} · {member.email}</p></div></div><div className="flex flex-wrap items-center justify-end gap-2">{member.isPrimary && <span className="rounded-full bg-[var(--brand-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--brand-dark)]">Основной</span>}{member.hasAllBranchAccess ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="size-3.5" />Все филиалы</span> : <form action={action}><input type="hidden" name="branchId" value={branchId} /><input type="hidden" name="membershipId" value={member.membershipId} /><input type="hidden" name="grantAccess" value={member.hasBranchAccess ? "false" : "true"} /><Button variant="secondary" disabled={pending}>{member.hasBranchAccess ? "Отозвать" : "Выдать доступ"}</Button></form>}{canManageAll && <form action={scopeAction}><input type="hidden" name="branchId" value={branchId} /><input type="hidden" name="membershipId" value={member.membershipId} /><input type="hidden" name="allowAllBranches" value={member.hasAllBranchAccess ? "false" : "true"} /><Button variant="ghost" disabled={scopePending}>{member.hasAllBranchAccess ? "Только этот филиал" : "Все филиалы"}</Button></form>}</div></div><StateMessage state={state} /><StateMessage state={scopeState} /></div>;
}

function MemberAccess({ detail }: { detail: BranchManagementDetail }) {
  if (!detail.canManageAccess) return null;
  return <Card className="p-5 sm:p-6"><div className="flex items-start gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700"><ShieldCheck className="size-5" /></div><div><h2 className="font-semibold">Доступ к данным филиала</h2><p className="mt-1 text-sm text-[var(--muted)]">Роль сотрудника остаётся общей для всей организации.</p></div></div><div className="mt-4">{detail.members.map((member) => <MemberAccessRow key={member.membershipId} branchId={detail.branch.id} member={member} canManageAll={detail.canManageAllBranchAccess} />)}</div></Card>;
}

export function BranchDetailManager({ detail }: { detail: BranchManagementDetail }) {
  return <div className="space-y-6"><Card className="p-5 sm:p-7"><div className="mb-6 flex items-start gap-3"><div className="grid size-10 place-items-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)]"><Building2 className="size-5" /></div><div><h2 className="font-semibold">Основные данные</h2><p className="mt-1 text-sm text-[var(--muted)]">Контакты и часовой пояс филиала.</p></div></div><BranchForm branch={detail.branch} /></Card><WorkingHours detail={detail} /><Rooms detail={detail} /><MemberAccess detail={detail} /><Card className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center sm:p-6"><div><h2 className="font-semibold">Статус филиала</h2><p className="mt-1 text-sm text-[var(--muted)]">Архивный филиал сохраняет историю, но недоступен для новых операций.</p></div><BranchStatus branchId={detail.branch.id} isActive={detail.branch.isActive} /></Card></div>;
}
