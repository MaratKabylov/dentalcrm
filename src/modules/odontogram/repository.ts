import { cache } from "react";
import { z } from "zod";

import { AppError } from "@/lib/errors/app-error";
import { createClient } from "@/lib/supabase/server";
import { TOOTH_CONDITION_CODES, TOOTH_SURFACES } from "@/modules/odontogram/constants";
import type { Odontogram, OdontogramTooth } from "@/modules/odontogram/types";
import { requirePermission } from "@/modules/organizations/repository";

const odontogramRowSchema = z.object({
  odontogram_id: z.uuid(),
  version_no: z.number().int().positive(),
  encounter_id: z.uuid().nullable(),
  created_at: z.string(),
  tooth_code: z.string(),
  tooth_state: z.enum(TOOTH_CONDITION_CODES),
  tooth_notes: z.string().nullable(),
  surface: z.enum(TOOTH_SURFACES).nullable(),
  condition_code: z.enum(TOOTH_CONDITION_CODES).nullable(),
});

export const getLatestOdontogram = cache(async (patientId: string): Promise<Odontogram | null> => {
  const context = await requirePermission("clinical.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_latest_odontogram", {
    org_id: context.organization.id,
    target_patient_id: patientId,
  });

  if (error) throw new AppError("ODONTOGRAM_LOAD_FAILED", "Не удалось загрузить одонтограмму.");
  const parsed = z.array(odontogramRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_ODONTOGRAM_DATA", "Получены некорректные данные одонтограммы.");
  const first = parsed.data[0];
  if (!first) return null;

  const teeth = new Map<string, OdontogramTooth>();
  for (const row of parsed.data) {
    const tooth = teeth.get(row.tooth_code) ?? {
      toothCode: row.tooth_code,
      state: row.tooth_state,
      notes: row.tooth_notes,
      surfaces: [],
    };
    if (row.surface && row.condition_code) {
      tooth.surfaces.push({ surface: row.surface, condition: row.condition_code });
    }
    teeth.set(row.tooth_code, tooth);
  }

  return {
    id: first.odontogram_id,
    patientId,
    encounterId: first.encounter_id,
    versionNo: first.version_no,
    createdAt: first.created_at,
    teeth: Array.from(teeth.values()),
  };
});
