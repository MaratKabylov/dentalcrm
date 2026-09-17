"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../auth-shell";

interface Item { id:string; code?:string; name?:string; [key:string]:unknown }
type ResourceKey="organizations"|"branches"|"rooms"|"chairs"|"employees"|"service-categories"|"services"|"price-lists"|"diagnoses"|"cashboxes"|"expense-categories";

const catalog:Record<ResourceKey,{label:string;eyebrow:string;description:string;canRename:boolean}>={
  organizations:{label:"Организации",eyebrow:"Структура",description:"Юридические и управляющие единицы сети",canRename:true},
  branches:{label:"Филиалы",eyebrow:"Структура",description:"Клиники, адреса работы и часовые пояса",canRename:true},
  rooms:{label:"Кабинеты",eyebrow:"Структура",description:"Рабочие помещения внутри филиалов",canRename:true},
  chairs:{label:"Кресла",eyebrow:"Структура",description:"Ресурсы для календаря и записи",canRename:true},
  employees:{label:"Сотрудники",eyebrow:"Команда",description:"Администраторы, врачи и персонал",canRename:false},
  "service-categories":{label:"Категории услуг",eyebrow:"Каталог",description:"Группировка медицинских услуг",canRename:true},
  services:{label:"Услуги",eyebrow:"Каталог",description:"Процедуры, длительность и принадлежность",canRename:true},
  "price-lists":{label:"Прайс-листы",eyebrow:"Каталог",description:"Цены по филиалам и периодам действия",canRename:false},
  diagnoses:{label:"Диагнозы",eyebrow:"Клиника",description:"Единый клинический справочник кодов",canRename:true},
  cashboxes:{label:"Кассы",eyebrow:"Финансы",description:"Кассовые точки филиалов",canRename:true},
  "expense-categories":{label:"Категории расходов",eyebrow:"Финансы",description:"Статьи операционных расходов",canRename:true}
};
const keys=Object.keys(catalog) as ResourceKey[];
const archivePaths:Record<ResourceKey,string>={organizations:"organizations",branches:"branches",rooms:"rooms",chairs:"chairs",
  employees:"employees","service-categories":"service-categories",services:"services","price-lists":"price-lists",
  diagnoses:"diagnoses",cashboxes:"cashboxes","expense-categories":"expense-categories"};

