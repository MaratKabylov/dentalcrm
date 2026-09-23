import { z } from "zod";

export const createInvoiceFromEncounterSchema = z.object({
  encounterId: z.uuid(),
});

export const invoiceIdSchema = z.uuid();
