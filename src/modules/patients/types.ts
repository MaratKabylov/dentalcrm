export type PatientListItem = {
  id: string;
  externalNumber: string;
  lastName: string;
  firstName: string;
  middleName: string | null;
  birthDate: string | null;
  phone: string;
  phoneNormalized: string;
  iin: string | null;
};

export type PatientDetails = PatientListItem & {
  email: string | null;
  address: string | null;
  city: string | null;
  notes: string | null;
  gender: "male" | "female" | null;
  consentPersonalData: boolean;
  consentMarketing: boolean;
  createdAt: string;
  primaryBranch: { id: string; name: string } | null;
};

export type BranchOption = {
  id: string;
  name: string;
};