export function SettingsWorkspace(){
  const {session,request,logout}=useAuth();
  const [active,setActive]=useState<ResourceKey>("branches"); const [data,setData]=useState<Record<string,Item[]>>({});
  const [query,setQuery]=useState(""); const [notice,setNotice]=useState(""); const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false); const [editing,setEditing]=useState<Item|null>(null);
  const load=useCallback(async()=>{
    setLoading(true);
    try{const responses=await Promise.all(keys.map(async key=>[key,await request<Item[]>(`/${key}`)] as const));
      setData(Object.fromEntries(responses)); setNotice("");
    }catch(error){setNotice(message(error));}finally{setLoading(false);}
  },[request]);
  useEffect(()=>{void load();},[load]);
  const rows=(data[active] ?? []).filter(item=>`${item.name ?? ""} ${item.code ?? ""}`.toLowerCase().includes(query.toLowerCase()));

  async function create(event:FormEvent<HTMLFormElement>){
    event.preventDefault(); const formElement=event.currentTarget; const form=new FormData(formElement); setSaving(true);
    try{await request(`/${active}`,{method:"POST",body:JSON.stringify(payload(active,form))}); formElement.reset();
      await load(); setNotice(`${catalog[active].label}: запись создана`);
    }catch(error){setNotice(message(error));}finally{setSaving(false);}
  }
  async function archive(item:Item){
    if(!window.confirm(`Архивировать «${displayName(item)}»?`))return;
    try{await request(`/${archivePaths[active]}/${item.id}/archive`,{method:"POST",body:"{}"}); await load(); setNotice("Запись архивирована");}
    catch(error){setNotice(message(error));}
  }
  async function rename(event:FormEvent<HTMLFormElement>){
    event.preventDefault(); if(!editing)return; const form=new FormData(event.currentTarget);
    try{await request(`/${archivePaths[active]}/${editing.id}`,{method:"PATCH",body:JSON.stringify({name:form.get("name")})});
      setEditing(null); await load(); setNotice("Название обновлено");}catch(error){setNotice(message(error));}
  }
  return <main className="settings-shell">
    <header className="settings-header"><Link className="brand brand-link" href="/"><span className="brand-mark">D</span> Dental SaaS</Link>
      <nav className="top-nav"><Link href="/">Расписание</Link><Link className="active" href="/settings">Настройки</Link><Link href="/admin">Доступ</Link></nav>
      <div className="header-actions"><span className="live-dot"/> {session.displayName}<button className="logout-link" onClick={()=>void logout()}>Выйти</button></div></header>
    <div className="settings-heading"><div><span className="eyebrow">Управление клиникой</span><h1>Справочники</h1><p>Единое место для структуры, команды, услуг и финансовых настроек.</p></div>
      <div className="catalog-counter"><b>{keys.reduce((sum,key)=>sum+(data[key]?.length ?? 0),0)}</b><span>активных записей</span></div></div>
    {notice&&<div className="notice" role="status">{notice}<button onClick={()=>setNotice("")} aria-label="Закрыть">×</button></div>}
    <section className="settings-layout"><aside className="catalog-nav">{["Структура","Команда","Каталог","Клиника","Финансы"].map(group=><div key={group}>
      <span className="nav-group">{group}</span>{keys.filter(key=>catalog[key].eyebrow===group).map(key=><button key={key} className={active===key?"active":""}
        onClick={()=>{setActive(key);setQuery("");setEditing(null);}}><span>{navIcon(key)}</span><span>{catalog[key].label}</span><i>{data[key]?.length ?? 0}</i></button>)}</div>)}</aside>
      <div className="catalog-main"><div className="catalog-toolbar"><div><span>{catalog[active].eyebrow}</span><h2>{catalog[active].label}</h2><p>{catalog[active].description}</p></div>
        <label className="catalog-search"><span>⌕</span><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Поиск по названию или коду"/></label></div>
        <div className="catalog-content"><div className="resource-list">{loading?<div className="catalog-empty">Загружаем справочники…</div>:rows.length===0?<div className="catalog-empty"><b>Здесь пока пусто</b><span>Создайте первую запись в форме справа.</span></div>:
          rows.map(item=><article className="resource-row" key={item.id}><div className="resource-symbol">{initials(item)}</div><div className="resource-info"><b>{displayName(item)}</b><span>{subtitle(active,item,data)}</span></div>
            <div className="resource-meta">{meta(active,item)}</div><div className="row-actions">{catalog[active].canRename&&<button onClick={()=>setEditing(item)}>Изменить</button>}
              <button className="danger-link" onClick={()=>void archive(item)}>В архив</button></div></article>)}</div>
          <aside className="create-panel"><div className="create-panel-title"><span>＋</span><div><b>Новая запись</b><small>{catalog[active].label}</small></div></div>
            <form onSubmit={create} className="catalog-form"><CreateFields resource={active} data={data}/><button className="primary" disabled={saving}>{saving?"Сохраняем…":"Создать"}</button></form></aside></div></div></section>
    {editing&&<div className="modal-backdrop" role="presentation" onMouseDown={()=>setEditing(null)}><form className="edit-modal" onSubmit={rename} onMouseDown={event=>event.stopPropagation()}>
      <span className="eyebrow">Редактирование</span><h2>{displayName(editing)}</h2><label>Название<input name="name" defaultValue={String(editing.name ?? "")} required autoFocus/></label>
      <div><button type="button" className="secondary" onClick={()=>setEditing(null)}>Отмена</button><button className="primary">Сохранить</button></div></form></div>}
  </main>;
}

