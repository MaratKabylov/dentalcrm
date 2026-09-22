"use client";

import { createContext, useCallback, useContext, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { AppNavigation } from "./app-navigation";
import { getSupabaseBrowserClient } from "./lib/supabase/client";

const TENANT_STORAGE_KEY = "dental_tenant_slug";

export interface Session {
  tenantId: string;
  userId: string;
  membershipId: string;
  displayName: string;
  email: string | null;
  tenantName: string;
  tenantSlug: string;
  permissions: string[];
  access: { tenantWide: boolean; organizationIds: string[]; branchIds: string[] };
}

interface AuthValue {
  session: Session;
  request: <T>(path: string, init?: RequestInit) => Promise<T>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthShell({ apiUrl, children }: { apiUrl: string; children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [error, setError] = useState("");

  const raw = useCallback(async <T,>(path: string, init?: RequestInit) => {
    const supabase = getSupabaseBrowserClient();
    const { data, error: authError } = await supabase.auth.getSession();
    const tenantSlug = window.localStorage.getItem(TENANT_STORAGE_KEY);
    if (authError || !data.session || !tenantSlug) {
      throw Object.assign(new Error(authError?.message ?? "Supabase session is required"), { status: 401 });
    }

    const headers = new Headers(init?.headers);
    headers.set("authorization", `Bearer ${data.session.access_token}`);
    headers.set("x-tenant-slug", tenantSlug);
    if (init?.body !== undefined && !headers.has("content-type")) headers.set("content-type", "application/json");

    const response = await fetch(`${apiUrl}${path}`, { ...init, headers });
    let body: unknown;
    try { body = await response.json(); } catch { body = {}; }
    if (!response.ok) {
      const value = body as { error?: { message?: string } };
      throw Object.assign(new Error(value.error?.message ?? "API request failed"), { status: response.status });
    }
    return body as T;
  }, [apiUrl]);

  const refresh = useCallback(async () => {
    try {
      setSession(await raw<Session>("/me"));
      setError("");
    } catch (reason) {
      const failure = reason as Error & { status?: number };
      setSession(null);
      if (failure.status !== 401) setError(failure.message);
    }
  }, [raw]);

  useEffect(() => {
    void refresh();
    const { data } = getSupabaseBrowserClient().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") setSession(null);
    });
    return () => data.subscription.unsubscribe();
  }, [refresh]);

  const request = useCallback(async <T,>(path: string, init?: RequestInit) => {
    try { return await raw<T>(path, init); }
    catch (reason) {
      if ((reason as { status?: number }).status === 401) setSession(null);
      throw reason;
    }
  }, [raw]);

  const logout = useCallback(async () => {
    window.localStorage.removeItem(TENANT_STORAGE_KEY);
    await getSupabaseBrowserClient().auth.signOut();
    setSession(null);
  }, []);

  if (session === undefined) {
    return <main className="auth-loading"><div className="brand"><span className="brand-mark">D</span> Dental SaaS</div><p>Проверяем сессию…</p></main>;
  }
  if (!session) return <Login error={error} onSuccess={refresh} />;
  return <AuthContext.Provider value={{ session, request, logout }}><AppNavigation session={session} logout={logout} request={request}>{children}</AppNavigation></AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("Authentication context is unavailable");
  return value;
}

function Login({ error, onSuccess }: { error: string; onSuccess: () => Promise<void> }) {
  const [notice, setNotice] = useState(error);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const tenant = String(form.get("tenant") ?? "").trim().toLowerCase();
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    setLoading(true);
    setNotice("");
    try {
      const { error: authError } = await getSupabaseBrowserClient().auth.signInWithPassword({ email, password });
      if (authError) throw authError;
      window.localStorage.setItem(TENANT_STORAGE_KEY, tenant);
      await onSuccess();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Не удалось войти");
    } finally {
      setLoading(false);
    }
  }

  return <main className="login-page"><section className="login-copy"><div className="brand"><span className="brand-mark">D</span> Dental SaaS</div>
    <span className="eyebrow">Рабочее пространство клиники</span><h1>Спокойный день начинается здесь.</h1>
    <p>Расписание, пациенты, лечение и финансы — в одном защищённом пространстве.</p></section>
    <form className="login-card" onSubmit={submit}><span className="phase">Supabase Auth</span><h2>Войти в систему</h2>
      <p>Введите клинику и учётные данные, созданные при первоначальной настройке.</p>{notice && <div className="login-error" role="alert">{notice}</div>}
      <label>Клиника<input name="tenant" defaultValue="demo-clinic" autoComplete="organization" required /></label>
      <label>Email<input name="email" type="email" defaultValue="owner@example.com" autoComplete="email" required /></label>
      <label>Пароль<input name="password" type="password" autoComplete="current-password" required autoFocus /></label>
      <button className="primary" disabled={loading}>{loading ? "Входим…" : "Войти"}</button>
      <small>Аутентификация выполняется через Supabase, права доступа проверяет Dental API.</small></form></main>;
}
