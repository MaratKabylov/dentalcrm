"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

interface ShellSession { displayName:string; tenantName:string; permissions:string[] }

const sections=[
  {label:"Работа",items:[
    {href:"/",label:"Расписание",icon:"CAL"},
    {href:"/patients",label:"Пациенты",icon:"PAT"},
    {href:"/workspace/treatment",label:"Лечение",icon:"MED"},
    {href:"/workspace/tasks",label:"Задачи",icon:"TSK"}
  ]},
  {label:"Бизнес",items:[
    {href:"/workspace/crm",label:"CRM",icon:"CRM"},
    {href:"/workspace/finance",label:"Финансы",icon:"FIN"},
    {href:"/workspace/inventory",label:"Склад",icon:"INV"},
    {href:"/workspace/analytics",label:"Аналитика",icon:"ANA"}
  ]},
  {label:"Управление",items:[
    {href:"/settings",label:"Справочники",icon:"SET"},
    {href:"/admin",label:"Доступ",icon:"ADM",permission:"settings.manage"}
  ]}
] as const;

export function AppNavigation({session,logout,children}:{session:ShellSession;logout:()=>Promise<void>;children:ReactNode}){
  const pathname=usePathname();const [open,setOpen]=useState(false);
  return <div className="product-shell">
    <aside className={`product-sidebar ${open?"open":""}`}>
      <div className="sidebar-brand"><Link href="/" onClick={()=>setOpen(false)}><span className="brand-mark">D</span><span><b>Dental</b><small>Управление клиникой</small></span></Link><button onClick={()=>setOpen(false)} aria-label="Закрыть меню">×</button></div>
      <div className="clinic-switcher"><span className="clinic-avatar">К</span><div><small>Рабочее пространство</small><b>{session.tenantName}</b></div><span>⌄</span></div>
      <nav className="sidebar-nav">{sections.map(section=><section key={section.label}><span>{section.label}</span>{section.items.filter(item=>!("permission" in item)||session.permissions.includes(item.permission)).map(item=>{
        const active=item.href==="/"?pathname===item.href:pathname.startsWith(item.href);return <Link key={item.href} href={item.href} className={active?"active":""} onClick={()=>setOpen(false)}><i>{item.icon}</i>{item.label}</Link>;
      })}</section>)}</nav>
      <div className="sidebar-user"><span className="member-avatar">{initials(session.displayName)}</span><div><b>{session.displayName}</b><small>В системе</small></div><button onClick={()=>void logout()} title="Выйти" aria-label="Выйти">↪</button></div>
    </aside>
    {open&&<button className="sidebar-scrim" aria-label="Закрыть меню" onClick={()=>setOpen(false)}/>}
    <div className="product-main"><header className="mobile-header"><button onClick={()=>setOpen(true)} aria-label="Открыть меню">☰</button><Link href="/"><span className="brand-mark">D</span> Dental</Link><span className="member-avatar">{initials(session.displayName)}</span></header>{children}</div>
  </div>;
}

function initials(name:string){return name.split(/\s+/).slice(0,2).map(part=>part[0]).join("").toUpperCase();}