function CreateFields({resource,data}:{resource:ResourceKey;data:Record<string,Item[]>}){
  const organizations=data.organizations ?? []; const branches=data.branches ?? []; const rooms=data.rooms ?? [];
  const categories=data["service-categories"] ?? []; const services=data.services ?? [];
  switch(resource){
    case "organizations":return <><Field name="code" label="Код" placeholder="main-clinic"/><Field name="name" label="Название" placeholder="Сеть клиник Dental"/></>;
    case "branches":return <><Select name="organizationId" label="Организация" items={organizations}/><Field name="code" label="Код" placeholder="almaty-center"/><Field name="name" label="Название" placeholder="Филиал на Абая"/><Field name="timezone" label="Часовой пояс" defaultValue="Asia/Almaty"/></>;
    case "rooms":return <><Select name="branchId" label="Филиал" items={branches}/><Field name="code" label="Код" placeholder="room-1"/><Field name="name" label="Название" placeholder="Кабинет 1"/></>;
    case "chairs":return <><Select name="branchId" label="Филиал" items={branches}/><Select name="roomId" label="Кабинет" items={rooms} optional/><Field name="code" label="Код" placeholder="chair-1"/><Field name="name" label="Название" placeholder="Кресло 1"/></>;
    case "employees":return <><Select name="branchId" label="Филиал" items={branches}/><div className="catalog-form-row"><Field name="lastName" label="Фамилия"/><Field name="firstName" label="Имя"/></div><Field name="email" label="Email" type="email" optional/><label className="check-field"><input type="checkbox" name="isDoctor"/> Это врач</label><Field name="specialty" label="Специальность" optional/></>;
    case "service-categories":return <><Select name="organizationId" label="Организация" items={organizations}/><Field name="code" label="Код" placeholder="therapy"/><Field name="name" label="Название" placeholder="Терапия"/></>;
    case "services":return <><Select name="organizationId" label="Организация" items={organizations}/><Select name="categoryId" label="Категория" items={categories} optional/><Field name="code" label="Код" placeholder="consultation"/><Field name="name" label="Название" placeholder="Первичная консультация"/><Field name="durationMinutes" label="Длительность, мин" type="number" defaultValue="30"/></>;
    case "price-lists":return <><Select name="organizationId" label="Организация" items={organizations}/><Field name="name" label="Название" placeholder="Основной прайс"/><Select name="branchId" label="Филиал" items={branches} optional/><div className="catalog-form-row"><Field name="currency" label="Валюта" defaultValue="KZT"/><Field name="validFrom" label="Действует с" type="date"/></div><Select name="serviceId" label="Первая услуга" items={services}/><Field name="priceMinor" label="Цена в minor units" type="number"/></>;
    case "diagnoses":return <><Select name="organizationId" label="Организация" items={organizations}/><Field name="code" label="Код диагноза" placeholder="K02.1"/><Field name="name" label="Наименование" placeholder="Кариес дентина"/></>;
    case "cashboxes":return <><Select name="branchId" label="Филиал" items={branches}/><Field name="code" label="Код" placeholder="main-cash"/><Field name="name" label="Название" placeholder="Основная касса"/><Field name="currency" label="Валюта" defaultValue="KZT"/></>;
    case "expense-categories":return <><Select name="organizationId" label="Организация" items={organizations}/><Field name="code" label="Код" placeholder="utilities"/><Field name="name" label="Название" placeholder="Коммунальные услуги"/><Field name="currency" label="Валюта" defaultValue="KZT"/></>;
  }
}
function Field({name,label,type="text",placeholder,defaultValue,optional=false}:{name:string;label:string;type?:string;placeholder?:string;defaultValue?:string;optional?:boolean}){
  return <label>{label}{optional&&<small>необязательно</small>}<input name={name} type={type} placeholder={placeholder} defaultValue={defaultValue} required={!optional}/></label>;
}
function Select({name,label,items,optional=false}:{name:string;label:string;items:Item[];optional?:boolean}){return <label>{label}{optional&&<small>необязательно</small>}<select name={name} required={!optional} defaultValue=""><option value="">{optional?"Не выбрано":"Выберите"}</option>{items.map(item=><option key={item.id} value={item.id}>{displayName(item)}</option>)}</select></label>;}
function payload(resource:ResourceKey,form:FormData):Record<string,unknown>{
  const value=(name:string)=>String(form.get(name) ?? "").trim(); const optional=(name:string)=>value(name)||undefined;
  switch(resource){
    case "organizations":return{code:value("code"),name:value("name")};
    case "branches":return{organizationId:value("organizationId"),code:value("code"),name:value("name"),timezone:value("timezone")};
    case "rooms":return{branchId:value("branchId"),code:value("code"),name:value("name")};
    case "chairs":return{branchId:value("branchId"),roomId:optional("roomId"),code:value("code"),name:value("name")};
    case "employees":return{branchIds:[value("branchId")],lastName:value("lastName"),firstName:value("firstName"),email:optional("email"),
      ...(form.get("isDoctor")?{doctor:{specialty:optional("specialty")}}:{})};
    case "service-categories":return{organizationId:value("organizationId"),code:value("code"),name:value("name")};
    case "services":return{organizationId:value("organizationId"),categoryId:optional("categoryId"),code:value("code"),name:value("name"),durationMinutes:Number(value("durationMinutes"))};
    case "price-lists":return{organizationId:value("organizationId"),name:value("name"),branchId:optional("branchId"),currency:value("currency"),validFrom:value("validFrom"),items:[{serviceId:value("serviceId"),priceMinor:Number(value("priceMinor"))}]};
    case "diagnoses":return{organizationId:value("organizationId"),code:value("code"),name:value("name")};
    case "cashboxes":return{branchId:value("branchId"),code:value("code"),name:value("name"),currency:value("currency")};
    case "expense-categories":return{organizationId:value("organizationId"),code:value("code"),name:value("name"),currency:value("currency")};
  }
}
function displayName(item:Item){return String(item.name ?? `${item.lastName ?? ""} ${item.firstName ?? ""}`.trim() ?? item.code ?? "Без названия");}
function initials(item:Item){return displayName(item).split(/\s+/).slice(0,2).map(part=>part[0]).join("").toUpperCase();}
function subtitle(resource:ResourceKey,item:Item,data:Record<string,Item[]>){const code=item.code?`Код: ${item.code}`:"";
  if(resource==="branches")return `${item.organizationName ?? "Организация"} · ${item.timezone}`;
  if(["rooms","chairs","cashboxes"].includes(resource)){const branch=(data.branches ?? []).find(value=>value.id===item.branchId);return `${branch?.name ?? "Филиал"}${code?` · ${code}`:""}`;}
  if(resource==="services"){const category=(data["service-categories"] ?? []).find(value=>value.id===item.categoryId);return `${category?.name ?? "Без категории"} · ${item.durationMinutes} мин`;
  } if(resource==="employees")return `${item.doctorId?`Врач${item.specialty?` · ${item.specialty}`:""}`:"Сотрудник"}${item.email?` · ${item.email}`:""}`;
  if(resource==="price-lists")return `${item.currency} · с ${String(item.validFrom)}`; return code||String(item.currency ?? "Активно");}
function meta(resource:ResourceKey,item:Item){if(resource==="cashboxes")return <span className={item.hasOpenSession?"status-open":"status-neutral"}>{item.hasOpenSession?"Смена открыта":"Смена закрыта"}</span>;
  if(resource==="price-lists")return <span className="status-neutral">{Array.isArray(item.items)?item.items.length:0} цен</span>; return <span className="status-active">Активно</span>;}
function navIcon(key:ResourceKey){return ({organizations:"◫",branches:"⌂",rooms:"□",chairs:"◇",employees:"◎","service-categories":"≡",services:"＋","price-lists":"₸",diagnoses:"✚",cashboxes:"▣","expense-categories":"↘"} as Record<ResourceKey,string>)[key];}
function message(error:unknown){return error instanceof Error?error.message:"Неизвестная ошибка";}
