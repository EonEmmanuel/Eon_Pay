import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, or } from "drizzle-orm";
import type { AuthorizationContext } from "../common/request-context.js";
import { recordAudit, tenantIdFrom } from "../common/persistence.js";
import { DatabaseService } from "../database/database.service.js";
import { customers, documents, financingApplications } from "../database/schema.js";
import { SupabaseStorageProvider } from "../providers/storage.provider.js";
import type { CreateDocumentUploadDto } from "./documents.dto.js";

@Injectable()
export class DocumentsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly storage: SupabaseStorageProvider,
  ) {}

  list(context: AuthorizationContext, applicationId?: string) {
    const tenantId = tenantIdFrom(context);
    const permission = this.permission(context, "read");
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      [permission],
      (transaction) =>
        transaction
          .select()
          .from(documents)
          .where(
            and(
              eq(documents.tenantId, tenantId),
              applicationId === undefined
                ? undefined
                : eq(documents.applicationId, applicationId),
            ),
          )
          .orderBy(desc(documents.createdAt)),
    );
  }

  async createUpload(context: AuthorizationContext, input: CreateDocumentUploadDto) {
    if (input.customerId === undefined && input.applicationId === undefined) {
      throw new BadRequestException("A customerId or applicationId is required.");
    }
    const tenantId = tenantIdFrom(context);
    const permission = this.permission(context, "manage");
    const documentId = randomUUID();
    const objectKey = `${tenantId}/documents/${documentId}`;
    const document = await this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      [permission],
      async (transaction) => {
        await this.assertReferences(
          transaction,
          tenantId,
          input.customerId,
          input.applicationId,
        );
        const [created] = await transaction
          .insert(documents)
          .values({
            id: documentId,
            tenantId,
            customerId: input.customerId,
            applicationId: input.applicationId,
            category: input.category,
            originalFileName: input.originalFileName,
            objectKey,
            mimeType: input.mimeType,
            sizeBytes: input.sizeBytes,
            sha256: input.sha256,
            createdBy: context.user.id,
          })
          .returning();
        await recordAudit(
          transaction,
          context,
          "document.upload_requested",
          "document",
          documentId,
          {
            category: input.category,
            mimeType: input.mimeType,
            sizeBytes: input.sizeBytes,
          },
        );
        return created;
      },
    );
    const upload = await this.storage.createUploadUrl({
      objectKey,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      sha256Hex: input.sha256,
    });
    return { document, upload };
  }

  async confirm(context: AuthorizationContext, documentId: string) {
    const tenantId = tenantIdFrom(context);
    const permission = this.permission(context, "manage");
    const document = await this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      [permission],
      async (transaction) => {
        const [value] = await transaction
          .select()
          .from(documents)
          .where(and(eq(documents.tenantId, tenantId), eq(documents.id, documentId)))
          .limit(1);
        if (value === undefined) {
          throw new NotFoundException("Document not found.");
        }
        if (!["requested", "uploading"].includes(value.status)) {
          throw new ConflictException("Document upload was already finalized.");
        }
        return value;
      },
    );

    const metadata = await this.storage.head(document.objectKey);
    const expectedChecksum = Buffer.from(document.sha256, "hex").toString("base64");
    if (
      metadata.contentLength !== document.sizeBytes ||
      metadata.contentType !== document.mimeType ||
      metadata.sha256Metadata !== document.sha256 ||
      (metadata.checksumSha256 !== undefined &&
        metadata.checksumSha256 !== expectedChecksum)
    ) {
      throw new ConflictException(
        "Uploaded object metadata does not match the request.",
      );
    }

    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      [permission],
      async (transaction) => {
        const now = new Date().toISOString();
        const [updated] = await transaction
          .update(documents)
          .set({ status: "uploaded", uploadedAt: now })
          .where(
            and(
              eq(documents.tenantId, tenantId),
              eq(documents.id, documentId),
              or(eq(documents.status, "requested"), eq(documents.status, "uploading")),
            ),
          )
          .returning();
        if (updated === undefined) {
          throw new ConflictException("Document upload changed concurrently.");
        }
        await recordAudit(
          transaction,
          context,
          "document.upload_confirmed",
          "document",
          documentId,
          { sha256: document.sha256 },
        );
        return updated;
      },
    );
  }

  async download(context: AuthorizationContext, documentId: string) {
    const tenantId = tenantIdFrom(context);
    const permission = this.permission(context, "read");
    const document = await this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      [permission],
      async (transaction) => {
        const [value] = await transaction
          .select()
          .from(documents)
          .where(and(eq(documents.tenantId, tenantId), eq(documents.id, documentId)))
          .limit(1);
        if (value === undefined || !["uploaded", "verified"].includes(value.status)) {
          throw new NotFoundException("Uploaded document not found.");
        }
        await recordAudit(
          transaction,
          context,
          "document.download_authorized",
          "document",
          documentId,
        );
        return value;
      },
    );
    return this.storage.createDownloadUrl(document.objectKey);
  }

  private permission(
    context: AuthorizationContext,
    operation: "read" | "manage",
  ): string {
    if (
      context.permissions.has(
        operation === "read" ? "documents.read" : "documents.manage",
      )
    ) {
      return operation === "read" ? "documents.read" : "documents.manage";
    }
    return "self.documents.manage";
  }

  private async assertReferences(
    transaction: Parameters<Parameters<DatabaseService["withTenantTransaction"]>[3]>[0],
    tenantId: string,
    customerId?: string,
    applicationId?: string,
  ): Promise<void> {
    let applicationCustomerId: string | null | undefined;
    if (applicationId !== undefined) {
      const [application] = await transaction
        .select({ customerId: financingApplications.customerId })
        .from(financingApplications)
        .where(
          and(
            eq(financingApplications.tenantId, tenantId),
            eq(financingApplications.id, applicationId),
          ),
        )
        .limit(1);
      if (application === undefined) {
        throw new BadRequestException("Application not found.");
      }
      applicationCustomerId = application.customerId;
    }
    if (customerId !== undefined) {
      const [customer] = await transaction
        .select({ id: customers.id })
        .from(customers)
        .where(and(eq(customers.tenantId, tenantId), eq(customers.id, customerId)))
        .limit(1);
      if (customer === undefined) {
        throw new BadRequestException("Customer not found.");
      }
    }
    if (
      customerId !== undefined &&
      applicationCustomerId !== null &&
      applicationCustomerId !== undefined &&
      applicationCustomerId !== customerId
    ) {
      throw new BadRequestException(
        "Document customer does not match the application customer.",
      );
    }
  }
}
