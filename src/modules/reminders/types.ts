import type { CommunicationChannel } from "@/modules/communications/types";

export type ReminderEventCode =
  | "appointment_booked"
  | "appointment_before_24h"
  | "appointment_before_2h"
  | "appointment_no_show"
  | "appointment_completed"
  | "recall_due";

export type ReminderJobStatus = "pending" | "queued" | "skipped" | "failed";

export type AutomationRule = {
  id: string;
  name: string;
  eventCode: ReminderEventCode;
  channel: CommunicationChannel;
  templateId: string;
  templateName: string;
  isActive: boolean;
  updatedAt: string;
};

export type ReminderJob = {
  id: string;
  ruleName: string;
  eventCode: ReminderEventCode;
  channel: CommunicationChannel;
  status: ReminderJobStatus;
  patientId: string;
  patientName: string;
  appointmentId: string | null;
  recallId: string | null;
  scheduledFor: string;
  errorMessage: string | null;
  createdAt: string;
};

export type ReminderSummary = {
  activeRules: number;
  pendingJobs: number;
  dueJobs: number;
  failedJobs: number;
};
