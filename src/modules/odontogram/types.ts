import type {
  TOOTH_CONDITION_CODES,
  TOOTH_SURFACES,
} from "@/modules/odontogram/constants";

export type ToothCondition = (typeof TOOTH_CONDITION_CODES)[number];
export type ToothSurfaceCode = (typeof TOOTH_SURFACES)[number];

export type OdontogramSurface = {
  surface: ToothSurfaceCode;
  condition: ToothCondition;
};

export type OdontogramTooth = {
  toothCode: string;
  state: ToothCondition;
  notes: string | null;
  surfaces: OdontogramSurface[];
};

export type Odontogram = {
  id: string;
  patientId: string;
  encounterId: string | null;
  versionNo: number;
  createdAt: string;
  teeth: OdontogramTooth[];
};
