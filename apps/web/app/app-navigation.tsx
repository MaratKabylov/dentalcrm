"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

interface ShellSession { displayName:string; tenantName:string; permissions:string[] }
interface SearchPatient { id:string; firstName:string; lastName:string; phone:string; }
interface SearchEmployee { firstName:string; lastName:string; doctorId?:string; }
interface SearchAppointment { id:string; patientId?:string; patientName:string; doctorName:string; startsAt:string; }
type ApiRequest = <T>(path:string,init?:RequestInit)=>Promise<T>;

const sections=[
  {label:"Клиника",items:[
    {href:"/today",label:"Сегодня",icon:"◉",permission:"appointments.read"},
    {href:"/",label:"Расписание",icon:"▦",permission:"appointments.read"},
    {href:"/patients",label:"Пациенты",icon:"♙",permission:"patients.read"}
  ]},
  {label:"Рабочие процессы",items:[
    {href:"/workspace/treatment",label:"Лечение",icon:"＋",permission:"clinical.read"},
    {href:"/workspace/finance",label:"Финансы",icon:"₸",permission:"finance.read"},
    {href:"/workspace/inventory",label:"Склад",icon:"□",permission:"inventory.read"}
  ]},
  {label:"Управление",items:[
    {href:"/workspace/tasks",label:"Задачи",icon:"✓",permission:"tasks.read"},
    {href:"/workspace/analytics",label:"Аналитика",icon:"↗",permission:"analytics.read"},
    {href:"/workspace/crm",label:"CRM",icon:"◇",permission:"crm.read"}
  ]},
  {label:"",items:[
    {href:"/settings",label:"Настройки",icon:"⚙",permission:"settings.manage"},
    {href:"/admin",label:"Доступ",icon:"⌾",permission:"settings.manage"}
  ]}
] as const;

export function AppNavigation({session,logout,request,children}:{session:ShellSession;logout:()=>Promise<void>;request:ApiRequest;children:ReactNode}){
  const pathname=usePathname();
  const [open,setOpen]=useState(false);
  const [commandOpen,setCommandOpen]=useState(false);
  useEffect(()=>{setOpen(false);},[pathname]);
  useEffect(()=>{const shortcut=(event:KeyboardEvent)=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="k"){event.preventDefault();setCommandOpen(value=>!value);}if(event.key==="Escape"){setOpen(false);setCommandOpen(false);}};document.addEventListener("keydown",shortcut);return()=>document.removeEventListener("keydown",shortcut);},[]);
  return <div className="product-shell">
    <aside className={`product-sidebar ${open?"open":""}`}>
      <div className="sidebar-brand"><Link href="/today" onClick={()=>setOpen(false)}><span className="brand-mark">D</span><span><b>Dental</b><small>Clinic OS</small></span></Link><button onClick={()=>setOpen(false)} aria-label="Закрыть меню">×</button></div>
      <button className="clinic-switcher" type="button"><span className="clinic-avatar">К</span><span><small>Рабочее пространство</small><b>{session.tenantName}</b></span><i>⌄</i></button>
      <button className="sidebar-search" type="button" onClick={()=>setCommandOpen(true)}><span>⌕</span><span>Поиск и команды</span><kbd>Ctrl K</kbd></button>
      <nav className="sidebar-nav" aria-label="Основная навигация">{sections.map(section=>{const items=section.items.filter(item=>session.permissions.includes(item.permission));return items.length>0&&<section key={section.label||"settings"}>{section.label&&<span>{section.label}</span>}{items.map(item=>{
        const active=item.href==="/"?pathname===item.href:pathname===item.href||pathname.startsWith(`${item.href}/`);return <Link key={item.href} href={item.href} className={active?"active":""} aria-current={active?"page":undefined} onClick={()=>setOpen(false)}><i aria-hidden="true">{item.icon}</i>{item.label}</Link>;
      })}</section>})}</nav>
      <div className="sidebar-user"><span className="member-avatar">{initials(session.displayName)}</span><div><b>{session.displayName}</b><small>Смена активна</small></div><button onClick={()=>void logout()} title="Выйти" aria-label="Выйти">↪</button></div>
    </aside>
    {open&&<button className="sidebar-scrim" aria-label="Закрыть меню" onClick={()=>setOpen(false)}/>}
    <div className="product-main">
      <header className="context-topbar"><button className="menu-trigger" onClick={()=>setOpen(true)} aria-label="Открыть меню">☰</button><div className="topbar-context"><span className="topbar-dot"/>Рабочая смена <b>08:00–20:00</b></div><button className="topbar-search" onClick={()=>setCommandOpen(true)}><span>⌕</span> Найти пациента, запись или врача <kbd>Ctrl K</kbd></button><div className="topbar-actions"><button title="Уведомления">♢<i/></button><span className="member-avatar">{initials(session.displayName)}</span></div></header>
      {children}
    </div>
    {commandOpen&&<SearchCommand request={request} onClose={()=>setCommandOpen(false)}/>}
  </div>;
}

