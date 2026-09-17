export interface LaboratoryOrderRequest {
  caseId: string;
  laboratoryId: string;
  expectedAt?: string;
  items: Array<{ description: string; toothNumber?: number; shade?: string }>;
  fileReferences: string[];
}

export interface LaboratoryOrderReceipt {
  provider: string;
  externalCaseId: string;
  acceptedAt: string;
}

/** Vendor adapters implement this boundary; lab case workflows remain provider-independent. */
export interface LaboratoryProvider {
  readonly name: string;
  sendCase(request: LaboratoryOrderRequest): Promise<LaboratoryOrderReceipt>;
  getStatus(externalCaseId: string): Promise<string>;
}

