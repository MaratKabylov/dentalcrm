"use client";

import Link from "next/link";
import { useCallback,useEffect,useMemo,useState,type FormEvent } from "react";
import { useAuth } from "../../auth-shell";

interface Appointment {
  id:string;patientId:string;doctorId:string;branchId:string;startsAt:string;endsAt:string;status:string;
  patientName:string;doctorName:string;chairName?:string;reason?:string|null;
}
interface Note {id:string;title:string;content:string;status:"draft"|"signed"|"amended";currentVersion:number;signedAt:string|null}
interface Diagnosis {id:string;code:string;name:string;kind:string;toothNumber:number|null}
interface Procedure {id:string;serviceId:string;toothNumber:number|null;quantity:number;status:string;notes:string|null}
interface Encounter {
  id:string;appointmentId:string|null;patientId:string;doctorId:string;branchId:string;status:string;startedAt:string;completedAt:string|null;
  patientName?:string;doctorName?:string;appointmentStatus?:string;reason?:string|null;chairName?:string;
  notesCount?:number;diagnosesCount?:number;proceduresCount?:number;notes?:Note[];diagnoses?:Diagnosis[];procedures?:Procedure[];
}
type QueueFilter="all"|"waiting"|"active"|"completed";

const statusLabels:Record<string,string>={created:"Создана",awaiting_confirmation:"Ждёт подтверждения",confirmed:"Подтверждена",checked_in:"Пациент пришёл",in_progress:"Идёт приём",completed:"Завершён",cancelled:"Отменён",no_show:"Неявка",rescheduled:"Перенесён"};

