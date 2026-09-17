import { localLoginSchema } from "@dental/contracts";
import { Body,Controller,NotFoundException,Post,Req,Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request,Response } from "express";
import { parseSchema } from "../../common/http/parse-schema.js";
import { getEnv } from "../../config/env.js";
import { LocalAuthService } from "./local-auth.service.js";
import { Public } from "./public.decorator.js";
import { readSessionCookie,SESSION_COOKIE } from "./session-cookie.js";

@ApiTags("authentication") @Controller("auth")
export class AuthController {
  constructor(private readonly localAuth:LocalAuthService){}

  @Public() @Post("login")
  async login(@Body() body:unknown,@Req() request:Request,@Res({passthrough:true}) response:Response){
    if(getEnv().AUTH_MODE!=="local")throw new NotFoundException("Local login is disabled");
    const ip=request.ip,userAgent=request.header("user-agent");
    const result=await this.localAuth.login(parseSchema(localLoginSchema,body),{...(ip?{ip}:{}),...(userAgent?{userAgent}:{})});
    response.cookie(SESSION_COOKIE,result.token,{httpOnly:true,sameSite:"lax",secure:false,path:"/api/v1",expires:result.expiresAt});
    return {tenantId:result.tenantId,userId:result.userId,displayName:result.displayName,expiresAt:result.expiresAt.toISOString()};
  }

  @Public() @Post("logout")
  async logout(@Req() request:Request,@Res({passthrough:true}) response:Response){
    await this.localAuth.logout(readSessionCookie(request.header("cookie")));
    response.clearCookie(SESSION_COOKIE,{httpOnly:true,sameSite:"lax",secure:false,path:"/api/v1"});return {loggedOut:true};
  }
}
