import { Buffer } from "node:buffer";
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Environment } from "../config/environment.js";

export interface StoredObjectMetadata {
  contentLength: number;
  checksumSha256?: string;
  sha256Metadata?: string;
  contentType?: string;
}

@Injectable()
export class SupabaseStorageProvider {
  private readonly bucket: string;
  private readonly productImageBucket: string;
  private readonly supabaseUrl: string;
  private readonly client?: S3Client;

  constructor(config: ConfigService<Environment, true>) {
    this.bucket = config.get("SUPABASE_STORAGE_BUCKET", { infer: true });
    this.productImageBucket = config.get("SUPABASE_PRODUCT_IMAGE_BUCKET", {
      infer: true,
    });
    this.supabaseUrl = config.get("SUPABASE_URL", { infer: true }).replace(/\/$/, "");
    const endpoint = config.get("SUPABASE_STORAGE_S3_ENDPOINT", { infer: true });
    const region = config.get("SUPABASE_STORAGE_REGION", { infer: true });
    const accessKeyId = config.get("SUPABASE_STORAGE_ACCESS_KEY_ID", {
      infer: true,
    });
    const secretAccessKey = config.get("SUPABASE_STORAGE_SECRET_ACCESS_KEY", {
      infer: true,
    });
    if (
      endpoint !== undefined &&
      region !== undefined &&
      accessKeyId !== undefined &&
      secretAccessKey !== undefined
    ) {
      this.client = new S3Client({
        endpoint,
        region,
        forcePathStyle: true,
        credentials: { accessKeyId, secretAccessKey },
      });
    }
  }

  get configured(): boolean {
    return this.client !== undefined;
  }
  async createUploadUrl(input: {
    objectKey: string;
    mimeType: string;
    sizeBytes: number;
    sha256Hex: string;
  }): Promise<{ url: string; headers: Record<string, string>; expiresIn: number }> {
    return this.createUploadUrlForBucket(this.bucket, input);
  }

  private async createUploadUrlForBucket(
    bucket: string,
    input: {
      objectKey: string;
      mimeType: string;
      sizeBytes: number;
      sha256Hex: string;
    },
  ): Promise<{ url: string; headers: Record<string, string>; expiresIn: number }> {
    const client = this.requireClient();
    const checksum = Buffer.from(input.sha256Hex, "hex").toString("base64");
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: input.objectKey,
      ContentType: input.mimeType,
      ContentLength: input.sizeBytes,
      ChecksumSHA256: checksum,
      Metadata: { sha256: input.sha256Hex },
    });
    const expiresIn = 600;
    return {
      url: await getSignedUrl(client, command, { expiresIn }),
      headers: {
        "content-type": input.mimeType,
        "x-amz-checksum-sha256": checksum,
        "x-amz-meta-sha256": input.sha256Hex,
      },
      expiresIn,
    };
  }

  createProductImageUploadUrl(input: {
    objectKey: string;
    mimeType: string;
    sizeBytes: number;
    sha256Hex: string;
  }) {
    return this.createUploadUrlForBucket(this.productImageBucket, input);
  }

  headProductImage(objectKey: string): Promise<StoredObjectMetadata> {
    return this.headFromBucket(this.productImageBucket, objectKey);
  }

  productImageUrl(objectKey: string): string {
    const bucket = encodeURIComponent(this.productImageBucket);
    const key = objectKey.split("/").map(encodeURIComponent).join("/");
    return `${this.supabaseUrl}/storage/v1/object/public/${bucket}/${key}`;
  }

  async head(objectKey: string): Promise<StoredObjectMetadata> {
    return this.headFromBucket(this.bucket, objectKey);
  }

  private async headFromBucket(
    bucket: string,
    objectKey: string,
  ): Promise<StoredObjectMetadata> {
    const response = await this.requireClient().send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        ChecksumMode: "ENABLED",
      }),
    );
    return {
      contentLength: response.ContentLength ?? -1,
      ...(response.ChecksumSHA256 === undefined
        ? {}
        : { checksumSha256: response.ChecksumSHA256 }),
      ...(response.Metadata?.["sha256"] === undefined
        ? {}
        : { sha256Metadata: response.Metadata["sha256"] }),
      ...(response.ContentType === undefined
        ? {}
        : { contentType: response.ContentType }),
    };
  }

  async createDownloadUrl(
    objectKey: string,
  ): Promise<{ url: string; expiresIn: number }> {
    const expiresIn = 300;
    return {
      url: await getSignedUrl(
        this.requireClient(),
        new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }),
        { expiresIn },
      ),
      expiresIn,
    };
  }

  private requireClient(): S3Client {
    if (this.client === undefined) {
      throw new ServiceUnavailableException(
        "Supabase document storage is not configured.",
      );
    }
    return this.client;
  }
}
