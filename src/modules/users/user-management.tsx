"use client";

import { useActionState, useMemo, useState } from "react";
import {
  Activity,
  Ban,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  MailPlus,
  MoreHorizontal,
  RotateCw,
  Search,
  Trash2,
  UserCheck,
  UsersRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  createInvitation,
  renewInvitation,
  revokeInvitation,
  updateMemberRole,
  updateMemberStatus,
} from "@/modules/users/actions";
import { InvitationLink } from "@/modules/users/invitation-link";
import type {
  OrganizationInvitation,
  OrganizationMember,
  OrganizationRole,
  UserManagementData,
} from "@/modules/users/types";

const initialState = { status: "idle" as const };

const actionLabels: Record<string, string> = {
  "invitation.created": "создал приглашение для",
  "invitation.revoked": "отменил приглашение для",
  "invitation.accepted": "принял приглашение:",
  "member.role_changed": "изменил роль пользователя",
  "member.suspended": "заблокировал пользователя",
  "member.activated": "восстановил доступ пользователю",
  "member.removed": "удалил из клиники пользователя",
};

function formatDate(value: string, includeTime = false) {
  return new Intl.DateTimeFormat("ru-RU", includeTime
    ? { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function initials(member: OrganizationMember) {
  const source = member.fullName.trim() || member.email;
  return source.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function StateMessage({ state }: { state: { status: string; message?: string } }) {
  if (!state.message) return null;
  return <p role={state.status === "error" ? "alert" : "status"} className={state.status === "error" ? "mt-2 text-xs text-[var(--danger)]" : "mt-2 text-xs text-emerald-700"}>{state.message}</p>;
}

function InviteForm({ roles }: { roles: OrganizationRole[] }) {
  const [state, action, pending] = useActionState(createInvitation, initialState);
  return (
    <Card className="p-5 lg:p-6">
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)]"><MailPlus className="size-5" /></div>
        <div><h2 className="font-semibold">Пригласить сотрудника</h2><p className="mt-1 text-sm text-[var(--muted)]">Ссылка действует 7 дней и привязана к указанному email.</p></div>
      </div>
      <form action={action} className="mt-5 grid gap-3 lg:grid-cols-[minmax(220px,1fr)_220px_auto]">
        <div>
          <Input name="email" type="email" autoComplete="email" placeholder="employee@clinic.kz" required />
          {state.fieldErrors?.email?.[0] && <p className="mt-1 text-xs text-[var(--danger)]">{state.fieldErrors.email[0]}</p>}
        </div>
        <select name="roleId" required defaultValue="" className="h-11 rounded-xl border bg-white px-3.5 text-sm shadow-sm">
          <option value="" disabled>Выберите роль</option>
          {roles.map((role) => <option key={role.roleId} value={role.roleId}>{role.name}</option>)}
        </select>
        <Button className="h-11" disabled={pending}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <MailPlus className="size-4" />}Создать приглашение</Button>
      </form>
      {state.message && <div className={state.status === "error" ? "mt-4 rounded-xl bg-red-50 p-3 text-sm text-[var(--danger)]" : "mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800"}>{state.message}</div>}
      {state.invitationUrl && <div className="mt-3"><InvitationLink value={state.invitationUrl} /></div>}
    </Card>
  );
}

function MemberRow({ member, roles, isCurrentUser, currentUserIsOwner }: { member: OrganizationMember; roles: OrganizationRole[]; isCurrentUser: boolean; currentUserIsOwner: boolean }) {
  const [roleState, roleAction, rolePending] = useActionState(updateMemberRole, initialState);
  const [statusState, statusAction, statusPending] = useActionState(updateMemberStatus, initialState);
  const pending = rolePending || statusPending;
  const canManageMember = member.roleCode !== "owner" || currentUserIsOwner;

  return (
    <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(220px,1.5fr)_190px_130px_150px_44px] lg:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--brand-soft)] text-sm font-semibold text-[var(--brand-dark)]">{initials(member)}</div>
        <div className="min-w-0"><p className="truncate font-semibold">{member.fullName || "Имя не указано"}{isCurrentUser && <span className="ml-2 text-xs font-normal text-[var(--muted)]">Вы</span>}</p><p className="mt-0.5 truncate text-xs text-[var(--muted)]">{member.email}</p></div>
      </div>
      <form action={roleAction} className="flex gap-2">
        <input type="hidden" name="membershipId" value={member.membershipId} />
        <select name="roleId" defaultValue={member.roleId ?? ""} aria-label={`Роль ${member.email}`} className="h-10 min-w-0 flex-1 rounded-xl border bg-white px-3 text-sm" disabled={pending || !canManageMember}>
          {!member.roleId && <option value="">Без роли</option>}
          {roles.map((role) => <option key={role.roleId} value={role.roleId}>{role.name}</option>)}
        </select>
        <Button variant="secondary" className="size-10 px-0" aria-label="Сохранить роль" disabled={pending || !member.roleId || !canManageMember}><CheckCircle2 className="size-4" /></Button>
      </form>
      <div><span className={member.status === "active" ? "inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700" : "inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800"}>{member.status === "active" ? "Активен" : "Заблокирован"}</span></div>
      <div className="text-xs text-[var(--muted)]"><p>{member.lastSignInAt ? formatDate(member.lastSignInAt, true) : "Ещё не входил"}</p><p className="mt-1">Добавлен {formatDate(member.joinedAt)}</p></div>
      <details className="relative justify-self-start lg:justify-self-end">
        <summary className="grid size-10 cursor-pointer list-none place-items-center rounded-xl text-[var(--muted)] hover:bg-[var(--surface-muted)]"><MoreHorizontal className="size-5" /></summary>
        <div className="absolute right-0 z-20 mt-1 w-56 rounded-xl border bg-white p-2 shadow-xl">
          <form action={statusAction}>
            <input type="hidden" name="membershipId" value={member.membershipId} />
            <input type="hidden" name="status" value={member.status === "active" ? "suspended" : "active"} />
            <button disabled={pending || isCurrentUser || !canManageMember} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-40">
              {member.status === "active" ? <Ban className="size-4" /> : <UserCheck className="size-4" />}{member.status === "active" ? "Заблокировать" : "Восстановить доступ"}
            </button>
          </form>
          <form action={statusAction} onSubmit={(event) => { if (!window.confirm("Удалить пользователя из клиники? Его история сохранится.")) event.preventDefault(); }}>
            <input type="hidden" name="membershipId" value={member.membershipId} />
            <input type="hidden" name="status" value="removed" />
            <button disabled={pending || isCurrentUser || !canManageMember} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[var(--danger)] hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"><Trash2 className="size-4" />Удалить из клиники</button>
          </form>
        </div>
      </details>
      <div className="lg:col-span-5"><StateMessage state={roleState} /><StateMessage state={statusState} /></div>
    </div>
  );
}

