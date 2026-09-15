import { createDocumentSchema, signDocumentSchema, uuidSchema } from "@dental/contracts";
import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { parseSchema } from "../../common/http/parse-schema.js";
import type { AuthContext } from "../identity/auth-context.js";
import { CurrentAuth } from "../identity/current-auth.decorator.js";
import { RequirePermissions } from "../identity/permissions.decorator.js";
import { DocumentsService } from "./documents.service.js";

@ApiTags("documents") @ApiBearerAuth() @Controller("documents")
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post() @RequirePermissions("documents.manage")
  create(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    return this.documents.create(auth, parseSchema(createDocumentSchema, body));
  }

  @Get(":id") @RequirePermissions("documents.read")
  get(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.documents.get(auth, parseSchema(uuidSchema, id));
  }

  @Post(":id/sign") @RequirePermissions("documents.sign")
  sign(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    return this.documents.sign(auth, parseSchema(uuidSchema, id), parseSchema(signDocumentSchema, body));
  }
}
