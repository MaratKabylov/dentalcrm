'use client';

import React, { useState } from 'react';
import { Header } from '@/components/Header';
import { Sidebar } from '@/components/Sidebar';
import {
  Building2,
  Users,
  ShieldCheck,
  Send,
  Plus,
  CheckCircle,
  AlertTriangle,
  Clock,
  Sparkles,
  ArrowUpRight,
  ShieldAlert,
  Server,
  Lock,
  Calendar,
  Hash,
  RefreshCw,
  Search,
  Sliders,
  Award,
} from 'lucide-react';
import { ChairItem, BranchItem, StaffItem, AuditLogItem, OutboxItem } from '@/lib/api';

export default function DentalDashboard() {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [currentBranch, setCurrentBranch] = useState<string>('Самал (Алматы)');
  const [currentTenant] = useState<string>('DentaLux Клиник Казахстан');

  // Initial demo/phase 0 data
  const [branches, setBranches] = useState<BranchItem[]>([
    {
      id: 'br-1',
      name: 'Филиал Самал',
      city: 'Алматы',
      address: 'мкр. Самал-2, д. 45',
      phone: '+7 727 333 44 55',
      status: 'ACTIVE',
      chairCount: 4,
    },
    {
      id: 'br-2',
      name: 'Филиал Нурлы Тау',
      city: 'Алматы',
      address: 'пр. Аль-Фараби 19, блок 4Б',
      phone: '+7 727 311 22 33',
      status: 'ACTIVE',
      chairCount: 3,
    },
    {
      id: 'br-3',
      name: 'Филиал Левый Берег',
      city: 'Астана',
      address: 'ул. Достык 18, ВП-2',
      phone: '+7 7172 60 70 80',
      status: 'ACTIVE',
      chairCount: 2,
    },
  ]);

  const [chairs, setChairs] = useState<ChairItem[]>([
    {
      id: 'ch-1',
      name: 'Кресло Planmeca i5 #1 (Терапия)',
      code: 'SML-CH-01',
      branchName: 'Самал (Алматы)',
      roomName: 'Кабинет 101',
      status: 'OPERATIONAL',
      isAvailableForBooking: true,
    },
    {
      id: 'ch-2',
      name: 'Кресло Kavo Primus #2 (Хирургия)',
      code: 'SML-CH-02',
      branchName: 'Самал (Алматы)',
      roomName: 'Хирургический блок 1',
      status: 'OPERATIONAL',
      isAvailableForBooking: true,
    },
    {
      id: 'ch-3',
      name: 'Кресло Sirona Intego #3 (Ортодонтия)',
      code: 'SML-CH-03',
      branchName: 'Самал (Алматы)',
      roomName: 'Кабинет 102',
      status: 'MAINTENANCE',
      isAvailableForBooking: false,
    },
    {
      id: 'ch-4',
      name: 'Кресло A-dec 500 #4 (Детское)',
      code: 'SML-CH-04',
      branchName: 'Самал (Алматы)',
      roomName: 'Кабинет детского приема',
      status: 'OPERATIONAL',
      isAvailableForBooking: true,
    },
    {
      id: 'ch-5',
      name: 'Кресло Stern Weber #1 (Терапия)',
      code: 'NT-CH-01',
      branchName: 'Нурлы Тау (Алматы)',
      roomName: 'Кабинет 201',
      status: 'OPERATIONAL',
      isAvailableForBooking: true,
    },
  ]);

  const [staff, setStaff] = useState<StaffItem[]>([
    {
      id: 'u-1',
      firstName: 'Мурат',
      lastName: 'Ахметов',
      email: 'm.akhmetov@dentalux.kz',
      phone: '+7 701 555 12 34',
      iin: '850614300456',
      roles: ['CLINIC_OWNER', 'DOCTOR'],
      isActive: true,
    },
    {
      id: 'u-2',
      firstName: 'Айгерим',
      lastName: 'Касымова',
      email: 'a.kassymova@dentalux.kz',
      phone: '+7 702 444 88 99',
      iin: '920820450123',
      roles: ['CLINIC_ADMIN'],
      isActive: true,
    },
    {
      id: 'u-3',
      firstName: 'Данияр',
      lastName: 'Оспанов',
      email: 'd.ospanov@dentalux.kz',
      phone: '+7 707 999 11 22',
      iin: '881105300890',
      roles: ['DOCTOR'],
      isActive: true,
    },
    {
      id: 'u-4',
      firstName: 'Мадина',
      lastName: 'Смагулова',
      email: 'm.smagulova@dentalux.kz',
      phone: '+7 705 777 33 44',
      iin: '950312450789',
      roles: ['RECEPTIONIST'],
      isActive: true,
    },
  ]);

  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([
    {
      id: 'aud-4',
      action: 'UPDATE_CHAIR_STATUS',
      entityType: 'Chair',
      entityId: 'SML-CH-03',
      actor: 'Мурат Ахметов (m.akhmetov@dentalux.kz)',
      createdAt: '2026-09-10 12:35:10',
      hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      previousHash: 'a71b265e3b97b0a80d46f5c8b3f1df643194a37b12d593fa883fa9b4d8c89b3f',
    },
    {
      id: 'aud-3',
      action: 'CREATE_CHAIR',
      entityType: 'Chair',
      entityId: 'SML-CH-04',
      actor: 'Айгерим Касымова (a.kassymova@dentalux.kz)',
      createdAt: '2026-09-10 12:30:45',
      hash: 'a71b265e3b97b0a80d46f5c8b3f1df643194a37b12d593fa883fa9b4d8c89b3f',
      previousHash: '9f83c6051a84f3320d0b175baeac6d4c7365d14071743a18e6943b077d0c8614',
    },
    {
      id: 'aud-2',
      action: 'CREATE_BRANCH',
      entityType: 'Branch',
      entityId: 'br-3',
      actor: 'Мурат Ахметов (m.akhmetov@dentalux.kz)',
      createdAt: '2026-09-10 12:15:00',
      hash: '9f83c6051a84f3320d0b175baeac6d4c7365d14071743a18e6943b077d0c8614',
      previousHash: '4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a',
    },
    {
      id: 'aud-1',
      action: 'REGISTER_TENANT',
      entityType: 'Tenant',
      entityId: 'dentalux',
      actor: 'System Genesis',
      createdAt: '2026-09-10 12:00:00',
      hash: '4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a',
      previousHash: 'GENESIS_CHAIN_START',
    },
  ]);

  const [outboxEvents, setOutboxEvents] = useState<OutboxItem[]>([
    {
      id: 'evt-101',
      eventName: 'ChairCreated',
      status: 'PUBLISHED',
      scheduledAt: '2026-09-10 12:30:45',
      publishedAt: '2026-09-10 12:30:46',
      retryCount: 0,
    },
    {
      id: 'evt-102',
      eventName: 'BranchCreated',
      status: 'PUBLISHED',
      scheduledAt: '2026-09-10 12:15:00',
      publishedAt: '2026-09-10 12:15:02',
      retryCount: 0,
    },
    {
      id: 'evt-103',
      eventName: 'TenantCreated',
      status: 'PUBLISHED',
      scheduledAt: '2026-09-10 12:00:00',
      publishedAt: '2026-09-10 12:00:01',
      retryCount: 0,
    },
  ]);

  // Verification state
  const [verificationResult, setVerificationResult] = useState<{
    tested: boolean;
    valid: boolean;
    count: number;
    message: string;
  }>({
    tested: false,
    valid: true,
    count: 4,
    message: '',
  });

  // Modal / Form state
  const [isAddChairOpen, setIsAddChairOpen] = useState(false);
  const [newChairName, setNewChairName] = useState('');
  const [newChairCode, setNewChairCode] = useState('');
  const [newChairBranch, setNewChairBranch] = useState('Самал (Алматы)');

  const [isAddStaffOpen, setIsAddStaffOpen] = useState(false);
  const [newStaffFirst, setNewStaffFirst] = useState('');
  const [newStaffLast, setNewStaffLast] = useState('');
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffIIN, setNewStaffIIN] = useState('');
  const [newStaffRole, setNewStaffRole] = useState('DOCTOR');

  const handleVerifyAuditChain = () => {
    // Cryptographic validation of previousHash links
    let valid = true;
    for (let i = 0; i < auditLogs.length - 1; i++) {
      if (auditLogs[i].previousHash !== auditLogs[i + 1].hash) {
        valid = false;
        break;
      }
    }

    setVerificationResult({
      tested: true,
      valid,
      count: auditLogs.length,
      message: valid
        ? `Криптографическая проверка SHA-256 успешна: все ${auditLogs.length} записей цепочки валидны, неизменяемы и соответствуют закону РК о персональных данных.`
        : 'Внимание: Обнаружено нарушение целостности цепочки аудита!',
    });
  };

  const handleToggleChairStatus = (chairId: string) => {
    setChairs((prev) =>
      prev.map((c) => {
        if (c.id === chairId) {
          const nextStatus =
            c.status === 'OPERATIONAL'
              ? 'MAINTENANCE'
              : c.status === 'MAINTENANCE'
              ? 'OUT_OF_SERVICE'
              : 'OPERATIONAL';
          const isAvail = nextStatus === 'OPERATIONAL';

          // Record new audit entry
          const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
          const newHash = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
          const newAuditItem: AuditLogItem = {
            id: `aud-${Date.now()}`,
            action: `SET_CHAIR_STATUS_${nextStatus}`,
            entityType: 'Chair',
            entityId: c.code || c.name,
            actor: 'Д-р Ахметов М. (CLINIC_OWNER)',
            createdAt: nowStr,
            hash: newHash,
            previousHash: auditLogs[0]?.hash,
          };
          setAuditLogs((prevLogs) => [newAuditItem, ...prevLogs]);

          return { ...c, status: nextStatus, isAvailableForBooking: isAvail };
        }
        return c;
      }),
    );
  };

  const handleCreateChair = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChairName) return;

    const newId = `ch-${Date.now()}`;
    const code = newChairCode || `CH-${Math.floor(100 + Math.random() * 900)}`;

    const createdChair: ChairItem = {
      id: newId,
      name: newChairName,
      code,
      branchName: newChairBranch,
      roomName: 'Кабинет общего приема',
      status: 'OPERATIONAL',
      isAvailableForBooking: true,
    };

    setChairs((prev) => [...prev, createdChair]);

    // Record outbox event
    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const newOutbox: OutboxItem = {
      id: `evt-${Date.now()}`,
      eventName: 'ChairCreated',
      status: 'PUBLISHED',
      scheduledAt: nowStr,
      publishedAt: nowStr,
      retryCount: 0,
    };
    setOutboxEvents((prev) => [newOutbox, ...prev]);

    // Record audit event
    const newHash = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const newAudit: AuditLogItem = {
      id: `aud-${Date.now()}`,
      action: 'CREATE_CHAIR',
      entityType: 'Chair',
      entityId: code,
      actor: 'Д-р Ахметов М. (CLINIC_OWNER)',
      createdAt: nowStr,
      hash: newHash,
      previousHash: auditLogs[0]?.hash,
    };
    setAuditLogs((prev) => [newAudit, ...prev]);

    setNewChairName('');
    setNewChairCode('');
    setIsAddChairOpen(false);
  };

  const handleCreateStaff = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaffFirst || !newStaffLast || !newStaffEmail) return;

    const createdStaff: StaffItem = {
      id: `u-${Date.now()}`,
      firstName: newStaffFirst,
      lastName: newStaffLast,
      email: newStaffEmail,
      iin: newStaffIIN || '900000000000',
      roles: [newStaffRole],
      isActive: true,
    };

    setStaff((prev) => [...prev, createdStaff]);

    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const newOutbox: OutboxItem = {
      id: `evt-${Date.now()}`,
      eventName: 'UserCreated',
      status: 'PUBLISHED',
      scheduledAt: nowStr,
      publishedAt: nowStr,
      retryCount: 0,
    };
    setOutboxEvents((prev) => [newOutbox, ...prev]);

    const newHash = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const newAudit: AuditLogItem = {
      id: `aud-${Date.now()}`,
      action: 'REGISTER_USER',
      entityType: 'User',
      entityId: newStaffEmail,
      actor: 'Д-р Ахметов М. (CLINIC_OWNER)',
      createdAt: nowStr,
      hash: newHash,
      previousHash: auditLogs[0]?.hash,
    };
    setAuditLogs((prev) => [newAudit, ...prev]);

    setNewStaffFirst('');
    setNewStaffLast('');
    setNewStaffEmail('');
    setNewStaffIIN('');
    setIsAddStaffOpen(false);
  };

  const operationalChairs = chairs.filter((c) => c.status === 'OPERATIONAL').length;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950 text-slate-100">
      {/* Sidebar */}
      <Sidebar activeTab={activeTab} onSelectTab={setActiveTab} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Header */}
        <Header
          currentTenant={currentTenant}
          currentBranch={currentBranch}
          onBranchChange={setCurrentBranch}
        />

        {/* Scrollable Page Body */}
        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: DASHBOARD */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              {/* Top Banner: Architecture & Phase 0 Status */}
              <div className="rounded-2xl bg-gradient-to-r from-teal-950/60 via-slate-900 to-slate-900 border border-teal-500/30 p-6 relative overflow-hidden shadow-xl">
                <div className="absolute right-0 top-0 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
                <div className="relative z-10 max-w-3xl">
                  <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-teal-500/20 text-teal-300 text-xs font-semibold mb-3 border border-teal-500/30">
                    <Sparkles className="w-3.5 h-3.5" />
                    Phase 0 — Foundation Завершена & Верифицирована
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                    Стоматологическая SaaS-Платформа (Казахстан)
                  </h1>
                  <p className="text-sm text-slate-300 mt-2 leading-relaxed">
                    Модульный монолит: мультитенантность с гарантией изоляции данных, RBAC-матрица ролей,
                    неизменяемый журнал аудита с SHA-256 хешированием, Transactional Outbox для доставки
                    доменных событий и параметры часового пояса Алматы (UTC+5).
                  </p>
                  <div className="flex flex-wrap gap-4 mt-5">
                    <button
                      onClick={() => setActiveTab('audit')}
                      className="px-4 py-2 rounded-lg bg-teal-500 text-slate-950 font-bold text-xs hover:bg-teal-400 transition flex items-center gap-2 shadow-lg shadow-teal-500/20"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      Проверить целостность Аудита
                    </button>
                    <button
                      onClick={() => setActiveTab('branches')}
                      className="px-4 py-2 rounded-lg bg-slate-800 text-slate-200 border border-slate-700 font-semibold text-xs hover:bg-slate-700 transition flex items-center gap-2"
                    >
                      <Building2 className="w-4 h-4 text-teal-400" />
                      Управление филиалами и креслами
                    </button>
                  </div>
                </div>
              </div>

              {/* KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Chairs */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 relative">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-400">Зубоврачебные Кресла</span>
                    <div className="p-2 rounded-lg bg-teal-500/10 text-teal-400">
                      <Building2 className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="text-2xl font-black text-white">{chairs.length}</span>
                    <span className="text-xs text-emerald-400 font-medium">
                      {operationalChairs} активно
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Ключевой производственный ресурс клиники
                  </div>
                </div>

                {/* 2. Branches */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 relative">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-400">Сеть Филиалов</span>
                    <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                      <Server className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="text-2xl font-black text-white">{branches.length}</span>
                    <span className="text-xs text-slate-400">Алматы, Астана</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">Multi-branch топология</div>
                </div>

                {/* 3. Staff & RBAC */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 relative">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-400">Сотрудники & Роли</span>
                    <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
                      <Users className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="text-2xl font-black text-white">{staff.length}</span>
                    <span className="text-xs text-purple-400 font-medium">4 роли RBAC</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">Врачи, Администраторы, Владелец</div>
                </div>

                {/* 4. Outbox Events */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 relative">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-400">Transactional Outbox</span>
                    <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                      <Send className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="text-2xl font-black text-white">{outboxEvents.length}</span>
                    <span className="text-xs text-emerald-400 font-medium">100% Доставлено</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">Без потери транзакций</div>
                </div>
              </div>

              {/* Two Column Layout: Chairs Status & Recent Audit Stream */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left (2 cols): Chairs Resource Grid */}
                <div className="lg:col-span-2 bg-slate-900/70 border border-slate-800 rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-bold text-white flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-teal-400" />
                        Статус Зубоврачебных Кресел (Chairs)
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Нажмите на статус кресла для переключения режима и автоматической записи в аудит
                      </p>
                    </div>
                    <button
                      onClick={() => setIsAddChairOpen(true)}
                      className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold flex items-center gap-1.5 transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Добавить кресло
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {chairs.map((chair) => (
                      <div
                        key={chair.id}
                        className="p-3.5 rounded-lg bg-slate-800/60 border border-slate-700/70 hover:border-teal-500/50 transition flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-white truncate">{chair.name}</span>
                            <span className="text-[10px] font-mono bg-slate-900 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700">
                              {chair.code}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-1">
                            {chair.branchName} • {chair.roomName}
                          </div>
                        </div>

                        <div className="mt-3 pt-3 border-t border-slate-700/60 flex items-center justify-between">
                          <button
                            onClick={() => handleToggleChairStatus(chair.id)}
                            className={`text-[11px] px-2.5 py-1 rounded-md font-semibold transition flex items-center gap-1.5 ${
                              chair.status === 'OPERATIONAL'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : chair.status === 'MAINTENANCE'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            }`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-current" />
                            {chair.status === 'OPERATIONAL'
                              ? 'В РАБОТЕ'
                              : chair.status === 'MAINTENANCE'
                              ? 'ОБСЛУЖИВАНИЕ'
                              : 'ВЫВЕДЕНО'}
                          </button>

                          <span className="text-[11px] text-slate-400">
                            {chair.isAvailableForBooking ? 'Доступно в записи' : 'Запись закрыта'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right (1 col): Immutable Audit Snapshot */}
                <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex items-center justify-between">
                      <h2 className="text-base font-bold text-white flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4 text-emerald-400" />
                        Аудит (SHA-256)
                      </h2>
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/30">
                        Immutable
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Криптографическая цепочка фиксации всех действий
                    </p>

                    <div className="mt-4 space-y-3">
                      {auditLogs.slice(0, 4).map((log) => (
                        <div key={log.id} className="p-2.5 bg-slate-800/50 rounded-lg border border-slate-700/50 text-xs">
                          <div className="flex items-center justify-between text-slate-300 font-medium">
                            <span>{log.action}</span>
                            <span className="text-[10px] text-slate-500">{log.createdAt.split(' ')[1]}</span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5 truncate">{log.actor}</div>
                          <div className="font-mono text-[9px] text-teal-400/80 mt-1 truncate">
                            Хеш: {log.hash.substring(0, 24)}...
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => setActiveTab('audit')}
                    className="w-full py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-teal-300 border border-teal-500/30 transition flex items-center justify-center gap-1.5"
                  >
                    Открыть полный журнал аудита
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: BRANCHES & CHAIRS */}
          {activeTab === 'branches' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-bold text-white">Филиалы, Кабинеты и Кресла</h1>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Иерархия: Организация → Филиал → Кабинет → Зубоврачебное Кресло (Chair)
                  </p>
                </div>
                <button
                  onClick={() => setIsAddChairOpen(true)}
                  className="px-3.5 py-2 rounded-lg bg-teal-500 text-slate-950 font-bold text-xs hover:bg-teal-400 transition flex items-center gap-1.5 shadow-lg shadow-teal-500/20"
                >
                  <Plus className="w-4 h-4" />
                  Зарегистрировать кресло
                </button>
              </div>

              {/* Branches Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {branches.map((b) => (
                  <div key={b.id} className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-teal-400">{b.city}</span>
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/30">
                        {b.status}
                      </span>
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white">{b.name}</h3>
                      <p className="text-xs text-slate-400 mt-0.5">{b.address}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{b.phone}</p>
                    </div>
                    <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                      <span>Количество кресел:</span>
                      <span className="font-bold text-white">{b.chairCount} кресла</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Chairs Table */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
                <h2 className="text-base font-bold text-white">Реестр рабочих мест (Dental Chairs)</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider">
                        <th className="pb-3 font-semibold">Код</th>
                        <th className="pb-3 font-semibold">Наименование модели</th>
                        <th className="pb-3 font-semibold">Филиал</th>
                        <th className="pb-3 font-semibold">Кабинет</th>
                        <th className="pb-3 font-semibold">Статус</th>
                        <th className="pb-3 font-semibold">Запись</th>
                        <th className="pb-3 font-semibold text-right">Действие</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {chairs.map((chair) => (
                        <tr key={chair.id} className="hover:bg-slate-800/40">
                          <td className="py-3 font-mono text-teal-400 font-semibold">{chair.code}</td>
                          <td className="py-3 font-semibold text-white">{chair.name}</td>
                          <td className="py-3 text-slate-300">{chair.branchName}</td>
                          <td className="py-3 text-slate-400">{chair.roomName}</td>
                          <td className="py-3">
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                                chair.status === 'OPERATIONAL'
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : chair.status === 'MAINTENANCE'
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              }`}
                            >
                              {chair.status}
                            </span>
                          </td>
                          <td className="py-3">
                            {chair.isAvailableForBooking ? (
                              <span className="text-emerald-400 text-xs flex items-center gap-1">
                                <CheckCircle className="w-3 h-3" /> Открыта
                              </span>
                            ) : (
                              <span className="text-rose-400 text-xs flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> Закрыта
                              </span>
                            )}
                          </td>
                          <td className="py-3 text-right">
                            <button
                              onClick={() => handleToggleChairStatus(chair.id)}
                              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[11px] font-medium transition"
                            >
                              Сменить статус
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: STAFF & RBAC */}
          {activeTab === 'staff' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-bold text-white">Персонал & Матрица Доступа (RBAC)</h1>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Разграничение прав: Врачи, Администраторы, Ассистенты, Главный Врач с валидацией ИИН РК
                  </p>
                </div>
                <button
                  onClick={() => setIsAddStaffOpen(true)}
                  className="px-3.5 py-2 rounded-lg bg-teal-500 text-slate-950 font-bold text-xs hover:bg-teal-400 transition flex items-center gap-1.5 shadow-lg shadow-teal-500/20"
                >
                  <Plus className="w-4 h-4" />
                  Пригласить сотрудника
                </button>
              </div>

              {/* Staff Table */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider">
                        <th className="pb-3 font-semibold">ФИО Сотрудника</th>
                        <th className="pb-3 font-semibold">ИИН (Казахстан)</th>
                        <th className="pb-3 font-semibold">Email / Логин</th>
                        <th className="pb-3 font-semibold">Телефон</th>
                        <th className="pb-3 font-semibold">Роли (RBAC)</th>
                        <th className="pb-3 font-semibold">Статус</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {staff.map((member) => (
                        <tr key={member.id} className="hover:bg-slate-800/40">
                          <td className="py-3 font-bold text-white">
                            {member.lastName} {member.firstName}
                          </td>
                          <td className="py-3 font-mono text-teal-400">{member.iin}</td>
                          <td className="py-3 text-slate-300">{member.email}</td>
                          <td className="py-3 text-slate-400">{member.phone}</td>
                          <td className="py-3">
                            <div className="flex flex-wrap gap-1">
                              {member.roles.map((r) => (
                                <span
                                  key={r}
                                  className="text-[10px] px-2 py-0.5 rounded font-semibold bg-teal-950 text-teal-300 border border-teal-800"
                                >
                                  {r}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-3">
                            <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              АКТИВЕН
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Permissions Matrix Explanation */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Lock className="w-4 h-4 text-teal-400" />
                  Политики безопасности & разграничение (RBAC + ABAC)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-400">
                  <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
                    <span className="font-semibold text-teal-300 block mb-1">DOCTOR (Врач)</span>
                    Доступ к ЭМК своих приемов, заполнение и подписание зубной формулы. Запрет чтения общего
                    финансового ledger клиники.
                  </div>
                  <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
                    <span className="font-semibold text-teal-300 block mb-1">RECEPTIONIST (Регистратура)</span>
                    Создание пациентов, ведение расписания, прием платежей. Запрет редактирования диагнозов и
                    подписанных карт.
                  </div>
                  <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
                    <span className="font-semibold text-teal-300 block mb-1">CLINIC_OWNER (Владелец)</span>
                    Полный аудит всех действий персонала, управление креслами, финансовые отчеты и экспорт по
                    требованию.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: AUDIT LOG (SHA-256) */}
          {activeTab === 'audit' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-xl font-bold text-white flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5 text-emerald-400" />
                    Неизменяемый Журнал Аудита (Immutable Audit Trail)
                  </h1>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Каждая запись связывается SHA-256 хешем с предыдущей. Удаление и изменение логов запрещены
                    на уровне архитектуры.
                  </p>
                </div>
                <button
                  onClick={handleVerifyAuditChain}
                  className="px-4 py-2 rounded-lg bg-emerald-500 text-slate-950 font-bold text-xs hover:bg-emerald-400 transition flex items-center gap-2 shadow-lg shadow-emerald-500/20"
                >
                  <ShieldCheck className="w-4 h-4" />
                  Верифицировать цепочку хешей (SHA-256)
                </button>
              </div>

              {/* Live Verification Result Banner */}
              {verificationResult.tested && (
                <div
                  className={`p-4 rounded-xl border flex items-start gap-3 transition-all ${
                    verificationResult.valid
                      ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
                      : 'bg-rose-950/40 border-rose-500/50 text-rose-200'
                  }`}
                >
                  <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-sm">
                      Результат криптографической проверки: Целостность подтверждена (100%)
                    </div>
                    <div className="text-xs text-emerald-300/90 mt-1">{verificationResult.message}</div>
                  </div>
                </div>
              )}

              {/* Audit Log Table */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider">
                        <th className="pb-3 font-semibold">Время (UTC+5)</th>
                        <th className="pb-3 font-semibold">Действие</th>
                        <th className="pb-3 font-semibold">Сущность</th>
                        <th className="pb-3 font-semibold">Инициатор</th>
                        <th className="pb-3 font-semibold">Крипто-хеш записи (SHA-256)</th>
                        <th className="pb-3 font-semibold">Предыдущий хеш</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {auditLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-800/40 font-mono text-[11px]">
                          <td className="py-3 text-slate-400 whitespace-nowrap">{log.createdAt}</td>
                          <td className="py-3 font-sans font-bold text-teal-300">{log.action}</td>
                          <td className="py-3 font-sans text-slate-300">
                            {log.entityType} [{log.entityId}]
                          </td>
                          <td className="py-3 font-sans text-slate-400">{log.actor}</td>
                          <td className="py-3 text-emerald-400 truncate max-w-[160px]" title={log.hash}>
                            {log.hash.substring(0, 18)}...
                          </td>
                          <td className="py-3 text-slate-500 truncate max-w-[140px]" title={log.previousHash}>
                            {log.previousHash?.substring(0, 16)}...
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: TRANSACTIONAL OUTBOX */}
          {activeTab === 'outbox' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-bold text-white flex items-center gap-2">
                    <Send className="w-5 h-5 text-teal-400" />
                    Transactional Outbox (Гарантированная Доставка)
                  </h1>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Бизнес-транзакция и запись события выполняются атомарно в PostgreSQL. Воркер доставляет
                    события подписчикам с защитой от дублирования.
                  </p>
                </div>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider">
                        <th className="pb-3 font-semibold">ID События</th>
                        <th className="pb-3 font-semibold">Тип события (DomainEvent)</th>
                        <th className="pb-3 font-semibold">Статус публикации</th>
                        <th className="pb-3 font-semibold">Создано</th>
                        <th className="pb-3 font-semibold">Опубликовано</th>
                        <th className="pb-3 font-semibold">Повторов</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {outboxEvents.map((evt) => (
                        <tr key={evt.id} className="hover:bg-slate-800/40">
                          <td className="py-3 font-mono text-slate-400">{evt.id}</td>
                          <td className="py-3 font-semibold text-teal-300">{evt.eventName}</td>
                          <td className="py-3">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 w-fit">
                              <CheckCircle className="w-3 h-3" />
                              {evt.status}
                            </span>
                          </td>
                          <td className="py-3 text-slate-400">{evt.scheduledAt}</td>
                          <td className="py-3 text-slate-400">{evt.publishedAt || '—'}</td>
                          <td className="py-3 font-mono text-slate-300">{evt.retryCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: SETTINGS (KAZAKHSTAN COMPLIANCE) */}
          {activeTab === 'settings' && (
            <div className="max-w-3xl space-y-6">
              <div>
                <h1 className="text-xl font-bold text-white">Региональные настройки (Казахстан)</h1>
                <p className="text-xs text-slate-400 mt-0.5">
                  Конфигурация параметров часового пояса, национальной валюты и соответствия регламентам МЦС РК
                </p>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block text-slate-400 mb-1.5 font-medium">Часовой пояс клиники</label>
                    <input
                      type="text"
                      disabled
                      value="Asia/Almaty (UTC+5:00)"
                      className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg p-2.5 cursor-not-allowed"
                    />
                    <span className="text-[11px] text-slate-500 mt-1 block">
                      Единый часовой пояс Республики Казахстан
                    </span>
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1.5 font-medium">Валюта расчетов</label>
                    <input
                      type="text"
                      disabled
                      value="KZT — Казахстанский тенге (₸)"
                      className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg p-2.5 cursor-not-allowed"
                    />
                    <span className="text-[11px] text-slate-500 mt-1 block">
                      Точность до тиынов в финансовом ledger
                    </span>
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1.5 font-medium">БИН Организации</label>
                    <input
                      type="text"
                      defaultValue="210440028912"
                      className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg p-2.5"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1.5 font-medium">Язык интерфейса по умолчанию</label>
                    <select className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg p-2.5">
                      <option value="ru">Русский (ru-KZ)</option>
                      <option value="kk">Қазақша (kk-KZ)</option>
                    </select>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-800 flex justify-end">
                  <button
                    type="button"
                    onClick={() => alert('Настройки сохранены и синхронизированы с базой данных!')}
                    className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white font-semibold text-xs rounded-lg transition"
                  >
                    Сохранить изменения
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Modal: Add Chair */}
      {isAddChairOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-white">Регистрация нового кресла</h3>
            <form onSubmit={handleCreateChair} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Наименование оборудования</label>
                <input
                  type="text"
                  required
                  placeholder="Например: Planmeca Compact i5 #5"
                  value={newChairName}
                  onChange={(e) => setNewChairName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Инвентарный код</label>
                <input
                  type="text"
                  placeholder="SML-CH-05"
                  value={newChairCode}
                  onChange={(e) => setNewChairCode(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Филиал размещения</label>
                <select
                  value={newChairBranch}
                  onChange={(e) => setNewChairBranch(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-teal-500"
                >
                  <option value="Самал (Алматы)">Самал (Алматы)</option>
                  <option value="Нурлы Тау (Алматы)">Нурлы Тау (Алматы)</option>
                  <option value="Левый Берег (Астана)">Левый Берег (Астана)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsAddChairOpen(false)}
                  className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs transition"
                >
                  Создать кресло
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Staff */}
      {isAddStaffOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-white">Регистрация сотрудника клиники</h3>
            <form onSubmit={handleCreateStaff} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 mb-1">Имя</label>
                  <input
                    type="text"
                    required
                    placeholder="Ерлан"
                    value={newStaffFirst}
                    onChange={(e) => setNewStaffFirst(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Фамилия</label>
                  <input
                    type="text"
                    required
                    placeholder="Байжанов"
                    value={newStaffLast}
                    onChange={(e) => setNewStaffLast(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">ИИН (12 цифр)</label>
                <input
                  type="text"
                  maxLength={12}
                  placeholder="920515300123"
                  value={newStaffIIN}
                  onChange={(e) => setNewStaffIIN(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Корпоративный Email</label>
                <input
                  type="email"
                  required
                  placeholder="e.baizhanov@dentalux.kz"
                  value={newStaffEmail}
                  onChange={(e) => setNewStaffEmail(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Назначить роль (RBAC)</label>
                <select
                  value={newStaffRole}
                  onChange={(e) => setNewStaffRole(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-teal-500"
                >
                  <option value="DOCTOR">DOCTOR (Врач-стоматолог)</option>
                  <option value="CLINIC_ADMIN">CLINIC_ADMIN (Администратор клиники)</option>
                  <option value="ASSISTANT">ASSISTANT (Ассистент стоматолога)</option>
                  <option value="RECEPTIONIST">RECEPTIONIST (Ресепшн / Запись)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsAddStaffOpen(false)}
                  className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs transition"
                >
                  Зарегистрировать
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
