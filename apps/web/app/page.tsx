const foundations = [
  ["01", "Tenant isolation", "Tenant определяется auth-контекстом и повторно ограничивается PostgreSQL RLS."],
  ["02", "RBAC", "Права назначаются membership через роли; API проверяет их до выполнения use case."],
  ["03", "Audit", "Чувствительные действия оставляют хешированный, недоступный для изменения журнал."],
  ["04", "Outbox", "Доменные события фиксируются в одной транзакции с бизнес-данными."]
] as const;

export default function Home() {
  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">D</span> Dental SaaS</div>
        <span className="phase">Phase 0 · Foundation</span>
      </header>

      <section className="hero">
        <div>
          <div className="eyebrow">Kazakhstan-first clinic platform</div>
          <h1>Надёжное ядро клиники.</h1>
          <p className="lead">
            Модульная SaaS-платформа для стоматологии: единый контекст пациента, клинические процессы,
            расписание и финансы — на фундаменте строгой изоляции данных.
          </p>
        </div>
        <aside className="status-card" aria-label="Foundation status">
          <div className="status-row"><span>API contract</span><span className="dot" /></div>
          <div className="status-row"><span>PostgreSQL + RLS</span><span className="dot" /></div>
          <div className="status-row"><span>Audit trail</span><span className="dot" /></div>
          <div className="status-row"><span>Transactional outbox</span><span className="dot" /></div>
        </aside>
      </section>

      <section className="grid" aria-label="Foundation capabilities">
        {foundations.map(([number, title, description]) => (
          <article className="card" key={number}>
            <div className="number">{number}</div>
            <h2>{title}</h2>
            <p>{description}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