export default function TreatmentPage(){
  const {session,request}=useAuth();const [date,setDate]=useState(todayKey);const [appointments,setAppointments]=useState<Appointment[]>([]);const [encounters,setEncounters]=useState<Encounter[]>([]);
  const [filter,setFilter]=useState<QueueFilter>("all");const [selected,setSelected]=useState<Encounter|null>(null);const [loading,setLoading]=useState(true);const [saving,setSaving]=useState(false);const [notice,setNotice]=useState("");
  const range=useMemo(()=>dayRange(date),[date]);const canWrite=session.permissions.includes("clinical.write");const canSign=session.permissions.includes("clinical.sign");const canUpdateAppointments=session.permissions.includes("appointments.update");
  const load=useCallback(async()=>{setLoading(true);try{const query=`from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`;const [nextAppointments,nextEncounters]=await Promise.all([request<Appointment[]>(`/appointments?${query}`),request<Encounter[]>(`/encounters?${query}`)]);setAppointments(nextAppointments);setEncounters(nextEncounters);setNotice("");}catch(error){setNotice(message(error));}finally{setLoading(false);}},[range,request]);
  useEffect(()=>{void load();},[load]);
  const encounterByAppointment=useMemo(()=>new Map(encounters.filter(item=>item.appointmentId).map(item=>[item.appointmentId!,item])),[encounters]);
  const visible=appointments.filter(item=>matchesFilter(item,encounterByAppointment.get(item.id),filter));

  async function openEncounter(encounter:Encounter){try{setSelected(await request<Encounter>(`/encounters/${encounter.id}`));}catch(error){setNotice(message(error));}}
  async function transition(appointment:Appointment,action:string){try{await request(`/appointments/${appointment.id}/${action}`,{method:"POST",body:"{}"});await load();}catch(error){setNotice(message(error));}}
  async function startEncounter(appointment:Appointment){setSaving(true);try{if(appointment.status==="checked_in")await request(`/appointments/${appointment.id}/start`,{method:"POST",body:"{}"});const created=await request<Encounter>("/encounters",{method:"POST",body:JSON.stringify({patientId:appointment.patientId,doctorId:appointment.doctorId,branchId:appointment.branchId,appointmentId:appointment.id})});await load();await openEncounter(created);}catch(error){setNotice(message(error));}finally{setSaving(false);}}
  async function createNote(event:FormEvent<HTMLFormElement>){event.preventDefault();if(!selected)return;const element=event.currentTarget,form=new FormData(element);setSaving(true);try{await request("/clinical-notes",{method:"POST",body:JSON.stringify({encounterId:selected.id,title:form.get("title"),content:form.get("content")})});element.reset();await refreshSelected(selected.id);}catch(error){setNotice(message(error));}finally{setSaving(false);}}
  async function signNote(note:Note){setSaving(true);try{await request(`/clinical-notes/${note.id}/sign`,{method:"POST",body:"{}"});if(selected)await refreshSelected(selected.id);}catch(error){setNotice(message(error));}finally{setSaving(false);}}
  async function completeEncounter(){if(!selected)return;setSaving(true);try{await request(`/encounters/${selected.id}/complete`,{method:"POST",body:"{}"});if(selected.appointmentId){const appointment=appointments.find(item=>item.id===selected.appointmentId);if(appointment?.status==="in_progress")await request(`/appointments/${appointment.id}/complete`,{method:"POST",body:"{}"});}setSelected(null);await load();setNotice("Приём завершён");}catch(error){setNotice(message(error));}finally{setSaving(false);}}
  async function refreshSelected(id:string){setSelected(await request<Encounter>(`/encounters/${id}`));await load();}
  function moveDate(days:number){setDate(current=>{const next=new Date(`${current}T12:00:00`);next.setDate(next.getDate()+days);return localDateKey(next);});}

  return <main className="data-page treatment-page">
    <div className="page-heading"><div><span className="eyebrow">Клиническая работа</span><h1>Лечение</h1><p>Очередь пациентов, активные приёмы и клинические записи.</p></div><div className="treatment-date"><button className="secondary" onClick={()=>moveDate(-1)} aria-label="Предыдущий день">←</button><label><span>Рабочий день</span><input type="date" value={date} onChange={event=>setDate(event.target.value)}/></label><button className="secondary" onClick={()=>moveDate(1)} aria-label="Следующий день">→</button><button className="secondary" onClick={()=>setDate(todayKey())}>Сегодня</button></div></div>
    {notice&&<div className="notice" role="status">{notice}<button onClick={()=>setNotice("")}>×</button></div>}
    <section className="work-metrics"><Metric value={appointments.length} label="Записей"/><Metric value={appointments.filter(item=>item.status==="checked_in").length} label="Ожидают врача"/><Metric value={encounters.filter(item=>item.status==="in_progress").length} label="Активных приёмов"/><Metric value={encounters.filter(item=>item.status==="completed").length} label="Завершено"/></section>
    <div className="treatment-layout"><section className="treatment-queue"><header><div><span className="eyebrow">{formatDay(date)}</span><h2>Очередь приёмов</h2></div><div className="queue-filters">{(["all","waiting","active","completed"] as const).map(key=><button key={key} className={filter===key?"active":""} onClick={()=>setFilter(key)}>{filterLabel(key)}</button>)}</div></header>
      {loading?<div className="data-empty">Загружаем клиническую очередь…</div>:visible.length===0?<div className="data-empty">Для выбранного фильтра записей нет.</div>:<div className="clinical-list">{visible.map(appointment=>{
        const encounter=encounterByAppointment.get(appointment.id);return <article key={appointment.id} className={encounter?.status==="in_progress"?"active":""}><time><b>{formatTime(appointment.startsAt)}</b><span>{duration(appointment)} мин</span></time><span className="clinical-avatar">{initials(appointment.patientName)}</span><div className="clinical-person"><Link href={`/patients/${appointment.patientId}`}>{appointment.patientName}</Link><span>{appointment.reason||"Стоматологический приём"}</span><small>{appointment.doctorName}{appointment.chairName?` · ${appointment.chairName}`:""}</small></div><div className="clinical-state"><i data-status={encounter?.status||appointment.status}>{statusLabels[encounter?.status||appointment.status]??encounter?.status??appointment.status}</i>{encounter&&<small>{encounter.notesCount??0} записей · {encounter.diagnosesCount??0} диагнозов</small>}</div><div className="clinical-actions">{encounter?<button className="primary" onClick={()=>void openEncounter(encounter)}>Открыть приём</button>:appointment.status==="confirmed"&&canUpdateAppointments?<button className="secondary" onClick={()=>void transition(appointment,"check-in")}>Пациент пришёл</button>:["checked_in","in_progress"].includes(appointment.status)&&canWrite?<button className="primary" disabled={saving} onClick={()=>void startEncounter(appointment)}>Начать приём</button>:<Link href={`/patients/${appointment.patientId}`} className="button-link">Карта пациента</Link>}</div></article>})}</div>}
    </section><aside className="treatment-summary"><span className="eyebrow">Навигация по работе</span><h2>Клинический день</h2><p>Начните приём из очереди, ведите запись и подпишите её перед завершением.</p><ol><li><b>1</b><span><strong>Пациент прибыл</strong><small>Отметьте приход после подтверждения записи.</small></span></li><li><b>2</b><span><strong>Приём начат</strong><small>Откроется защищённая клиническая запись.</small></span></li><li><b>3</b><span><strong>Запись подписана</strong><small>После подписи приём можно завершить.</small></span></li></ol><Link href="/patients">Все пациенты →</Link></aside></div>
    {selected&&<div className="modal-backdrop side" onMouseDown={()=>setSelected(null)}><aside className="task-drawer encounter-drawer" onMouseDown={event=>event.stopPropagation()}><div className="modal-heading"><div><span className="eyebrow">Клинический приём</span><h2>{selected.patientName||appointments.find(item=>item.patientId===selected.patientId)?.patientName||"Пациент"}</h2></div><button onClick={()=>setSelected(null)}>×</button></div><div className="encounter-meta"><span>{statusLabels[selected.status]??selected.status}</span><time>{formatDateTime(selected.startedAt)}</time><Link href={`/patients/${selected.patientId}`}>Карта пациента ↗</Link></div>
      <section className="encounter-section"><header><h3>Клинические записи</h3><span>{selected.notes?.length??0}</span></header>{selected.notes?.length?<div className="clinical-notes">{selected.notes.map(note=><article key={note.id}><div><b>{note.title}</b><span className={`note-status ${note.status}`}>{noteStatus(note.status)}</span></div><p>{note.content}</p><footer><small>Версия {note.currentVersion}</small>{note.status==="draft"&&canSign&&<button className="secondary" disabled={saving} onClick={()=>void signNote(note)}>Подписать</button>}</footer></article>)}</div>:<div className="drawer-empty">Записей пока нет.</div>}</section>
      {selected.status==="in_progress"&&canWrite&&<form className="clinical-note-form" onSubmit={createNote}><h3>Новая запись</h3><label>Заголовок<input name="title" defaultValue="Осмотр и лечение" required/></label><label>Содержание<textarea name="content" rows={6} placeholder="Жалобы, анамнез, объективные данные, выполненное лечение и рекомендации" required/></label><button className="primary" disabled={saving}>{saving?"Сохраняем…":"Сохранить запись"}</button></form>}
      {(selected.diagnoses?.length||selected.procedures?.length)?<section className="encounter-facts"><div><b>Диагнозы</b><span>{selected.diagnoses?.length??0}</span></div><div><b>Процедуры</b><span>{selected.procedures?.length??0}</span></div></section>:null}
      {selected.status==="in_progress"&&canWrite&&<div className="encounter-complete"><p>Для завершения нужна хотя бы одна подписанная клиническая запись.</p><button className="primary" disabled={saving||!selected.notes?.some(note=>["signed","amended"].includes(note.status))} onClick={()=>void completeEncounter()}>Завершить приём</button></div>}
    </aside></div>}
  </main>;
}

