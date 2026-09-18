"use client";

import Link from "next/link";
import { useCallback,useEffect,useState,type FormEvent } from "react";
import { useAuth } from "../auth-shell";

interface Patient {id:string;firstName:string;lastName:string;middleName?:string;birthDate?:string;sex:"female"|"male"|"unknown";phone:string;email?:string;notes?:string;createdAt:string}

export default function PatientsPage(){
  const {session,request}=useAuth();const [patients,setPatients]=useState<Patient[]>([]);const [query,setQuery]=useState("");
  const [appliedQuery,setAppliedQuery]=useState("");const [loading,setLoading]=useState(true);const [creating,setCreating]=useState(false);
  const [showCreate,setShowCreate]=useState(false);const [notice,setNotice]=useState("");
  const canCreate=session.permissions.includes("patients.create");
  const load=useCallback(async()=>{setLoading(true);try{setPatients(await request<Patient[]>(`/patients${appliedQuery?`?q=${encodeURIComponent(appliedQuery)}`:""}`));setNotice("");}
    catch(error){setNotice(message(error));}finally{setLoading(false);}},[appliedQuery,request]);
  useEffect(()=>{void load();},[load]);
  function search(event:FormEvent){event.preventDefault();setAppliedQuery(query.trim());}
  async function create(event:FormEvent<HTMLFormElement>){event.preventDefault();const element=event.currentTarget;const form=new FormData(element);setCreating(true);setNotice("");
    const optional=(name:string)=>String(form.get(name)??"").trim()||undefined;
    try{await request("/patients",{method:"POST",body:JSON.stringify({lastName:String(form.get("lastName")),firstName:String(form.get("firstName")),middleName:optional("middleName"),
      birthDate:optional("birthDate"),sex:String(form.get("sex")),phone:String(form.get("phone")),email:optional("email"),notes:optional("notes")})});
      element.reset();setShowCreate(false);await load();setNotice("Пациент добавлен");}catch(error){setNotice(message(error));}finally{setCreating(false);}}
  return <main className="data-page">
    <div className="page-heading"><div><span className="eyebrow">База клиники</span><h1>Пациенты</h1><p>Контакты, медицинская карта и финансовая история в одном профиле.</p></div>
      {canCreate&&<button className="primary" onClick={()=>setShowCreate(true)}>＋ Новый пациент</button>}</div>
    {notice&&<div className="notice" role="status">{notice}<button onClick={()=>setNotice("")} aria-label="Закрыть">×</button></div>}
    <section className="patient-directory">
      <div className="directory-toolbar"><form onSubmit={search} className="directory-search"><span>⌕</span><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Фамилия, имя или телефон"/><button>Найти</button></form>
        <div className="directory-count"><b>{patients.length}</b><span>{appliedQuery?"найдено":"пациентов"}</span></div></div>
      {loading?<div className="data-empty">Загружаем пациентов…</div>:patients.length===0?<div className="data-empty"><b>{appliedQuery?"Ничего не найдено":"Пациентов пока нет"}</b><span>{appliedQuery?"Проверьте запрос или очистите поиск.":"Добавьте первую карточку пациента."}</span></div>:
        <div className="patient-table"><div className="patient-table-head"><span>Пациент</span><span>Контакты</span><span>Дата рождения</span><span>Создан</span><span/></div>
          {patients.map(patient=><Link className="patient-row" href={`/patients/${patient.id}`} key={patient.id}><span className="patient-person"><i>{initials(patient)}</i><span><b>{patient.lastName} {patient.firstName} {patient.middleName??""}</b><small>{sexLabel(patient.sex)}</small></span></span>
            <span className="patient-contact"><b>{patient.phone}</b><small>{patient.email||"Email не указан"}</small></span><span>{patient.birthDate?formatDate(patient.birthDate):"—"}</span><span>{formatDate(patient.createdAt)}</span><strong>›</strong></Link>)}</div>}
    </section>
    {showCreate&&<div className="modal-backdrop" onMouseDown={()=>setShowCreate(false)}><form className="patient-form-modal" onSubmit={create} onMouseDown={event=>event.stopPropagation()}>
      <div className="modal-heading"><div><span className="eyebrow">Новая карточка</span><h2>Добавить пациента</h2></div><button type="button" onClick={()=>setShowCreate(false)}>×</button></div>
      <div className="patient-form-grid"><Field name="lastName" label="Фамилия"/><Field name="firstName" label="Имя"/><Field name="middleName" label="Отчество" optional/>
        <Field name="birthDate" label="Дата рождения" type="date" optional/><label>Пол<select name="sex" defaultValue="unknown"><option value="unknown">Не указан</option><option value="female">Женский</option><option value="male">Мужской</option></select></label>
        <Field name="phone" label="Телефон" type="tel"/><Field name="email" label="Email" type="email" optional/><label className="wide">Заметки <small>необязательно</small><textarea name="notes" rows={4}/></label></div>
      <div className="modal-actions"><button type="button" className="secondary" onClick={()=>setShowCreate(false)}>Отмена</button><button className="primary" disabled={creating}>{creating?"Сохраняем…":"Создать карточку"}</button></div></form></div>}
  </main>;
}

function Field({name,label,type="text",optional=false}:{name:string;label:string;type?:string;optional?:boolean}){return <label>{label}{optional&&<small>необязательно</small>}<input name={name} type={type} required={!optional}/></label>}
function initials(patient:Patient){return `${patient.lastName[0]??""}${patient.firstName[0]??""}`.toUpperCase()}
function sexLabel(value:Patient["sex"]){return value==="female"?"Женщина":value==="male"?"Мужчина":"Пол не указан"}
function formatDate(value:string){return new Date(value).toLocaleDateString("ru-RU")}
function message(error:unknown){return error instanceof Error?error.message:"Не удалось выполнить запрос"}
