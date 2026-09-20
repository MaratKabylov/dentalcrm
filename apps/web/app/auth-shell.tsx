"use client";

import { createContext,useCallback,useContext,useEffect,useState,type FormEvent,type ReactNode } from "react";
import { AppNavigation } from "./app-navigation";

export interface Session {tenantId:string;userId:string;membershipId:string;displayName:string;email:string|null;tenantName:string;tenantSlug:string;
  permissions:string[];access:{tenantWide:boolean;organizationIds:string[];branchIds:string[]}}
interface AuthValue {session:Session;request:<T>(path:string,init?:RequestInit)=>Promise<T>;logout:()=>Promise<void>}
const AuthContext=createContext<AuthValue|null>(null);

export function AuthShell({apiUrl,children}:{apiUrl:string;children:ReactNode}){
  const [session,setSession]=useState<Session|null|undefined>(undefined);const [error,setError]=useState("");
  const raw=useCallback(async<T,>(path:string,init?:RequestInit)=>{const response=await fetch(`${apiUrl}${path}`,{
    ...init,credentials:"include",headers:{"content-type":"application/json",...init?.headers}});let body:unknown;
    try{body=await response.json();}catch{body={};}if(!response.ok){const value=body as {error?:{message?:string}};
      throw Object.assign(new Error(value.error?.message ?? "API request failed"),{status:response.status});}return body as T;},[apiUrl]);
  const refresh=useCallback(async()=>{try{setSession(await raw<Session>("/me"));setError("");}catch(reason){const failure=reason as Error&{status?:number};
    if(failure.status===401)setSession(null);else{setSession(null);setError(failure.message);}}},[raw]);
  useEffect(()=>{void refresh();},[refresh]);
  const request=useCallback(async<T,>(path:string,init?:RequestInit)=>{try{return await raw<T>(path,init);}catch(reason){
    if((reason as {status?:number}).status===401)setSession(null);throw reason;}},[raw]);
  const logout=useCallback(async()=>{try{await raw("/auth/logout",{method:"POST",body:"{}"});}finally{setSession(null);}},[raw]);
  if(session===undefined)return <main className="auth-loading"><div className="brand"><span className="brand-mark">D</span> Dental SaaS</div><p>Проверяем сессию…</p></main>;
  if(!session)return <Login apiUrl={apiUrl} error={error} onSuccess={refresh}/>;
  return <AuthContext.Provider value={{session,request,logout}}><AppNavigation session={session} logout={logout} request={request}>{children}</AppNavigation></AuthContext.Provider>;
}

export function useAuth(){const value=useContext(AuthContext);if(!value)throw new Error("Authentication context is unavailable");return value;}

function Login({apiUrl,error,onSuccess}:{apiUrl:string;error:string;onSuccess:()=>Promise<void>}){
  const [notice,setNotice]=useState(error);const [loading,setLoading]=useState(false);
  async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=new FormData(event.currentTarget);setLoading(true);setNotice("");
    try{const response=await fetch(`${apiUrl}/auth/login`,{method:"POST",credentials:"include",headers:{"content-type":"application/json"},
      body:JSON.stringify({tenant:form.get("tenant"),username:form.get("username"),password:form.get("password")})});
      const body=await response.json() as {error?:{message?:string}};if(!response.ok)throw new Error(body.error?.message ?? "Не удалось войти");await onSuccess();
    }catch(reason){setNotice(reason instanceof Error?reason.message:"Не удалось войти");}finally{setLoading(false);}}
  return <main className="login-page"><section className="login-copy"><div className="brand"><span className="brand-mark">D</span> Dental SaaS</div>
    <span className="eyebrow">Рабочее пространство клиники</span><h1>Спокойный день начинается здесь.</h1>
    <p>Расписание, пациенты, лечение и финансы — в одном защищённом пространстве.</p></section>
    <form className="login-card" onSubmit={submit}><span className="phase">Локальный вход</span><h2>Войти в систему</h2>
      <p>Используйте данные, созданные командой <code>npm run db:seed</code>.</p>{notice&&<div className="login-error" role="alert">{notice}</div>}
      <label>Клиника<input name="tenant" defaultValue="demo-clinic" autoComplete="organization" required/></label>
      <label>Логин<input name="username" defaultValue="owner" autoComplete="username" required/></label>
      <label>Пароль<input name="password" type="password" autoComplete="current-password" required autoFocus/></label>
      <button className="primary" disabled={loading}>{loading?"Входим…":"Войти"}</button>
      <small>Для production локальный режим автоматически запрещён.</small></form></main>;
}
