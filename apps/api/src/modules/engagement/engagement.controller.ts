import {
  cancelWaitlistEntrySchema, createRecallTypeSchema, createWaitlistEntrySchema, publicWaitlistOfferSchema,
  recallAttemptSchema, uuidSchema
} from "@dental/contracts";
import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { parseSchema } from "../../common/http/parse-schema.js";
import type { AuthContext } from "../identity/auth-context.js";
import { CurrentAuth } from "../identity/current-auth.decorator.js";
import { RequirePermissions } from "../identity/permissions.decorator.js";
import { Public } from "../identity/public.decorator.js";
import { EngagementService } from "./engagement.service.js";

@ApiTags("recall-waitlist")
@Controller()
export class EngagementController {
  constructor(private readonly engagement: EngagementService) {}

  @Get("recall/types") @ApiBearerAuth() @RequirePermissions("recalls.read")
  recallTypes(@CurrentAuth() auth: AuthContext) { return this.engagement.listRecallTypes(auth); }

  @Post("recall/types") @ApiBearerAuth() @RequirePermissions("recalls.manage")
  createRecallType(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    return this.engagement.createRecallType(auth, parseSchema(createRecallTypeSchema, body));
  }

  @Get("recalls") @ApiBearerAuth() @RequirePermissions("recalls.read")
  recalls(@CurrentAuth() auth: AuthContext, @Query("status") status?: string) {
    return this.engagement.listRecalls(auth, status);
  }

  @Post("recalls/:id/attempts") @ApiBearerAuth() @RequirePermissions("recalls.manage")
  recallAttempt(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    return this.engagement.recordRecallAttempt(auth, parseSchema(uuidSchema, id), parseSchema(recallAttemptSchema, body));
  }

  @Get("waitlist/entries") @ApiBearerAuth() @RequirePermissions("waitlist.read")
  waitlist(@CurrentAuth() auth: AuthContext, @Query("status") status?: string) {
    return this.engagement.listWaitlistEntries(auth, status);
  }

  @Post("waitlist/entries") @ApiBearerAuth() @RequirePermissions("waitlist.manage")
  createWaitlistEntry(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    return this.engagement.createWaitlistEntry(auth, parseSchema(createWaitlistEntrySchema, body));
  }

  @Post("waitlist/entries/:id/cancel") @ApiBearerAuth() @RequirePermissions("waitlist.manage")
  cancelWaitlistEntry(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    const input = parseSchema(cancelWaitlistEntrySchema, body);
    return this.engagement.cancelWaitlistEntry(auth, parseSchema(uuidSchema, id), input.reason);
  }

  @Get("waitlist/offers") @ApiBearerAuth() @RequirePermissions("waitlist.read")
  offers(@CurrentAuth() auth: AuthContext, @Query("status") status?: string) {
    return this.engagement.listOffers(auth, status);
  }

  @Public() @Get("public/waitlist/offers/:token")
  publicOffer(@Param("token") token: string) {
    return this.engagement.getPublicOffer(parseSchema(publicWaitlistOfferSchema, { token }).token);
  }

  @Public() @Post("public/waitlist/offers/:token/accept")
  acceptOffer(@Param("token") token: string) {
    return this.engagement.acceptPublicOffer(parseSchema(publicWaitlistOfferSchema, { token }).token);
  }

  @Public() @Post("public/waitlist/offers/:token/decline")
  declineOffer(@Param("token") token: string) {
    return this.engagement.declinePublicOffer(parseSchema(publicWaitlistOfferSchema, { token }).token);
  }
}
