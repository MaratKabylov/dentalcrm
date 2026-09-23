export type DiagnosisSystem = "local" | "icd10";
export type DiagnosisType = "primary" | "secondary" | "differential";

export type DiagnosisOption = {
  id: string;
  code: string;
  name: string;
  system: DiagnosisSystem;
};

export type EncounterDiagnosis = DiagnosisOption & {
  encounterDiagnosisId: string;
  toothCode: string | null;
  type: DiagnosisType;
  notes: string | null;
  createdAt: string;
};
