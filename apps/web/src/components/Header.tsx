'use client';

import React from 'react';
import {
  Building2,
  ShieldCheck,
  Bell,
  Search,
  CheckCircle2,
  MapPin,
  ChevronDown,
} from 'lucide-react';

interface HeaderProps {
  currentTenant: string;
  currentBranch: string;
  onBranchChange: (branch: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTenant,
  currentBranch,
  onBranchChange,
}) => {
  return (
    <header className="h-16 border-b border-slate-800 bg-slate-900/80 backdrop-blur px-6 flex items-center justify-between sticky top-0 z-30">
      {/* Left: Tenant and Branch Switcher */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2.5 bg-slate-800/80 border border-slate-700/60 px-3 py-1.5 rounded-lg shadow-sm">
          <Building2 className="w-4 h-4 text-teal-400" />
          <span className="text-sm font-semibold text-white">{currentTenant}</span>
          <span className="text-xs bg-teal-500/20 text-teal-300 font-medium px-1.5 py-0.5 rounded border border-teal-500/30">
            SaaS Tenant
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400">
          <MapPin className="w-3.5 h-3.5 text-slate-500" />
          <span>Филиал:</span>
          <select
            value={currentBranch}
            onChange={(e) => onBranchChange(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded px-2.5 py-1 focus:outline-none focus:border-teal-500"
          >
            <option value="Самал (Алматы)">Самал (Алматы)</option>
            <option value="Нурлы Тау (Алматы)">Нурлы Тау (Алматы)</option>
            <option value="Левый Берег (Астана)">Левый Берег (Астана)</option>
          </select>
        </div>
      </div>

      {/* Right: Security Indicator, Search, Notification, Profile */}
      <div className="flex items-center gap-4">
        {/* Kazakhstan Compliance & Security badge */}
        <div className="hidden md:flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-800/50 px-2.5 py-1 rounded-full">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>РК Регламент • Аудит активен</span>
        </div>

        {/* Global Search Bar */}
        <div className="relative hidden lg:block">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Поиск по пациентам, ИИН или креслам..."
            className="bg-slate-800/80 border border-slate-700 text-slate-200 text-xs rounded-lg pl-9 pr-4 py-2 w-64 focus:outline-none focus:border-teal-500 placeholder:text-slate-500"
          />
        </div>

        {/* Notifications */}
        <button
          type="button"
          className="relative p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          title="Уведомления"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-teal-500 rounded-full animate-pulse" />
        </button>

        {/* User Profile */}
        <div className="flex items-center gap-3 pl-3 border-l border-slate-800">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-teal-600 to-cyan-500 flex items-center justify-center font-bold text-xs text-white shadow-inner">
            ДА
          </div>
          <div className="hidden sm:block text-left">
            <div className="text-xs font-semibold text-slate-200">Д-р Ахметов М.</div>
            <div className="text-[11px] text-teal-400 font-medium">Главный Врач / Владелец</div>
          </div>
        </div>
      </div>
    </header>
  );
};
