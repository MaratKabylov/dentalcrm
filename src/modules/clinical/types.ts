export type ClinicalEncounterStatus = "open" | "closed";

export type ClinicalEncounter = {
  id: string;
  branchId: string;
  branchName: string;
  patientId: string;
  patientName: string;
  patientExternalNumber: string;
  appointmentId: string | null;
  appointmentStartAt: string | null;
  appointmentStatusCode: string | null;
  doctorId: string;
  doctorName: string;
  specializationName: string;
  openedAt: string;
  closedAt: string | null;
  chiefComplaint: string | null;
  anamnesis: string | null;
  diagnosisSummary: string | null;
  clinicalNotes: string | null;
  status: ClinicalEncounterStatus;
};

export type ClinicalEncounterListItem = Pick<
  ClinicalEncounter,
  | "id"
  | "patientId"
  | "patientName"
  | "patientExternalNumber"
  | "doctorName"
  | "branchName"
  | "openedAt"
  | "closedAt"
  | "status"
>;
