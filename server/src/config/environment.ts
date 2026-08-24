import { z } from "zod";

const booleanFromString = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
    DATABASE_URL: z.string().url().startsWith("postgresql://"),
    DATABASE_MIGRATION_URL: z.string().url().startsWith("postgresql://").optional(),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
    SUPABASE_URL: z.string().url(),
    SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
    SUPABASE_INVITE_REDIRECT_URL: z.string().url().optional(),
    SUPABASE_JWT_AUDIENCE: z.string().min(1).default("authenticated"),
    SUPABASE_STORAGE_S3_ENDPOINT: z.string().url().optional(),
    SUPABASE_STORAGE_REGION: z.string().min(1).optional(),
    SUPABASE_STORAGE_ACCESS_KEY_ID: z.string().min(1).optional(),
    SUPABASE_STORAGE_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    SUPABASE_STORAGE_BUCKET: z.string().min(1).default("private-documents"),
    SUPABASE_PRODUCT_IMAGE_BUCKET: z.string().min(1).default("product-images"),
    DIDIT_API_KEY: z.string().min(1).optional(),
    DIDIT_WORKFLOW_ID: z.string().uuid().optional(),
    DIDIT_KYB_WORKFLOW_ID: z.string().uuid().optional(),
    DIDIT_WEBHOOK_SECRET: z.string().min(16).optional(),
    DIDIT_CALLBACK_URL: z.string().url().optional(),
    DIDIT_KYB_CALLBACK_URL: z.string().url().optional(),
    DIDIT_KYB_POLLING_FALLBACK_ENABLED: booleanFromString,
    DIDIT_KYC_POLLING_FALLBACK_ENABLED: booleanFromString,
    RESEND_API_KEY: z.string().min(1).optional(),
    NOTIFICATION_FROM_EMAIL: z.string().min(3).optional(),
    NOTIFICATION_DATABASE_URL: z.string().url().startsWith("postgresql://").optional(),
    ESPER_TENANT_NAME: z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .optional(),
    ESPER_API_KEY: z.string().min(1).optional(),
    ESPER_ENTERPRISE_ID: z.string().uuid().optional(),
    DPC_POLICY_PRIVATE_KEY_BASE64: z.string().min(40).optional(),
    DPC_APK_DOWNLOAD_URL: z.string().url().optional(),
    DPC_APK_SIGNATURE_CHECKSUM: z.string().min(20).optional(),
    DPC_ENROLLMENT_TTL_MINUTES: z.coerce.number().int().min(5).max(1440).default(15),
    DPC_POLICY_TTL_MINUTES: z.coerce.number().int().min(5).max(1440).default(360),
    DPC_OFFLINE_GRACE_HOURS: z.coerce.number().int().min(1).max(720).default(48),
    FIREBASE_SERVICE_ACCOUNT_BASE64: z.string().min(100).optional(),
    PLAY_INTEGRITY_ENABLED: booleanFromString,
    PLAY_INTEGRITY_SERVICE_ACCOUNT_BASE64: z.string().min(100).optional(),
    DPC_ANDROID_PACKAGE_NAME: z
      .string()
      .regex(/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/)
      .default("com.eonpay.deviceagent"),
    MTN_MOMO_WEBHOOK_SECRET: z.string().min(16).optional(),
    ORANGE_MONEY_WEBHOOK_SECRET: z.string().min(16).optional(),
    CORS_ORIGINS: z.string().default("http://localhost:5173"),
    TRUST_PROXY: booleanFromString,
    API_DOCS_ENABLED: z
      .enum(["true", "false"])
      .optional()
      .transform((value) => value === undefined || value === "true"),
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV === "production" && value.DIDIT_KYB_POLLING_FALLBACK_ENABLED) {
      context.addIssue({
        code: "custom",
        path: ["DIDIT_KYB_POLLING_FALLBACK_ENABLED"],
        message: "The Didit polling fallback cannot be enabled in production.",
      });
    }
    if (value.NODE_ENV === "production" && value.DIDIT_KYC_POLLING_FALLBACK_ENABLED) {
      context.addIssue({
        code: "custom",
        path: ["DIDIT_KYC_POLLING_FALLBACK_ENABLED"],
        message: "The Didit KYC polling fallback cannot be enabled in production.",
      });
    }
    if (
      value.PLAY_INTEGRITY_ENABLED &&
      value.PLAY_INTEGRITY_SERVICE_ACCOUNT_BASE64 === undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["PLAY_INTEGRITY_SERVICE_ACCOUNT_BASE64"],
        message: "Required when PLAY_INTEGRITY_ENABLED is true.",
      });
    }
    const groups = [
      [
        "SUPABASE_STORAGE_S3_ENDPOINT",
        "SUPABASE_STORAGE_REGION",
        "SUPABASE_STORAGE_ACCESS_KEY_ID",
        "SUPABASE_STORAGE_SECRET_ACCESS_KEY",
      ],
      ["SUPABASE_PUBLISHABLE_KEY", "SUPABASE_INVITE_REDIRECT_URL"],
      ["DIDIT_API_KEY", "DIDIT_WORKFLOW_ID", "DIDIT_WEBHOOK_SECRET"],
      ["DIDIT_KYB_WORKFLOW_ID", "DIDIT_KYB_CALLBACK_URL"],
      ["RESEND_API_KEY", "NOTIFICATION_FROM_EMAIL", "NOTIFICATION_DATABASE_URL"],
      ["ESPER_TENANT_NAME", "ESPER_API_KEY", "ESPER_ENTERPRISE_ID"],
      [
        "DPC_POLICY_PRIVATE_KEY_BASE64",
        "DPC_APK_DOWNLOAD_URL",
        "DPC_APK_SIGNATURE_CHECKSUM",
      ],
    ] as const;

    for (const group of groups) {
      const configured = group.filter((key) => value[key] !== undefined);
      if (configured.length > 0 && configured.length !== group.length) {
        for (const key of group.filter((entry) => value[entry] === undefined)) {
          context.addIssue({
            code: "custom",
            path: [key],
            message: `Required when ${configured.join(", ")} is configured.`,
          });
        }
      }
    }
  });

export type Environment = z.infer<typeof environmentSchema>;

export function validateEnvironment(input: Record<string, unknown>): Environment {
  const result = environmentSchema.safeParse(input);

  if (!result.success) {
    const message = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid server environment: ${message}`);
  }

  return result.data;
}

export function parseCorsOrigins(value: string): string[] {
  const origins = value
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (origins.some((origin) => origin === "*")) {
    throw new Error("CORS_ORIGINS must contain exact origins, not '*'.");
  }

  return origins;
}
