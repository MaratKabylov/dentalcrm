"use client";

import Link from "next/link";
import { useCallback,useEffect,useState,type FormEvent } from "react";
import { useAuth } from "../auth-shell";

interface Role {id:string;key:string;name:string;isSystem:boolean;permissions:string[]}
interface Scope {type:"tenant"|"organization"|"branch";organizationId:string|null;branchId:string|null}
interface Membership {id:string;userId:string;displayName:string;email:string|null;status:string;username:string|null;roles:Role[];scopes:Scope[]}
interface Named {id:string;name:string;organizationId?:string}
interface Permission {key:string;description:string}
interface AccessData {memberships:Membership[];roles:Role[];permissions:Permission[];organizations:Named[];branches:Named[]}

export function AdminWorkspace(){const {session,request}=useAuth();const [data,setData]=useState<AccessData|null>(null);
  const [notice,setNotice]=useState("");const [loading,setLoading]=useState(true);
  const load=useCallback(async()=>{setLoading(true);try{setData(await request<AccessData>("/admin/access"));setNotice("");}
    catch(reason){setNotice(message(reason));}finally{setLoading(false);}},[request]);useEffect(()=>{void load();},[load]);
  if(!session.permissions.includes("settings.manage"))return <main className="setup"><div className="brand"><span className="brand-mark">D</span> Dental SaaS</div>
    <h1>Нет доступа</h1><p>Для управления пользователями требуется разрешение <code>settings.manage</code>.</p><Link href="/">Вернуться</Link></main>;
  return <main className="admin-shell"><section className="admin-heading"><div><span className="eyebrow">Администрирование</span><h1>Команда и доступ</h1>
      <p>Роли и область доступа проверяются API при каждом запросе.</p></div>{data&&<div className="catalog-counter"><b>{data.memberships.length}</b><span>пользователей</span></div>}</section>
    {notice&&<div className="notice" role="status">{notice}</div>}
    {loading||!data?<div className="admin-loading">Загружаем настройки доступа…</div>:<div className="admin-grid"><section className="admin-members">
      <div className="admin-section-title"><div><span className="eyebrow">Memberships</span><h2>Пользователи</h2></div></div>
      {data.memberships.map(member=><MemberEditor key={member.id} member={member} data={data} currentMembershipId={session.membershipId}
        save={async payload=>{try{await request(`/admin/memberships/${member.id}/access`,{method:"PATCH",body:JSON.stringify(payload)});
          await load();setNotice(`Доступ пользователя ${member.displayName} обновлён`);}catch(reason){setNotice(message(reason));}}}/>)}</section>
      <aside className="admin-roles"><div className="admin-section-title"><div><span className="eyebrow">RBAC</span><h2>Роли</h2></div></div>
        {data.roles.map(role=><article className="role-card" key={role.id}><div><b>{role.name}</b><code>{role.key}</code></div>
          <span>{role.permissions.length} разрешений</span>{role.isSystem&&<i>системная</i>}</article>)}
        <RoleForm permissions={data.permissions} create={async payload=>{try{await request("/admin/roles",{method:"POST",body:JSON.stringify(payload)});
          await load();setNotice("Новая роль создана");}catch(reason){setNotice(message(reason));}}}/></aside></div>}
  </main>;
}

function MemberEditor({member,data,currentMembershipId,save}:{member:Membership;data:AccessData;currentMembershipId:string;
  save:(payload:Record<string,unknown>)=>Promise<void>}){const initialRoles=member.roles.map(role=>role.id);const [roleIds,setRoleIds]=useState(initialRoles);
  const [status,setStatus]=useState(member.status);const initialTenant=member.scopes.some(scope=>scope.type==="tenant");const [tenantWide,setTenantWide]=useState(initialTenant);
  const [organizationIds,setOrganizationIds]=useState(member.scopes.flatMap(scope=>scope.organizationId?[scope.organizationId]:[]));
  const [branchIds,setBranchIds]=useState(member.scopes.flatMap(scope=>scope.branchId?[scope.branchId]:[]));const [saving,setSaving]=useState(false);
  async function submit(event:FormEvent){event.preventDefault();setSaving(true);try{await save({status,roleIds,tenantWide,
    organizationIds:tenantWide?[]:organizationIds,branchIds:tenantWide?[]:branchIds});}finally{setSaving(false);}}
  return <form className="member-card" onSubmit={submit}><div className="member-identity"><span className="member-avatar">{initials(member.displayName)}</span>
    <div><b>{member.displayName}{member.id===currentMembershipId&&<small> вы</small>}</b><span>{member.username?`@${member.username}`:member.email ?? "Без логина"}</span></div>
    <select value={status} onChange={event=>setStatus(event.target.value)} disabled={member.id===currentMembershipId}><option value="active">Активен</option><option value="suspended">Заблокирован</option></select></div>
    <fieldset><legend>Роли</legend>{data.roles.map(role=><label className="admin-check" key={role.id}><input type="checkbox" checked={roleIds.includes(role.id)}
      onChange={()=>setRoleIds(toggle(roleIds,role.id))}/><span>{role.name}<small>{role.key}</small></span></label>)}</fieldset>
    <fieldset><legend>Область доступа</legend><label className="admin-check"><input type="checkbox" checked={tenantWide} onChange={event=>setTenantWide(event.target.checked)}/>
      <span>Вся клиника<small>tenant-wide</small></span></label>{!tenantWide&&<><span className="scope-label">Организации</span>{data.organizations.map(item=><label className="admin-check" key={item.id}>
        <input type="checkbox" checked={organizationIds.includes(item.id)} onChange={()=>setOrganizationIds(toggle(organizationIds,item.id))}/><span>{item.name}</span></label>)}
      <span className="scope-label">Филиалы</span>{data.branches.map(item=><label className="admin-check" key={item.id}><input type="checkbox" checked={branchIds.includes(item.id)}
        onChange={()=>setBranchIds(toggle(branchIds,item.id))}/><span>{item.name}</span></label>)}</>}</fieldset>
    <button className="secondary" disabled={saving||roleIds.length===0}>{saving?"Сохраняем…":"Сохранить доступ"}</button></form>;
}

function RoleForm({permissions,create}:{permissions:Permission[];create:(payload:Record<string,unknown>)=>Promise<void>}){const [saving,setSaving]=useState(false);
  async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();const element=event.currentTarget,form=new FormData(element);setSaving(true);
    try{await create({key:form.get("key"),name:form.get("name"),permissions:form.getAll("permissions")});element.reset();}finally{setSaving(false);}}
  return <form className="role-form" onSubmit={submit}><h3>Новая роль</h3><label>Ключ<input name="key" placeholder="clinic_manager" required/></label>
    <label>Название<input name="name" placeholder="Управляющий" required/></label><label>Разрешения<select name="permissions" multiple size={8}>
      {permissions.map(permission=><option key={permission.key} value={permission.key}>{permission.key}</option>)}</select></label>
    <button className="primary" disabled={saving}>{saving?"Создаём…":"Создать роль"}</button></form>;
}
function toggle(items:string[],id:string){return items.includes(id)?items.filter(item=>item!==id):[...items,id];}
function initials(name:string){return name.split(/\s+/).slice(0,2).map(part=>part[0]).join("").toUpperCase();}
function message(reason:unknown){return reason instanceof Error?reason.message:"Неизвестная ошибка";}
