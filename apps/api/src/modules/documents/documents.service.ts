import type { CreateDocumentInput, CreateDocumentUploadInput, SignDocumentInput } from "@dental/contracts";
import { HttpStatus, Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";
import { ApiException } from "../../common/http/api.exception.js";
import { DatabaseService } from "../../database/database.service.js";
import { AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../identity/auth-context.js";
import { OutboxService } from "../outbox/outbox.service.js";
import { SupabaseAdminService } from "../../integrations/supabase/supabase-admin.service.js";

export interface DocumentRow { id: string; patientId: string; encounterId: string | null; kind: string; title: string; status: string; currentVersion: number; createdAt: Date }
const documentSelect = `id,patient_id AS "patientId",encounter_id AS "encounterId",kind,title,status,
  current_version AS "currentVersion",created_at AS "createdAt"`;

@Injectable()
export class DocumentsService {
  constructor(private readonly database: DatabaseService, private readonly audit: AuditService, private readonly outbox: OutboxService,
    private readonly supabase: SupabaseAdminService) {}

  createUpload(auth: AuthContext, input: CreateDocumentUploadInput) {
    return this.supabase.createSignedUpload(auth.tenantId, input.fileName);
  }

  async createDownload(auth: AuthContext, documentId: string, versionId: string) {
    const storageKey = await this.database.withTenant(auth, async (client) => {
      const row = (await client.query<{ storageKey: string }>(`SELECT v.storage_key AS "storageKey"
        FROM document_versions v JOIN documents d ON d.id=v.document_id
        WHERE d.id=$1 AND v.id=$2`, [documentId, versionId])).rows[0];
      if (!row) throw new ApiException(HttpStatus.NOT_FOUND, "DOCUMENT_VERSION_NOT_FOUND", "Document version not found");
      return row.storageKey;
    });
    return this.supabase.createSignedDownload(storageKey);
  }

  create(auth: AuthContext, input: CreateDocumentInput) {
    return this.database.withTenant(auth, async (client) => {
      const patient = await client.query(`SELECT 1 FROM patients WHERE id=$1 AND archived_at IS NULL`, [input.patientId]);
      if (!patient.rows[0]) throw new ApiException(HttpStatus.NOT_FOUND, "PATIENT_NOT_FOUND", "Patient not found");
      if (input.encounterId) {
        const encounter = await client.query<{ patientId: string }>(`SELECT patient_id AS "patientId" FROM encounters WHERE id=$1`, [input.encounterId]);
        if (!encounter.rows[0]) throw new ApiException(HttpStatus.NOT_FOUND, "ENCOUNTER_NOT_FOUND", "Encounter not found");
        if (encounter.rows[0].patientId !== input.patientId) throw new ApiException(HttpStatus.CONFLICT, "DOCUMENT_ENCOUNTER_MISMATCH", "Document patient does not match the encounter");
      }
      const document = (await client.query<DocumentRow>(`INSERT INTO documents
        (tenant_id,patient_id,encounter_id,kind,title,created_by,updated_by) VALUES ($1,$2,$3,$4,$5,$6,$6)
        RETURNING ${documentSelect}`, [auth.tenantId, input.patientId, input.encounterId ?? null, input.kind, input.title, auth.userId])).rows[0]!;
      const file = (await client.query<Record<string, unknown>>(`INSERT INTO document_versions
        (tenant_id,document_id,version_number,mime_type,storage_key,size_bytes,checksum_sha256,created_by)
        VALUES ($1,$2,1,$3,$4,$5,$6,$7) RETURNING id,version_number AS "versionNumber",mime_type AS "mimeType",
        storage_key AS "storageKey",size_bytes::int AS "sizeBytes",checksum_sha256 AS "checksumSha256",created_at AS "createdAt"`,
        [auth.tenantId, document.id, input.mimeType, input.storageKey, input.sizeBytes, input.checksumSha256.toLowerCase(), auth.userId])).rows[0]!;
      const result = { ...document, file };
      await this.record(client, auth, "document.created", "DocumentCreated", document.id, result);
      return result;
    });
  }

  get(auth: AuthContext, id: string) {
    return this.database.withTenant(auth, async (client) => {
      const document = await this.find(client, id);
      const [versions, signatures] = await Promise.all([
        client.query(`SELECT id,version_number AS "versionNumber",mime_type AS "mimeType",storage_key AS "storageKey",
          size_bytes::int AS "sizeBytes",checksum_sha256 AS "checksumSha256",created_at AS "createdAt"
          FROM document_versions WHERE document_id=$1 ORDER BY version_number DESC`, [id]),
        client.query(`SELECT id,document_version_id AS "documentVersionId",signer_type AS "signerType",signer_id AS "signerId",
          signature_reference AS "signatureReference",signed_at AS "signedAt" FROM document_signatures WHERE document_id=$1 ORDER BY signed_at`, [id])
      ]);
      return { ...document, versions: versions.rows, signatures: signatures.rows };
    });
  }

  sign(auth: AuthContext, id: string, input: SignDocumentInput) {
    return this.database.withTenant(auth, async (client) => {
      const before = await this.find(client, id, true);
      if (before.status !== "draft") throw new ApiException(HttpStatus.CONFLICT, "DOCUMENT_NOT_DRAFT", "Only a draft document can be signed");
      const version = (await client.query<{ id: string }>(`SELECT id FROM document_versions
        WHERE document_id=$1 AND version_number=$2`, [id, before.currentVersion])).rows[0]!;
      const signature = (await client.query<Record<string, unknown>>(`INSERT INTO document_signatures
        (tenant_id,document_id,document_version_id,signer_type,signer_id,signature_reference,signed_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id,signer_type AS "signerType",signer_id AS "signerId",signed_at AS "signedAt"`,
        [auth.tenantId, id, version.id, input.signerType, input.signerId ?? null, input.signatureReference ?? null, auth.userId])).rows[0]!;
      const after = (await client.query<DocumentRow>(`UPDATE documents SET status='signed',updated_at=now(),updated_by=$2
        WHERE id=$1 RETURNING ${documentSelect}`, [id, auth.userId])).rows[0]!;
      const result = { ...after, signature };
      await this.record(client, auth, "document.signed", "DocumentSigned", id, result, before);
      return result;
    });
  }

  private async find(client: PoolClient, id: string, lock = false): Promise<DocumentRow> {
    const row = (await client.query<DocumentRow>(`SELECT ${documentSelect} FROM documents WHERE id=$1${lock ? " FOR UPDATE" : ""}`, [id])).rows[0];
    if (!row) throw new ApiException(HttpStatus.NOT_FOUND, "DOCUMENT_NOT_FOUND", "Document not found");
    return row;
  }

  private async record(client: PoolClient, auth: AuthContext, action: string, eventType: string, id: string, after: unknown, before?: unknown) {
    await this.audit.append(client, { tenantId: auth.tenantId, actorUserId: auth.userId, action, entityType: "document",
      entityId: id, ...(before === undefined ? {} : { before }), after, requestId: auth.requestId });
    await this.outbox.append(client, { tenantId: auth.tenantId, aggregateType: "document", aggregateId: id,
      eventType, payload: { documentId: id }, requestId: auth.requestId });
  }
}