function SearchCommand({request,onClose}:{request:ApiRequest;onClose:()=>void}){
  const router=useRouter();const input=useRef<HTMLInputElement>(null);const [query,setQuery]=useState("");const [loading,setLoading]=useState(false);
  const [patients,setPatients]=useState<SearchPatient[]>([]);const [employees,setEmployees]=useState<SearchEmployee[]>([]);const [appointments,setAppointments]=useState<SearchAppointment[]>([]);
  useEffect(()=>{input.current?.focus();const now=new Date();const end=new Date(now);end.setDate(end.getDate()+14);setLoading(true);Promise.all([
    request<SearchPatient[]>("/patients").catch(()=>[]),request<SearchEmployee[]>("/employees").catch(()=>[]),request<SearchAppointment[]>(`/appointments?from=${encodeURIComponent(now.toISOString())}&to=${encodeURIComponent(end.toISOString())}`).catch(()=>[])
  ]).then(([p,e,a])=>{setPatients(p);setEmployees(e);setAppointments(a);}).catch(()=>{}).finally(()=>setLoading(false));},[request]);
  const needle=query.trim().toLocaleLowerCase("ru-RU");
  const matches=useMemo(()=>({
    patients:patients.filter(item=>`${item.lastName} ${item.firstName} ${item.phone}`.toLocaleLowerCase("ru-RU").includes(needle)).slice(0,5),
    doctors:employees.filter(item=>item.doctorId&&`${item.lastName} ${item.firstName}`.toLocaleLowerCase("ru-RU").includes(needle)).slice(0,4),
    appointments:appointments.filter(item=>`${item.patientName} ${item.doctorName}`.toLocaleLowerCase("ru-RU").includes(needle)).slice(0,4)
  }),[appointments,employees,needle,patients]);
  const go=(href:string)=>{onClose();router.push(href);};
  return <div className="command-backdrop" onMouseDown={onClose}><section className="command-palette" role="dialog" aria-modal="true" aria-label="Поиск и команды" onMouseDown={event=>event.stopPropagation()}>
    <div className="command-input"><span>⌕</span><input ref={input} value={query} onChange={event=>setQuery(event.target.value)} placeholder="Пациент, телефон, ИИН, запись или врач…"/><kbd>Esc</kbd></div>
    <div className="command-results">{!needle?<><CommandGroup title="Быстрые команды"><button onClick={()=>go("/patients")}><i>＋</i><span><b>Создать пациента</b><small>Открыть реестр пациентов</small></span><kbd>N</kbd></button><button onClick={()=>go("/")}><i>▦</i><span><b>Создать запись</b><small>Перейти в расписание</small></span></button><button onClick={()=>go("/workspace/finance")}><i>₸</i><span><b>Открыть кассу</b><small>Финансы клиники</small></span></button></CommandGroup><CommandGroup title="Навигация"><button onClick={()=>go("/today")}><i>◉</i><span><b>Сегодня</b><small>Операционный экран смены</small></span></button><button onClick={()=>go("/")}><i>▦</i><span><b>Расписание</b><small>Календарь врачей и кабинетов</small></span></button></CommandGroup></>:
      loading?<div className="command-empty">Ищем по клинике…</div>:<>{matches.patients.length>0&&<CommandGroup title="Пациенты">{matches.patients.map(item=><button key={item.id} onClick={()=>go(`/patients/${item.id}`)}><i>{initials(`${item.firstName} ${item.lastName}`)}</i><span><b>{item.lastName} {item.firstName}</b><small>{item.phone}</small></span><em>Пациент</em></button>)}</CommandGroup>}{matches.appointments.length>0&&<CommandGroup title="Ближайшие записи">{matches.appointments.map(item=><button key={item.id} onClick={()=>go("/")}><i>▦</i><span><b>{item.patientName}</b><small>{formatDateTime(item.startsAt)} · {item.doctorName}</small></span></button>)}</CommandGroup>}{matches.doctors.length>0&&<CommandGroup title="Врачи">{matches.doctors.map(item=><button key={item.doctorId} onClick={()=>go("/")}><i>+</i><span><b>{item.lastName} {item.firstName}</b><small>Показать в расписании</small></span><em>Врач</em></button>)}</CommandGroup>}{matches.patients.length+matches.appointments.length+matches.doctors.length===0&&<div className="command-empty"><b>Ничего не найдено</b><span>Проверьте имя, телефон или ИИН</span></div>}</>}
    </div><footer><span><kbd>↑↓</kbd> выбор</span><span><kbd>Enter</kbd> открыть</span><span>Поиск по всей клинике</span></footer>
  </section></div>;
}

function CommandGroup({title,children}:{title:string;children:ReactNode}){return <div className="command-group"><span>{title}</span>{children}</div>}
function initials(name:string){return name.split(/\s+/).slice(0,2).map(part=>part[0]).join("").toUpperCase();}
function formatDateTime(value:string){return new Date(value).toLocaleString("ru-RU",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"});}
