import type { CommunicationChannel } from "@/modules/communications/types";

export type ProviderMessage = {
  messageId: string;
  organizationId: string;
  channel: CommunicationChannel;
  recipient: string;
  subject: string | null;
  body: string;
};

export type ProviderSendResult = {
  providerMessageId: string;
  status: "sent" | "delivered";
  sentAt: string;
};

export interface CommunicationProviderAdapter {
  readonly code: string;
  supports(channel: CommunicationChannel): boolean;
  send(message: ProviderMessage): Promise<ProviderSendResult>;
}
