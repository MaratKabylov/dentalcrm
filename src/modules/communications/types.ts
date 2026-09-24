export type CommunicationChannel = "sms" | "whatsapp" | "telegram" | "email" | "push";
export type CommunicationDirection = "inbound" | "outbound";
export type CommunicationStatus =
  | "queued"
  | "sending"
  | "sent"
  | "delivered"
  | "failed"
  | "received"
  | "cancelled";
export type CommunicationTemplateCategory = "general" | "appointment" | "recall" | "marketing";
export type CommunicationTargetType = "patient" | "lead";

export type CommunicationTemplate = {
  id: string;
  name: string;
  category: CommunicationTemplateCategory;
  channel: CommunicationChannel | null;
  subject: string | null;
  body: string;
  isActive: boolean;
  updatedAt: string;
};

export type CommunicationTarget = {
  type: CommunicationTargetType;
  id: string;
  label: string;
  phone: string;
  email: string | null;
};

export type CommunicationMessage = {
  id: string;
  targetType: CommunicationTargetType;
  targetId: string;
  targetName: string;
  channel: CommunicationChannel;
  direction: CommunicationDirection;
  provider: string;
  providerMessageId: string | null;
  status: CommunicationStatus;
  recipient: string;
  subject: string | null;
  body: string;
  creatorName: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  errorMessage: string | null;
  createdAt: string;
};

export type CommunicationFilters = {
  q?: string;
  channel?: CommunicationChannel | "all";
  direction?: CommunicationDirection | "all";
  status?: CommunicationStatus | "all";
};

export type CommunicationSummary = {
  queued: number;
  sent: number;
  failed: number;
  received: number;
};
