export type ClinicalTemplate = {
  id: string;
  name: string;
  description: string | null;
  chiefComplaint: string | null;
  anamnesis: string | null;
  diagnosisSummary: string | null;
  clinicalNotes: string | null;
  isActive: boolean;
  updatedAt: string;
};
