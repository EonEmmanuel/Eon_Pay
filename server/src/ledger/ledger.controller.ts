import { Controller, Get, Param } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiTags } from "@nestjs/swagger";
import {
  CurrentAuthorization,
  RequirePermissions,
  RequirePlatformPermissions,
} from "../common/decorators.js";
import type { AuthorizationContext } from "../common/request-context.js";
import { IdParamDto } from "../common/validation.js";
import { LedgerService } from "./ledger.service.js";

@ApiTags("ledger and audit")
@ApiBearerAuth()
@ApiHeader({ name: "X-Tenant-Id", required: true })
@Controller()
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  @RequirePermissions("ledger.read")
  @Get("ledger/accounts")
  accounts(@CurrentAuthorization() context: AuthorizationContext) {
    return this.ledger.accounts(context);
  }

  @RequirePermissions("ledger.read")
  @Get("ledger/entries")
  entries(@CurrentAuthorization() context: AuthorizationContext) {
    return this.ledger.entries(context);
  }

  @RequirePermissions("ledger.read")
  @Get("ledger/entries/:id")
  entry(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param() params: IdParamDto,
  ) {
    return this.ledger.entry(context, params.id);
  }

  @RequirePermissions("audit.read")
  @Get("audit-events")
  audit(@CurrentAuthorization() context: AuthorizationContext) {
    return this.ledger.audit(context);
  }

  @RequirePermissions("audit.read")
  @Get("audit-events/verify")
  verifyAudit(@CurrentAuthorization() context: AuthorizationContext) {
    return this.ledger.verifyAudit(context);
  }
}

@ApiTags("platform audit")
@ApiBearerAuth()
@Controller("platform/audit-events")
export class PlatformAuditController {
  constructor(private readonly ledger: LedgerService) {}

  @RequirePlatformPermissions("platform.audit.read")
  @Get()
  audit(@CurrentAuthorization() context: AuthorizationContext) {
    return this.ledger.platformAudit(context);
  }

  @RequirePlatformPermissions("platform.audit.read")
  @Get("verify")
  verifyAudit(@CurrentAuthorization() context: AuthorizationContext) {
    return this.ledger.verifyPlatformAudit(context);
  }
}
