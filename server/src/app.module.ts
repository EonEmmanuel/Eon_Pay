import {
  MiddlewareConsumer,
  Module,
  RequestMethod,
  type NestModule,
} from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AnalyticsModule } from "./analytics/analytics.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { AuthenticationGuard } from "./auth/authentication.guard.js";
import { AuthorizationGuard } from "./auth/authorization.guard.js";
import { HttpExceptionFilter } from "./common/http-exception.filter.js";
import { RequestIdMiddleware } from "./common/request-id.middleware.js";
import { validateEnvironment } from "./config/environment.js";
import { DatabaseModule } from "./database/database.module.js";
import { DevicesModule } from "./devices/devices.module.js";
import { DocumentsModule } from "./documents/documents.module.js";
import { HealthModule } from "./health/health.module.js";
import { TenantsModule } from "./tenants/tenants.module.js";
import { ApplicationsModule } from "./applications/applications.module.js";
import { ContractsModule } from "./contracts/contracts.module.js";
import { PaymentsModule } from "./payments/payments.module.js";
import { FeesModule } from "./fees/fees.module.js";
import { LedgerModule } from "./ledger/ledger.module.js";
import { KycModule } from "./kyc/kyc.module.js";
import { PortalModule } from "./portal/portal.module.js";
import { ProvidersModule } from "./providers/providers.module.js";
import { InvitationsModule } from "./invitations/invitations.module.js";
import { PlatformAccessModule } from "./platform-access/platform-access.module.js";
import { NotificationsModule } from "./notifications/notifications.module.js";
import { InventoryModule } from "./inventory/inventory.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnvironment,
    }),
    ThrottlerModule.forRoot([
      {
        name: "default",
        ttl: 60_000,
        limit: 120,
      },
    ]),
    DatabaseModule,
    ProvidersModule,
    InvitationsModule,
    PlatformAccessModule,
    AuthModule,
    HealthModule,
    TenantsModule,
    ApplicationsModule,
    ContractsModule,
    PaymentsModule,
    FeesModule,
    LedgerModule,
    PortalModule,
    DocumentsModule,
    KycModule,
    DevicesModule,
    AnalyticsModule,
    NotificationsModule,
    InventoryModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthenticationGuard },
    { provide: APP_GUARD, useClass: AuthorizationGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestIdMiddleware)
      .forRoutes({ path: "*path", method: RequestMethod.ALL });
  }
}
