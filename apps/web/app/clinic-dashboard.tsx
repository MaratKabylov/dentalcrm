"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";

interface Props { apiUrl: string; tenantId: string; subject: string; }
interface Patient { id: string; firstName: string; lastName: string; phone: string; }
interface Employee { firstName: string; lastName: string; doctorId?: string; }
interface Chair { id: string; name: string; branchId: string; }
interface Appointment { id: string; startsAt: string; status: string; patientName: string; doctorName: string; chairName?: string; reason?: string; }

const statusLabels: Record<string, string> = { created: "Создана", awaiting_confirmation: "Ждёт подтверждения",
  confirmed: "Подтверждена", checked_in: "Пациент пришёл", in_progress: "Идёт приём", completed: "Завершена",
  cancelled: "Отменена", no_show: "Неявка", rescheduled: "Перенесена" };
const nextAction: Record<string, [string, string] | undefined> = { created: ["confirm", "Подтвердить"],
  awaiting_confirmation: ["confirm", "Подтвердить"], confirmed: ["check-in", "Отметить приход"],
  checked_in: ["start", "Начать приём"], in_progress: ["complete", "Завершить"] };

export function ClinicDashboard({ apiUrl, tenantId, subject }: Props) {
  const [patients, setPatients] = useState<Patient[]>([]); const [employees, setEmployees] = useState<Employee[]>([]);
  const [chairs, setChairs] = useState<Chair[]>([]); const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [notice, setNotice] = useState(""); const [loading, setLoading] = useState(Boolean(tenantId));
  const doctors = employees.filter((employee) => employee.doctorId); const range = useMemo(() => weekRange(new Date()), []);
  const headers = useMemo(() => ({ "content-type": "application/json", "x-tenant-id": tenantId, "x-user-subject": subject }), [tenantId, subject]);
  const request = useCallback(async <T,>(path: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(`${apiUrl}${path}`, { ...init, headers: { ...headers, ...init?.headers } });
    const body = await response.json() as T & { error?: { message?: string } };
    if (!response.ok) throw new Error(body.error?.message ?? "API request failed"); return body;
  }, [apiUrl, headers]);
  const load = useCallback(async () => {
    if (!tenantId) return; setLoading(true);
    try { const [p, e, c, a] = await Promise.all([request<Patient[]>("/patients"), request<Employee[]>("/employees"),
      request<Chair[]>("/chairs"), request<Appointment[]>(`/appointments?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`)]);
      setPatients(p); setEmployees(e); setChairs(c); setAppointments(a); setNotice("");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Не удалось загрузить данные"); } finally { setLoading(false); }
  }, [range, request, tenantId]);
  useEffect(() => { void load(); }, [load]);

  async function createPatient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const element = event.currentTarget; const form = new FormData(element);
    try { await request("/patients", { method: "POST", body: JSON.stringify({ lastName: form.get("lastName"), firstName: form.get("firstName"), phone: form.get("phone") }) });
      element.reset(); await load(); setNotice("Пациент добавлен"); } catch (error) { setNotice(message(error)); }
  }
  async function createAppointment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const element = event.currentTarget; const form = new FormData(element);
    const doctor = doctors.find((item) => item.doctorId === form.get("doctorId")); const chair = chairs.find((item) => item.id === form.get("chairId"));
    if (!doctor || !chair) { setNotice("Выберите врача и кресло"); return; }
    const starts = new Date(String(form.get("startsAt"))); const ends = new Date(starts.getTime() + Number(form.get("duration")) * 60_000);
    try { await request("/appointments", { method: "POST", body: JSON.stringify({ patientId: form.get("patientId"), doctorId: doctor.doctorId,
      branchId: chair.branchId, chairId: chair.id, startsAt: starts.toISOString(), endsAt: ends.toISOString(), reason: form.get("reason"), source: "internal", serviceIds: [] }) });
      element.reset(); await load(); setNotice("Запись создана"); } catch (error) { setNotice(message(error)); }
  }
  async function transition(appointment: Appointment, action: string) {
    try { await request(`/appointments/${appointment.id}/${action}`, { method: "POST", body: "{}" }); await load(); }
    catch (error) { setNotice(message(error)); }
  }
  if (!tenantId) return <Setup apiUrl={apiUrl} />;
  return <main className="app-shell">
    <header className="app-header"><div><div className="brand"><span className="brand-mark">D</span> Dental SaaS</div><p>Clinic Core · рабочая неделя</p></div><nav className="top-nav"><Link className="active" href="/">Расписание</Link><Link href="/settings">Настройки</Link></nav><div className="header-actions"><span className="live-dot" /> API подключён <span className="avatar">LO</span></div></header>
    {notice && <div className="notice" role="status">{notice}</div>}
    <section className="metrics"><Metric value={appointments.length} label="Записей на неделе"/><Metric value={appointments.filter((item) => item.status === "confirmed").length} label="Подтверждено"/><Metric value={patients.length} label="Пациентов"/><Metric value={doctors.length} label="Врачей"/></section>
    <section className="workspace"><div className="calendar-panel"><div className="section-title"><div><span>Расписание</span><h1>{formatRange(range.from, range.to)}</h1></div><span className="phase">Phase 1</span></div>
      {loading ? <div className="empty">Загружаем календарь…</div> : appointments.length === 0 ? <div className="empty">На этой неделе записей пока нет. Создайте первую справа.</div> :
        <div className="appointment-list">{appointments.map((appointment) => { const action = nextAction[appointment.status]; return <article className="appointment" key={appointment.id}>
          <time><b>{new Date(appointment.startsAt).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})}</b><span>{new Date(appointment.startsAt).toLocaleDateString("ru-RU",{weekday:"short",day:"2-digit",month:"short"})}</span></time>
          <div className="appointment-main"><b>{appointment.patientName}</b><span>{appointment.reason || "Приём"} · {appointment.doctorName}</span></div><div className="appointment-resource"><span>{appointment.chairName || "Без кресла"}</span><i data-status={appointment.status}>{statusLabels[appointment.status] ?? appointment.status}</i></div>
          {action && <button className="action" onClick={() => void transition(appointment,action[0])}>{action[1]}</button>}</article>; })}</div>}
      </div><aside className="side-panel"><form onSubmit={createAppointment} className="form-card"><h2>Новая запись</h2>
        <label>Пациент<select name="patientId" required defaultValue=""><option value="" disabled>Выберите пациента</option>{patients.map((p)=><option value={p.id} key={p.id}>{p.lastName} {p.firstName}</option>)}</select></label>
        <label>Врач<select name="doctorId" required defaultValue=""><option value="" disabled>Выберите врача</option>{doctors.map((d)=><option value={d.doctorId} key={d.doctorId}>{d.lastName} {d.firstName}</option>)}</select></label>
        <div className="form-row"><label>Дата и время<input name="startsAt" type="datetime-local" required/></label><label>Минут<input name="duration" type="number" min="5" max="720" defaultValue="30" required/></label></div>
        <label>Кресло<select name="chairId" required defaultValue=""><option value="" disabled>Выберите кресло</option>{chairs.map((c)=><option value={c.id} key={c.id}>{c.name}</option>)}</select></label><label>Причина<input name="reason" placeholder="Консультация"/></label><button className="primary" type="submit">Создать запись</button></form>
        <form onSubmit={createPatient} className="form-card compact"><h2>Быстрый пациент</h2><div className="form-row"><label>Фамилия<input name="lastName" required/></label><label>Имя<input name="firstName" required/></label></div><label>Телефон<input name="phone" type="tel" required/></label><button className="secondary" type="submit">Добавить пациента</button></form>
      </aside></section></main>;
}
function Metric({value,label}:{value:number;label:string}) { return <div className="metric"><b>{value}</b><span>{label}</span></div>; }
function Setup({apiUrl}:{apiUrl:string}) { return <main className="setup"><div className="brand"><span className="brand-mark">D</span> Dental SaaS</div><span className="phase">Phase 1 · Clinic Core</span><h1>Календарь готов к работе.</h1><p>Запустите миграцию и seed, затем укажите выданный <code>tenantId</code> в <code>NEXT_PUBLIC_DEMO_TENANT_ID</code> для web-приложения.</p><pre>{`npm run infra:up\nnpm run db:migrate\nnpm run db:seed\n# API: ${apiUrl}`}</pre></main>; }
function weekRange(now:Date){const from=new Date(now);from.setDate(from.getDate()-((from.getDay()+6)%7));from.setHours(0,0,0,0);const to=new Date(from);to.setDate(to.getDate()+7);return{from:from.toISOString(),to:to.toISOString()};}
function formatRange(from:string,to:string){const start=new Date(from);const end=new Date(to);end.setDate(end.getDate()-1);return `${start.toLocaleDateString("ru-RU",{day:"numeric",month:"long"})} — ${end.toLocaleDateString("ru-RU",{day:"numeric",month:"long",year:"numeric"})}`;}
function message(error:unknown){return error instanceof Error?error.message:"Ошибка";}
