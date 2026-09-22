import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { getEnv } from "../../config/env.js";

@Injectable()
export class SupabaseAdminService {
  private readonly adminClient: SupabaseClient | null;

  constructor() {
    const env = getEnv();
    const serverKey = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
    this.adminClient = env.NEXT_PUBLIC_SUPABASE_URL && serverKey
      ? createClient(env.NEXT_PUBLIC_SUPABASE_URL, serverKey, {
          auth: { autoRefreshToken: false, persistSession: false }
        })
      : null;
  }

  get isConfigured(): boolean {
    return this.adminClient !== null;
  }

  get client(): SupabaseClient {
    if (!this.adminClient) {
      throw new ServiceUnavailableException("Supabase server client is not configured");
    }
    return this.adminClient;
  }

  async createSignedUpload(tenantId: string, fileName: string) {
    const safeName = fileName.normalize("NFKC").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "file";
    const storageKey = `${tenantId}/documents/${randomUUID()}-${safeName}`;
    const { data, error } = await this.client.storage
      .from(getEnv().SUPABASE_STORAGE_BUCKET)
      .createSignedUploadUrl(storageKey);
    if (error) throw new ServiceUnavailableException(`Could not create upload URL: ${error.message}`);
    return { storageKey, signedUrl: data.signedUrl, token: data.token };
  }

  async createSignedDownload(storageKey: string) {
    const { data, error } = await this.client.storage
      .from(getEnv().SUPABASE_STORAGE_BUCKET)
      .createSignedUrl(storageKey, 300);
    if (error) throw new ServiceUnavailableException(`Could not create download URL: ${error.message}`);
    return { signedUrl: data.signedUrl, expiresIn: 300 };
  }
}
