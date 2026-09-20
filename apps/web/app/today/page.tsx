"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth-shell";

interface Appointment {id:string;patientId?:string;patientName:string;doctorName:string;chairName?:string;reason?:string;startsAt:string;endsAt:string;status:string}
const labels:Record<string,string>={created:"Ожидается",awaiting_confirmation:"Ожидается",confirmed:"Ожидается",checked_in:"Пришёл",in_progress:"В кресле",completed:"Завершил",cancelled:"Отменён",no_show:"Не пришёл",rescheduled:"Перенесён"};
const actions:Record<string,[string,string]|undefined>={created:["confirm","Подтвердить"],awaiting_confirmation:["confirm","Подтвердить"],confirmed:["check-in","Отметить приход"],checked_in:["start","Начать приём"],in_progress:["complete","Завершить"]};

export default function TodayPage(){const {request}=useAuth();const [items,setItems]=useState<Appointment[]>([]),[loading,setLoading]=useState(true),[notice,setNotice]=useState("");
  const load=useCallback(async()=>{const from=new Date();from.setHours(0,0,0,0);const to=new Date(from);to.setDate(to.getDate()+1);setLoading(true);try{setItems(await request<Appointment[]>(`/appointments?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`));setNotice("");}catch(error){setNotice(error instanceof Error?error.message:"Не удалось загрузить смену");}finally{setLoading(false);}},[request]);
  useEffect(()=>{void load();},[load]);
  const counts=useMemo(()=>({expected:items.filter(item=>["created","awaiting_confirmation","confirmed"].includes(item.status)).length,arrived:items.filter(item=>item.status==="checked_in").length,chair:items.filter(item=>item.status==="in_progress").length,done:items.filter(item=>item.status==="completed").length,noShow:items.filter(item=>item.status==="no_show").length}),[items]);
  async function transition(item:Appointment,action:string){try{await request(`/appointments/${item.id}/${action}`,{method:"POST",body:"{}"});await load();}catch(error){setNotice(error instanceof Error?error.message:"Не удалось обновить статус");}}
  const active=items.filter(item=>!["cancelled","rescheduled"].includes(item.status));
  return <main className="today-page"><header className="today-header"><div><span className="page-kicker">Операционный экран</span><h1>Сегодня</h1><p>{new Date().toLocaleDateString("ru-RU",{weekday:"long",day:"numeric",month:"long"})} · {items.length} пациентов</p></div><div><span className="live-indicator"><i/> Смена в работе</span><Link className="primary button-link" href="/">Открыть расписание</Link></div></header>
    {notice&&<div className="toast-notice">{notice}</div>}
    <section className="today-metrics"><Metric label="Ожидаются" value={counts.expected} tone="neutral"/><Metric label="Пришли" value={counts.arrived} tone="success"/><Metric label="В кресле" value={counts.chair} tone="primary"/><Metric label="Завершили" value={counts.done} tone="neutral"/><Metric label="Не пришли" value={counts.noShow} tone="danger"/></section>
    <section className="patient-flow"><header><div><h2>Поток пациентов</h2><p>Живая очередь и состояние кабинетов</p></div><span>Обновлено только что</span></header><div className="flow-head"><span>Время</span><span>Пациент</span><span>Состояние</span><span>Направление</span><span>Врач</span><span/></div>{loading?<div className="data-empty">Загружаем смену…</div>:active.length===0?<div className="data-empty"><b>На сегодня записей нет</b><span>Создайте запись в расписании — она появится здесь.</span></div>:active.map(item=>{const action=actions[item.status];return <article className="flow-row" key={item.id}><time>{new Date(item.startsAt).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})}</time><span className="flow-patient"><i>{initials(item.patientName)}</i><span><b>{item.patientName}</b><small>{item.reason||"Стоматологический приём"}</small></span></span><span className="flow-status" data-status={item.status}><i/>{labels[item.status]??item.status}</span><span>{item.chairName||"Кабинет не назначен"}</span><span>{item.doctorName}</span><span className="flow-actions">{action&&<button onClick={()=>void transition(item,action[0])}>{action[1]}</button>}{item.patientId&&<Link href={`/patients/${item.patientId}`}>Открыть</Link>}</span></article>})}</section>
    <aside className="today-note"><span>Следующий час</span><b>{active.filter(item=>{const delta=new Date(item.startsAt).getTime()-Date.now();return delta>=0&&delta<=3_600_000;}).length} пациента</b><p>Проверьте подтверждения и готовность кабинетов до начала приёма.</p></aside>
  </main>;
}
function Metric({label,value,tone}:{label:string;value:number;tone:string}){return <article data-tone={tone}><span>{label}</span><b>{value}</b><i/></article>}
function initials(value:string){return value.split(/\s+/).slice(0,2).map(part=>part[0]).join("").toUpperCase();}
