import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Public } from "../common/decorators.js";
import { DatabaseService } from "../database/database.service.js";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Public()
  @Get("live")
  live(): { status: "ok" } {
    return { status: "ok" };
  }

  @Public()
  @Get("ready")
  async ready(): Promise<{ status: "ok" }> {
    try {
      await this.database.healthCheck();
      return { status: "ok" };
    } catch {
      throw new ServiceUnavailableException("Database is unavailable.");
    }
  }
}
