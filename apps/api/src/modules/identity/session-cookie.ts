export const SESSION_COOKIE="dental_session";

export function readSessionCookie(header:string|undefined):string|undefined{
  if(!header)return undefined;for(const part of header.split(";")){const [name,...value]=part.trim().split("=");
    if(name===SESSION_COOKIE)return decodeURIComponent(value.join("="));}return undefined;
}
