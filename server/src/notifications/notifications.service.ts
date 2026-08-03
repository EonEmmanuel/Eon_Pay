import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnApplicationShutdown,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, desc, eq, isNull } from "drizzle-orm";
import { Pool, type PoolClient } from "pg";
import type { AuthorizationContext } from "../common/request-context.js";
import { tenantIdFrom } from "../common/persistence.js";
import type { Environment } from "../config/environment.js";
import { DatabaseService } from "../database/database.service.js";
import { postgresPoolConfig } from "../database/connection.js";
import { notificationPreferences, notifications } from "../database/schema.js";
import type { UpdateNotificationPreferencesDto } from "./notifications.dto.js";

@Injectable()
export class NotificationsService implements OnModuleInit, OnApplicationShutdown {
  private workerTimer?: ReturnType<typeof setInterval>;
  private processing = false;
  private readonly workerPool?: Pool;

  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService<Environment, true>,
  ) {
    const connectionString = this.config.get("NOTIFICATION_DATABASE_URL", {
      infer: true,
    });
    if (connectionString !== undefined) {
      this.workerPool = new Pool(
        postgresPoolConfig(connectionString, {
          max: 2,
          application_name: "investor-ready-notification-worker",
          idleTimeoutMillis: 30_000,
          connectionTimeoutMillis: 10_000,
        }),
      );
    }
  }

  onModuleInit(): void {
    if (
      this.config.get("RESEND_API_KEY", { infer: true }) === undefined ||
      this.workerPool === undefined
    ) {
      return;
    }
    this.workerTimer = setInterval(() => void this.processEmailOutbox(), 30_000);
    this.workerTimer.unref();
    void this.processEmailOutbox();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.workerTimer !== undefined) clearInterval(this.workerTimer);
    await this.workerPool?.end();
  }

  tenantNotifications(context: AuthorizationContext) {
    const tenantId = tenantIdFrom(context);
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      [],
      (transaction) => this.list(transaction, context.user.id, tenantId),
    );
  }

  platformNotifications(context: AuthorizationContext) {
    return this.database.withPlatformTransaction(context.user.id, [], (transaction) =>
      this.list(transaction, context.user.id, null),
    );
  }

  preferences(context: AuthorizationContext) {
    return this.database.withIdentityTransaction(
      context.user.id,
      async (transaction) => {
        const [preference] = await transaction
          .select()
          .from(notificationPreferences)
          .where(eq(notificationPreferences.userId, context.user.id))
          .limit(1);
        return preference ?? defaultPreferences(context.user.id);
      },
    );
  }

  updatePreferences(
    context: AuthorizationContext,
    input: UpdateNotificationPreferencesDto,
  ) {
    if ((input.quietHoursStart === undefined) !== (input.quietHoursEnd === undefined)) {
      throw new BadRequestException("Quiet hours require both a start and end time.");
    }
    return this.database.withIdentityTransaction(
      context.user.id,
      async (transaction) => {
        const [updated] = await transaction
          .insert(notificationPreferences)
          .values({ userId: context.user.id, ...input })
          .onConflictDoUpdate({
            target: notificationPreferences.userId,
            set: input,
          })
          .returning();
        return updated;
      },
    );
  }

  markRead(context: AuthorizationContext, id: string, platform: boolean) {
    return this.updateState(context, id, platform, {
      readAt: new Date().toISOString(),
    });
  }

  acknowledge(context: AuthorizationContext, id: string, platform: boolean) {
    const now = new Date().toISOString();
    return this.updateState(context, id, platform, {
      readAt: now,
      acknowledgedAt: now,
    });
  }

  archive(context: AuthorizationContext, id: string, platform: boolean) {
    return this.updateState(context, id, platform, {
      archivedAt: new Date().toISOString(),
    });
  }

  markSoundPlayed(context: AuthorizationContext, id: string, platform: boolean) {
    return this.updateState(context, id, platform, {
      soundPlayedAt: new Date().toISOString(),
    });
  }

  markAllRead(context: AuthorizationContext, platform: boolean) {
    const now = new Date().toISOString();
    const work = async (transaction: Parameters<typeof this.list>[0]) => {
      const scope = platform
        ? isNull(notifications.tenantId)
        : eq(notifications.tenantId, tenantIdFrom(context));
      await transaction
        .update(notifications)
        .set({ readAt: now })
        .where(
          and(
            eq(notifications.userId, context.user.id),
            scope,
            isNull(notifications.readAt),
          ),
        );
      return { updatedAt: now };
    };
    return platform
      ? this.database.withPlatformTransaction(context.user.id, [], work)
      : this.database.withTenantTransaction(
          context.user.id,
          tenantIdFrom(context),
          [],
          work,
        );
  }

  private async list(
    transaction: Parameters<
      Parameters<DatabaseService["withIdentityTransaction"]>[1]
    >[0],
    userId: string,
    tenantId: string | null,
  ) {
    const rows = await transaction
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          tenantId === null
            ? isNull(notifications.tenantId)
            : eq(notifications.tenantId, tenantId),
          isNull(notifications.archivedAt),
        ),
      )
      .orderBy(desc(notifications.createdAt))
      .limit(75);
    return {
      items: rows,
      unreadCount: rows.filter((row) => row.readAt === null).length,
    };
  }

  private updateState(
    context: AuthorizationContext,
    id: string,
    platform: boolean,
    values: Partial<
      Pick<
        typeof notifications.$inferInsert,
        "readAt" | "acknowledgedAt" | "archivedAt" | "soundPlayedAt"
      >
    >,
  ) {
    const work = async (transaction: Parameters<typeof this.list>[0]) => {
      const scope = platform
        ? isNull(notifications.tenantId)
        : eq(notifications.tenantId, tenantIdFrom(context));
      const [updated] = await transaction
        .update(notifications)
        .set(values)
        .where(
          and(
            eq(notifications.id, id),
            eq(notifications.userId, context.user.id),
            scope,
          ),
        )
        .returning();
      if (updated === undefined) throw new NotFoundException("Notification not found.");
      return updated;
    };
    return platform
      ? this.database.withPlatformTransaction(context.user.id, [], work)
      : this.database.withTenantTransaction(
          context.user.id,
          tenantIdFrom(context),
          [],
          work,
        );
  }

  private async processEmailOutbox(): Promise<void> {
    if (this.processing) return;
    const apiKey = this.config.get("RESEND_API_KEY", { infer: true });
    const from = this.config.get("NOTIFICATION_FROM_EMAIL", { infer: true });
    if (apiKey === undefined || from === undefined) return;
    this.processing = true;
    try {
      const jobs = await this.withOutbox(async (client) => {
        const result = await client.query<EmailJob>(`
            WITH candidates AS (
              SELECT outbox.id, outbox.notification_id, outbox.recipient_email,
                     notification.title, notification.message
              FROM public.notification_email_outbox outbox
              JOIN public.notifications notification ON notification.id = outbox.notification_id
              WHERE outbox.status IN ('pending', 'failed')
                AND outbox.attempts < 5
                AND outbox.next_attempt_at <= now()
              ORDER BY outbox.created_at
              FOR UPDATE OF outbox SKIP LOCKED
              LIMIT 10
            ), claimed AS (
              UPDATE public.notification_email_outbox outbox
              SET attempts = outbox.attempts + 1,
                  next_attempt_at = now() + interval '2 minutes'
              FROM candidates
              WHERE outbox.id = candidates.id
              RETURNING outbox.id
            )
            SELECT candidates.* FROM candidates JOIN claimed USING (id)
          `);
        return result.rows;
      });
      for (const job of jobs) await this.deliverEmail(job, apiKey, from);
    } finally {
      this.processing = false;
    }
  }

  private async deliverEmail(job: EmailJob, apiKey: string, from: string) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
          "idempotency-key": `notification-${job.notification_id}`,
          "user-agent": "investor-ready-notifications/1.0",
        },
        body: JSON.stringify({
          from,
          to: [job.recipient_email],
          subject: job.title,
          text: job.message,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`Resend returned status ${response.status}.`);
      await this.completeEmail(job.id, true);
    } catch (error) {
      await this.completeEmail(
        job.id,
        false,
        error instanceof Error ? error.message : "Email delivery failed.",
      );
    }
  }

  private completeEmail(id: string, sent: boolean, lastError?: string) {
    return this.withOutbox(async (client) => {
      await client.query(
        `
        UPDATE public.notification_email_outbox
        SET status = $1::public.notification_email_status,
            sent_at = $2::timestamptz,
            last_error = $3
        WHERE id = $4::uuid
        `,
        [
          sent ? "sent" : "failed",
          sent ? new Date().toISOString() : null,
          lastError ?? null,
          id,
        ],
      );
    });
  }

  private async withOutbox<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    if (this.workerPool === undefined) {
      throw new Error("The notification worker database is not configured.");
    }
    const client = await this.workerPool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE app_notification_worker");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

interface EmailJob {
  id: string;
  notification_id: string;
  recipient_email: string;
  title: string;
  message: string;
}

function defaultPreferences(userId: string) {
  return {
    userId,
    soundEnabled: false,
    soundMinimumSeverity: "warning" as const,
    emailEnabled: false,
    emailMinimumSeverity: "critical" as const,
    quietHoursStart: null,
    quietHoursEnd: null,
    updatedAt: new Date(0).toISOString(),
  };
}