function InvitationRow({ invitation }: { invitation: OrganizationInvitation }) {
  const [renewState, renewAction, renewPending] = useActionState(renewInvitation, initialState);
  const [revokeState, revokeAction, revokePending] = useActionState(revokeInvitation, initialState);
  const statusLabels = { pending: "Ожидает", accepted: "Принято", revoked: "Отменено", expired: "Истекло" };
  const active = invitation.status === "pending";

  return (
    <div className="border-b p-4 last:border-b-0 sm:p-5">
      <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_180px_120px_155px_auto] lg:items-center">
        <div><p className="font-semibold">{invitation.email}</p><p className="mt-1 text-xs text-[var(--muted)]">Создано {formatDate(invitation.createdAt, true)}</p></div>
        <p className="text-sm">{invitation.roleName}</p>
        <span className={active ? "w-fit rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800" : invitation.status === "accepted" ? "w-fit rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700" : "w-fit rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600"}>{statusLabels[invitation.status]}</span>
        <p className="text-xs text-[var(--muted)]">До {formatDate(invitation.expiresAt, true)}</p>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <form action={renewAction}>
            <input type="hidden" name="email" value={invitation.email} />
            <input type="hidden" name="roleId" value={invitation.roleId} />
            <Button variant="secondary" disabled={renewPending || revokePending}><RotateCw className={renewPending ? "size-4 animate-spin" : "size-4"} />Новая ссылка</Button>
          </form>
          {active && <form action={revokeAction}>
            <input type="hidden" name="invitationId" value={invitation.invitationId} />
            <Button variant="ghost" disabled={renewPending || revokePending} className="text-[var(--danger)]">Отменить</Button>
          </form>}
        </div>
      </div>
      <StateMessage state={renewState} /><StateMessage state={revokeState} />
      {renewState.invitationUrl && <div className="mt-3"><InvitationLink value={renewState.invitationUrl} /></div>}
    </div>
  );
}

