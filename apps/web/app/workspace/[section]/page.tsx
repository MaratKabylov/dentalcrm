import Link from "next/link";
import { notFound } from "next/navigation";

const modules={
  treatment:{eyebrow:"Клиническая работа",title:"Лечение",description:"Приёмы, планы лечения, клинические записи и одонтограмма.",features:["Приёмы и протоколы","Планы лечения","Диагнозы и процедуры","Одонтограмма"],api:["encounters","clinical-notes","treatment-plans","patients/{id}/odontogram"]},
  tasks:{eyebrow:"Командная работа",title:"Задачи",description:"Задачи сотрудников, комментарии, сроки и контроль исполнения.",features:["Мои задачи","Задачи команды","Комментарии","Сроки и статусы"],api:["tasks","tasks/{id}","tasks/{id}/comments"]},
  crm:{eyebrow:"Работа с обращениями",title:"CRM",description:"Лиды, воронка, активности и автоматизированные сценарии.",features:["Лиды","Воронка продаж","Активности","Автоматизация"],api:["leads","opportunities","activities","workflow-rules"]},
  finance:{eyebrow:"Управление деньгами",title:"Финансы",description:"Оплаты, начисления, возвраты, кассы и расходы клиники.",features:["Платежи и начисления","Кассовые смены","Расходы","Баланс пациентов"],api:["payments","charges","cashboxes","expenses"]},
  inventory:{eyebrow:"Материалы клиники",title:"Склад",description:"Остатки, партии, поставщики и движение материалов.",features:["Остатки","Приход и списание","Партии и сроки","Поставщики"],api:["warehouses","inventory-products","stock-documents","suppliers"]},
  analytics:{eyebrow:"Показатели клиники",title:"Аналитика",description:"Выручка, загрузка, эффективность лечения и маркетинга.",features:["Экономика кресла","Принятие планов","Маркетинг и ROAS","Складские показатели"],api:["analytics/treatment-acceptance","analytics/chair-economics","analytics/marketing-attribution","analytics/inventory"]}
} as const;

export default async function WorkspacePage({params}:{params:Promise<{section:string}>}){const {section}=await params;const item=modules[section as keyof typeof modules];if(!item)notFound();return <main className="data-page">
  <div className="page-heading"><div><span className="eyebrow">{item.eyebrow}</span><h1>{item.title}</h1><p>{item.description}</p></div><span className="module-status">API подключён · экран в разработке</span></div>
  <section className="module-overview"><div><h2>Что войдёт в раздел</h2><div className="module-feature-grid">{item.features.map((feature,index)=><article key={feature}><i>{String(index+1).padStart(2,"0")}</i><b>{feature}</b><span>Серверная логика уже реализована. Пользовательский сценарий будет подключён следующим этапом.</span></article>)}</div></div>
    <aside><span className="eyebrow">Доступно сейчас</span><h2>API модуля</h2>{item.api.map(endpoint=><code key={endpoint}>/api/v1/{endpoint}</code>)}<Link href="http://localhost:4000/docs" target="_blank">Открыть документацию API ↗</Link></aside></section>
  <div className="delivery-note"><span>Следующий экран</span><b>Раздел уже включён в общую структуру приложения</b><p>Навигация больше не прячет возможности системы. По мере подключения интерфейсов этот маршрут будет заменён рабочим экраном без изменения меню.</p></div>
  </main>}
