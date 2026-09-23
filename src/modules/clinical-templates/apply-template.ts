import type { ClinicalTemplate } from "@/modules/clinical-templates/types";

export type ClinicalTemplateFields = {
  chiefComplaint: string;
  anamnesis: string;
  diagnosisSummary: string;
  clinicalNotes: string;
};

const fieldLimits: Record<keyof ClinicalTemplateFields, number> = {
  chiefComplaint: 4000,
  anamnesis: 8000,
  diagnosisSummary: 4000,
  clinicalNotes: 12000,
};

function appendText(current: string, addition: string | null) {
  if (!addition) return current;
  if (!current.trim()) return addition;
  return `${current.trimEnd()}\n\n${addition}`;
}

export function applyClinicalTemplate(
  current: ClinicalTemplateFields,
  template: Pick<ClinicalTemplate, "chiefComplaint" | "anamnesis" | "diagnosisSummary" | "clinicalNotes">,
): { success: true; fields: ClinicalTemplateFields } | { success: false } {
  const fields = {
    chiefComplaint: appendText(current.chiefComplaint, template.chiefComplaint),
    anamnesis: appendText(current.anamnesis, template.anamnesis),
    diagnosisSummary: appendText(current.diagnosisSummary, template.diagnosisSummary),
    clinicalNotes: appendText(current.clinicalNotes, template.clinicalNotes),
  };
  const exceedsLimit = Object.entries(fields).some(
    ([field, value]) => value.length > fieldLimits[field as keyof ClinicalTemplateFields],
  );
  return exceedsLimit ? { success: false } : { success: true, fields };
}