function Metric({value,label}:{value:number;label:string}){return <div><b>{value}</b><span>{label}</span></div>}
function todayKey(){return localDateKey(new Date())}
function localDateKey(value:Date){const offset=value.getTimezoneOffset()*60_000;return new Date(value.getTime()-offset).toISOString().slice(0,10)}
function dayRange(key:string){const from=new Date(`${key}T00:00:00`),to=new Date(from);to.setDate(to.getDate()+1);return{from:from.toISOString(),to:to.toISOString()}}
function formatDay(key:string){return new Date(`${key}T12:00:00`).toLocaleDateString("ru-RU",{weekday:"long",day:"numeric",month:"long"})}
function formatTime(value:string){return new Date(value).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})}
function formatDateTime(value:string){return new Date(value).toLocaleString("ru-RU",{day:"numeric",month:"long",hour:"2-digit",minute:"2-digit"})}
function duration(item:Appointment){return Math.max(0,Math.round((new Date(item.endsAt).getTime()-new Date(item.startsAt).getTime())/60_000))}
function initials(name:string){return name.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join("").toUpperCase()}
function matchesFilter(appointment:Appointment,encounter:Encounter|undefined,filter:QueueFilter){if(filter==="all")return !["cancelled","no_show","rescheduled"].includes(appointment.status);if(filter==="waiting")return ["confirmed","checked_in"].includes(appointment.status)&&!encounter;if(filter==="active")return encounter?.status==="in_progress";return encounter?.status==="completed"||appointment.status==="completed"}
function filterLabel(value:QueueFilter){return({all:"Все",waiting:"Ожидают",active:"В работе",completed:"Завершены"})[value]}
function noteStatus(value:Note["status"]){return({draft:"Черновик",signed:"Подписана",amended:"Дополнена"})[value]}
function message(error:unknown){return error instanceof Error?error.message:"Не удалось выполнить запрос"}
