export interface MessagingRequest {
  channel: "whatsapp" | "sms" | "email" | "push" | "in_app";
  recipient: string;
  subject?: string;
  body: string;
  correlationId: string;
}

export interface MessagingReceipt {
  provider: string;
  providerMessageId?: string;
  status: "accepted" | "sent";
  safeResponse?: Record<string, unknown>;
}

/** Infrastructure adapters implement this interface; patient workflows never depend on a vendor SDK. */
export interface MessagingProvider {
  readonly name: string;
  supports(channel: MessagingRequest["channel"]): boolean;
  send(request: MessagingRequest): Promise<MessagingReceipt>;
  getStatus(providerMessageId: string): Promise<"sent" | "delivered" | "failed" | "unknown">;
}

