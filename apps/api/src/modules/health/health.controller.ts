import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { DatabaseService } from "../../database/database.service.js";
import { Public } from "../identity/public.decorator.js";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Public()
  @Get("live")
  @ApiOkResponse({ description: "Process liveness" })
  live() {
    return { status: "ok" };
  }

  @Public()
  @Get("ready")
  @ApiOkResponse({ description: "Database readiness" })
  async ready() {
    await this.database.ping();
    return { status: "ok", checks: { database: "up" } };
  }
}
