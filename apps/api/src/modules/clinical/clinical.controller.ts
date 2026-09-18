import {
  amendClinicalNoteSchema, completeProcedureSchema, createClinicalNoteSchema, createDiagnosisSchema,
  createEncounterSchema, createProcedureSchema, appointmentRangeSchema, setOdontogramEntrySchema, updateClinicalNoteSchema, uuidSchema
} from "@dental/contracts";
import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { parseSchema } from "../../common/http/parse-schema.js";
import type { AuthContext } from "../identity/auth-context.js";
import { CurrentAuth } from "../identity/current-auth.decorator.js";
import { RequirePermissions } from "../identity/permissions.decorator.js";
import { ClinicalService } from "./clinical.service.js";

@ApiTags("clinical") @ApiBearerAuth() @Controller()
export class ClinicalController {
  constructor(private readonly clinical: ClinicalService) {}

  @Get("encounters") @RequirePermissions("clinical.read")
  listEncounters(@CurrentAuth() auth: AuthContext, @Query("from") from: string, @Query("to") to: string) {
    const range = parseSchema(appointmentRangeSchema, { from, to });
    return this.clinical.listEncounters(auth, range.from, range.to);
  }

  @Post("encounters") @RequirePermissions("clinical.write")
  createEncounter(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    return this.clinical.createEncounter(auth, parseSchema(createEncounterSchema, body));
  }

  @Get("encounters/:id") @RequirePermissions("clinical.read")
  getEncounter(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.clinical.getEncounter(auth, parseSchema(uuidSchema, id));
  }

  @Post("encounters/:id/complete") @RequirePermissions("clinical.write")
  completeEncounter(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.clinical.completeEncounter(auth, parseSchema(uuidSchema, id));
  }

  @Post("clinical-notes") @RequirePermissions("clinical.write")
  createNote(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    return this.clinical.createNote(auth, parseSchema(createClinicalNoteSchema, body));
  }

  @Patch("clinical-notes/:id") @RequirePermissions("clinical.write")
  updateNote(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    return this.clinical.updateNote(auth, parseSchema(uuidSchema, id), parseSchema(updateClinicalNoteSchema, body));
  }

  @Get("clinical-notes/:id/versions") @RequirePermissions("clinical.read")
  noteVersions(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.clinical.noteVersions(auth, parseSchema(uuidSchema, id));
  }

  @Post("clinical-notes/:id/sign") @RequirePermissions("clinical.sign")
  signNote(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.clinical.signNote(auth, parseSchema(uuidSchema, id));
  }

  @Post("clinical-notes/:id/amend") @RequirePermissions("clinical.amend")
  amendNote(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    return this.clinical.amendNote(auth, parseSchema(uuidSchema, id), parseSchema(amendClinicalNoteSchema, body));
  }

  @Post("encounters/:id/diagnoses") @RequirePermissions("clinical.write")
  addDiagnosis(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    return this.clinical.addDiagnosis(auth, parseSchema(uuidSchema, id), parseSchema(createDiagnosisSchema, body));
  }

  @Post("encounters/:id/procedures") @RequirePermissions("clinical.write")
  addProcedure(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    return this.clinical.addProcedure(auth, parseSchema(uuidSchema, id), parseSchema(createProcedureSchema, body));
  }

  @Post("procedures/:id/complete") @RequirePermissions("clinical.write")
  completeProcedure(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    const command = parseSchema(completeProcedureSchema, body);
    return this.clinical.completeProcedure(auth, parseSchema(uuidSchema, id), command.completedAt);
  }

  @Get("patients/:patientId/odontogram") @RequirePermissions("clinical.read")
  getOdontogram(@CurrentAuth() auth: AuthContext, @Param("patientId") patientId: string) {
    return this.clinical.getOdontogram(auth, parseSchema(uuidSchema, patientId));
  }

  @Post("patients/:patientId/odontogram/entries") @RequirePermissions("clinical.write")
  setOdontogramEntry(@CurrentAuth() auth: AuthContext, @Param("patientId") patientId: string, @Body() body: unknown) {
    return this.clinical.setOdontogramEntry(auth, parseSchema(uuidSchema, patientId), parseSchema(setOdontogramEntrySchema, body));
  }
}
