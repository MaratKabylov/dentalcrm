import {
  confirmOcrResultSchema, confirmPublicBookingSchema, createBookingRuleSchema, createIntakeFormSchema,
  createMessageTemplateSchema, createPortalInvitationSchema, createReviewDestinationSchema, createReviewRequestSchema,
  exchangePortalInvitationSchema, idempotencyKeySchema, intakeFormVersionSchema, issueIntakeSchema, messageTemplateVersionSchema,
  portalCancelAppointmentSchema, portalRescheduleAppointmentSchema, portalSessionTokenSchema,
  publicBookingRangeSchema, publishBookingSlotsSchema, queueNotificationSchema, recordOcrResultSchema,
  reviewIntakeSchema, submitIntakeSchema, submitReviewSchema, uuidSchema
} from "@dental/contracts";
import { Body, Controller, Get, Headers, Param, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { parseSchema } from "../../common/http/parse-schema.js";
import type { AuthContext } from "../identity/auth-context.js";
import { CurrentAuth } from "../identity/current-auth.decorator.js";
import { RequirePermissions } from "../identity/permissions.decorator.js";
import { Public } from "../identity/public.decorator.js";
import { ExperienceService } from "./experience.service.js";

@ApiTags("patient-experience")
@ApiBearerAuth()
@Controller("experience")
export class ExperienceController {
  constructor(private readonly experience: ExperienceService) {}

  @Post("message-templates") @RequirePermissions("communications.manage")
  createTemplate(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    return this.experience.createMessageTemplate(auth, parseSchema(createMessageTemplateSchema, body));
  }
  @Post("message-templates/:id/versions") @RequirePermissions("communications.manage")
  addTemplateVersion(@CurrentAuth() auth: AuthContext,@Param("id") id:string,@Body() body:unknown) {
    return this.experience.addMessageTemplateVersion(auth,parseSchema(uuidSchema,id),parseSchema(messageTemplateVersionSchema,body));
  }
  @Post("notifications") @RequirePermissions("communications.manage")
  queueNotification(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    return this.experience.queueNotification(auth, parseSchema(queueNotificationSchema, body));
  }
  @Get("notifications") @RequirePermissions("communications.read")
  notifications(@CurrentAuth() auth: AuthContext) { return this.experience.listNotifications(auth); }

  @Post("portal/invitations") @RequirePermissions("portal.manage")
  invite(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    return this.experience.createPortalInvitation(auth, parseSchema(createPortalInvitationSchema, body));
  }

  @Post("booking/rules") @RequirePermissions("booking.manage")
  createBookingRule(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    return this.experience.createBookingRule(auth, parseSchema(createBookingRuleSchema, body));
  }
  @Post("booking/rules/:id/slots") @RequirePermissions("booking.manage")
  publishSlots(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    return this.experience.publishBookingSlots(auth, parseSchema(uuidSchema, id), parseSchema(publishBookingSlotsSchema, body));
  }

  @Post("intake/forms") @RequirePermissions("intake.manage")
  createIntakeForm(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    return this.experience.createIntakeForm(auth, parseSchema(createIntakeFormSchema, body));
  }
  @Post("intake/forms/:id/versions") @RequirePermissions("intake.manage")
  addIntakeFormVersion(@CurrentAuth() auth:AuthContext,@Param("id") id:string,@Body() body:unknown) {
    return this.experience.addIntakeFormVersion(auth,parseSchema(uuidSchema,id),parseSchema(intakeFormVersionSchema,body));
  }
  @Post("intake/forms/:id/issues") @RequirePermissions("intake.manage")
  issueIntake(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    return this.experience.issueIntake(auth, parseSchema(uuidSchema, id), parseSchema(issueIntakeSchema, body));
  }
  @Post("intake/submissions/:id/ocr-result") @RequirePermissions("intake.manage")
  recordOcr(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    return this.experience.recordOcrResult(auth, parseSchema(uuidSchema, id), parseSchema(recordOcrResultSchema, body));
  }
  @Post("intake/submissions/:id/review") @RequirePermissions("intake.manage")
  reviewIntake(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    return this.experience.reviewIntake(auth, parseSchema(uuidSchema, id), parseSchema(reviewIntakeSchema, body));
  }

  @Post("reviews/destinations") @RequirePermissions("reviews.manage")
  createDestination(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    return this.experience.createReviewDestination(auth, parseSchema(createReviewDestinationSchema, body));
  }
  @Post("reviews/requests") @RequirePermissions("reviews.manage")
  createReviewRequest(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    return this.experience.createReviewRequest(auth, parseSchema(createReviewRequestSchema, body));
  }
  @Get("reviews/feedback") @RequirePermissions("reviews.read")
  feedback(@CurrentAuth() auth: AuthContext) { return this.experience.listReviewFeedback(auth); }
}

@ApiTags("public-patient-experience")
@Public()
@Controller("public")
export class PublicExperienceController {
  constructor(private readonly experience: ExperienceService) {}

  @Get("tenants/:tenantId/organizations/:organizationId/booking-slots")
  slots(@Param("tenantId") tenantId: string, @Param("organizationId") organizationId: string, @Query() query: unknown) {
    return this.experience.listPublicBookingSlots(parseSchema(uuidSchema, tenantId), parseSchema(uuidSchema, organizationId),
      parseSchema(publicBookingRangeSchema, query));
  }
  @Post("tenants/:tenantId/organizations/:organizationId/bookings")
  book(@Param("tenantId") tenantId: string, @Param("organizationId") organizationId: string,
    @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    return this.experience.confirmPublicBooking(parseSchema(uuidSchema, tenantId), parseSchema(uuidSchema, organizationId),
      parseSchema(idempotencyKeySchema, key), parseSchema(confirmPublicBookingSchema, body));
  }
  @Post("portal/sessions")
  exchange(@Body() body: unknown) {
    return this.experience.exchangePortalInvitation(parseSchema(exchangePortalInvitationSchema, body).invitationToken);
  }
  @Get("intake/:token")
  intake(@Param("token") token: string) { return this.experience.getPublicIntake(token); }
  @Post("intake/:token")
  submitIntake(@Param("token") token: string, @Body() body: unknown) {
    return this.experience.submitPublicIntake(token, parseSchema(submitIntakeSchema, body));
  }
  @Get("intake/:token/ocr")
  ocr(@Param("token") token: string) { return this.experience.getPublicOcr(token); }
  @Post("intake/:token/ocr/confirm")
  confirmOcr(@Param("token") token: string, @Body() body: unknown) {
    return this.experience.confirmPublicOcr(token, parseSchema(confirmOcrResultSchema, body));
  }
  @Get("reviews/:token")
  review(@Param("token") token: string) { return this.experience.getPublicReview(token); }
  @Post("reviews/:token")
  submitReview(@Param("token") token: string, @Body() body: unknown) {
    return this.experience.submitPublicReview(token, parseSchema(submitReviewSchema, body));
  }
}

@ApiTags("patient-portal")
@Public()
@Controller("portal")
export class PortalController {
  constructor(private readonly experience: ExperienceService) {}

  @Get("me")
  me(@Headers("x-portal-token") token: string | undefined) {
    return this.experience.portalMe(parseSchema(portalSessionTokenSchema, token));
  }
  @Get("patients/:patientId/summary")
  summary(@Headers("x-portal-token") token: string | undefined, @Param("patientId") patientId: string) {
    return this.experience.portalPatientSummary(parseSchema(portalSessionTokenSchema, token), parseSchema(uuidSchema, patientId));
  }
  @Post("appointments/:id/cancel")
  cancel(@Headers("x-portal-token") token: string | undefined, @Param("id") id: string, @Body() body: unknown) {
    return this.experience.cancelPortalAppointment(parseSchema(portalSessionTokenSchema, token),parseSchema(uuidSchema,id),
      parseSchema(portalCancelAppointmentSchema,body).reason);
  }
  @Post("appointments/:id/reschedule")
  reschedule(@Headers("x-portal-token") token: string | undefined, @Param("id") id: string, @Body() body: unknown) {
    return this.experience.reschedulePortalAppointment(parseSchema(portalSessionTokenSchema,token),parseSchema(uuidSchema,id),
      parseSchema(portalRescheduleAppointmentSchema,body));
  }
}