export function UserManagement({ members, invitations, roles, auditLogs, currentUserId, organizationName }: UserManagementData) {
  const [tab, setTab] = useState<"members" | "invitations">("members");
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase("ru");
  const filteredMembers = useMemo(() => members.filter((member) => !normalizedQuery || member.fullName.toLocaleLowerCase("ru").includes(normalizedQuery) || member.email.toLocaleLowerCase("ru").includes(normalizedQuery)), [members, normalizedQuery]);
  const pendingCount = invitations.filter((item) => item.status === "pending").length;
  const activeCount = members.filter((item) => item.status === "active").length;
  const currentUserIsOwner = members.some((member) => member.userId === currentUserId && member.roleCode === "owner");
  const assignableRoles = currentUserIsOwner ? roles : roles.filter((role) => role.code !== "owner");

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div><p className="text-sm font-semibold text-[var(--brand)]">Настройки · {organizationName}</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">Пользователи</h1><p className="mt-2 text-sm text-[var(--muted)]">Команда клиники, приглашения и роли доступа.</p></div>
        <div className="flex gap-3"><div className="rounded-xl border bg-white px-4 py-2"><span className="text-xs text-[var(--muted)]">Активных</span><p className="text-lg font-semibold">{activeCount}</p></div><div className="rounded-xl border bg-white px-4 py-2"><span className="text-xs text-[var(--muted)]">Ожидают</span><p className="text-lg font-semibold">{pendingCount}</p></div></div>
      </div>

      <InviteForm roles={assignableRoles} />

      <div className="flex gap-1 overflow-x-auto border-b">
        {[
          ["members", "Команда", UsersRound, members.length],
          ["invitations", "Приглашения", Clock3, invitations.length],
        ].map(([value, label, Icon, count]) => {
          const TabIcon = Icon as typeof UsersRound;
          return <button key={String(value)} onClick={() => setTab(value as typeof tab)} className={tab === value ? "flex h-11 items-center gap-2 border-b-2 border-[var(--brand)] px-3 text-sm font-semibold text-[var(--brand-dark)]" : "flex h-11 items-center gap-2 px-3 text-sm font-medium text-[var(--muted)]"}><TabIcon className="size-4" />{String(label)}<span className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-xs">{String(count)}</span></button>;
        })}
      </div>

      {tab === "members" && <>
        <Card className="overflow-hidden">
          <div className="border-b p-4"><label className="relative block max-w-xl"><span className="sr-only">Поиск пользователей</span><Search className="absolute left-3.5 top-3.5 size-4 text-[var(--muted)]" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по имени или email" className="pl-10" /></label></div>
          <div className="hidden grid-cols-[minmax(220px,1.5fr)_190px_130px_150px_44px] gap-4 border-b bg-[var(--surface-muted)]/60 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-[var(--muted)] lg:grid"><span>Пользователь</span><span>Роль</span><span>Статус</span><span>Последний вход</span><span /></div>
          <div className="divide-y">{filteredMembers.length ? filteredMembers.map((member) => <MemberRow key={member.membershipId} member={member} roles={assignableRoles.some((role) => role.roleId === member.roleId) ? assignableRoles : roles} isCurrentUser={member.userId === currentUserId} currentUserIsOwner={currentUserIsOwner} />) : <p className="p-10 text-center text-sm text-[var(--muted)]">Пользователи не найдены.</p>}</div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3"><Activity className="size-5 text-[var(--brand)]" /><div><h2 className="font-semibold">Журнал действий</h2><p className="text-sm text-[var(--muted)]">Последние изменения доступа и приглашений.</p></div></div>
          <div className="mt-4 divide-y">{auditLogs.length ? auditLogs.map((log) => <div key={log.id} className="flex flex-col justify-between gap-1 py-3 text-sm sm:flex-row"><p><span className="font-semibold">{log.actorName || log.actorEmail || "Пользователь"}</span> {actionLabels[log.action] ?? log.action} <span className="font-medium">{log.targetLabel}</span></p><time className="shrink-0 text-xs text-[var(--muted)]">{formatDate(log.occurredAt, true)}</time></div>) : <p className="py-5 text-sm text-[var(--muted)]">Действий пока нет.</p>}</div>
        </Card>
      </>}

      {tab === "invitations" && <Card className="overflow-hidden">{invitations.length ? invitations.map((invitation) => <InvitationRow key={invitation.invitationId} invitation={invitation} />) : <div className="grid min-h-52 place-items-center p-8 text-center"><div><MailPlus className="mx-auto size-8 text-[var(--brand)]" /><h2 className="mt-3 font-semibold">Приглашений пока нет</h2><p className="mt-1 text-sm text-[var(--muted)]">Создайте первое приглашение выше.</p></div></div>}</Card>}
    </div>
  );
}
