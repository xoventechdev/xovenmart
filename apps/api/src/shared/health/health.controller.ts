import { Controller, Get } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { PrismaService } from "../prisma/prisma.module";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: "Liveness probe" })
  health() {
    return { status: "ok", service: "xovenmart-api", timestamp: new Date().toISOString() };
  }

  @Get("ready")
  @ApiOperation({ summary: "Readiness probe (checks DB connectivity)" })
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: "ready", db: "ok", timestamp: new Date().toISOString() };
    } catch (e) {
      return { status: "not_ready", db: "error", timestamp: new Date().toISOString() };
    }
  }
}
