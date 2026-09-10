'use client';

import React from 'react';
import {
  LayoutDashboard,
  CalendarDays,
  FileHeart,
  WalletCards,
  Boxes,
  Building2,
  Users,
  ShieldAlert,
  Send,
  Sliders,
  Stethoscope,
  Sparkles,
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  highlight?: boolean;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onSelectTab }) => {
  const navSections: NavSection[] = [
    {
      title: 'УПРАВЛЕНИЕ КЛИНИКОЙ',
      items: [
        { id: 'dashboard', label: 'Главный обзор', icon: LayoutDashboard },
        { id: 'branches', label: 'Филиалы и Кресла', icon: Building2 },
        { id: 'staff', label: 'Персонал и RBAC', icon: Users },
      ],
    },
    {
      title: 'ПЛАТФОРМА & БЕЗОПАСНОСТЬ (PHASE 0)',
      items: [
        { id: 'audit', label: 'Журнал Аудита (SHA-256)', icon: ShieldAlert, highlight: true },
        { id: 'outbox', label: 'Transactional Outbox', icon: Send },
        { id: 'settings', label: 'Параметры РК (UTC+5)', icon: Sliders },
      ],
    },
    {
      title: 'КЛИНИЧЕСКИЕ МОДУЛИ (ROADMAP)',
      items: [
        { id: 'scheduling', label: 'Расписание & Визиты', icon: CalendarDays, badge: 'Phase 1' },
        { id: 'emr', label: 'ЭМК & Одонтограмма', icon: FileHeart, badge: 'Phase 2' },
        { id: 'finance', label: 'Финансы (Ledger)', icon: WalletCards, badge: 'Phase 3' },
        { id: 'inventory', label: 'Склад & Материалы', icon: Boxes, badge: 'Phase 6' },
      ],
    },
  ];

  return (
    <aside className="w-64 border-r border-slate-800 bg-slate-950 flex flex-col h-screen shrink-0 sticky top-0">
      {/* Brand & Logo */}
      <div className="h-16 flex items-center px-6 border-b border-slate-800 gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-teal-500 to-emerald-400 flex items-center justify-center shadow-lg shadow-teal-500/20 text-slate-950">
          <Stethoscope className="w-5 h-5 stroke-[2.5]" />
        </div>
        <div>
          <div className="font-extrabold text-base tracking-tight text-white flex items-center gap-1.5">
            Dental SaaS
            <span className="text-[10px] bg-teal-500/20 text-teal-400 font-bold px-1 py-0.5 rounded uppercase">
              KZ
            </span>
          </div>
          <div className="text-[10px] text-slate-400 font-medium">Медицинская платформа</div>
        </div>
      </div>

      {/* Navigation List */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {navSections.map((section, idx) => (
          <div key={idx}>
            <div className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
              {section.title}
            </div>
            <div className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onSelectTab(item.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                      isActive
                        ? 'bg-teal-600/20 text-teal-300 border border-teal-500/40 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={`w-4 h-4 ${isActive ? 'text-teal-400' : 'text-slate-400'}`} />
                      <span>{item.label}</span>
                    </div>

                    {item.badge && (
                      <span className="text-[9px] px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded font-medium border border-slate-700/60">
                        {item.badge}
                      </span>
                    )}

                    {item.highlight && !isActive && (
                      <span className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-ping" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Footer / Architecture version info */}
      <div className="p-4 border-t border-slate-800/80 bg-slate-900/30">
        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          <Sparkles className="w-3.5 h-3.5 text-teal-400" />
          <span className="font-medium text-slate-300">Phase 0 — Foundation</span>
        </div>
        <div className="text-[10px] text-slate-500 mt-0.5">
          Modular Monolith • PostgreSQL + Outbox
        </div>
      </div>
    </aside>
  );
};
