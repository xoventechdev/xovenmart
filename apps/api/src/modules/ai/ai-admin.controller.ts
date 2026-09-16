import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { Audience, AuthGuard, ManagerGuard, Roles, RolesGuard } from "../../shared/jwt/guards";
import { AiService } from "./ai.service";
import { GenerateProductCopyDto } from "./ai.dto";

/**
 * Admin endpoints for AI-generation features.
 *
 * `POST /admin/ai/generate-product-copy` is the only call the product
 * form makes today. Future features (alt-text on upload, search-
 * rewriter on the public site, etc.) drop new endpoints into this
 * controller — same auth, same service, same provider resolution.
 *
 * `GET /admin/ai/usage` powers the "Recent usage" card on the AI
 * Providers page; it lists the most recent `AiUsageEvent` rows so
 * the admin can see what their spend looks like without leaving the
 * admin UI.
 */
@ApiTags("admin/ai")
@Controller("admin/ai")
@UseGuards(AuthGuard, RolesGuard, ManagerGuard)
@Roles("ADMIN", "MANAGER")
@Audience("admin" as any)
@ApiBearerAuth("Admin")
export class AiAdminController {
  constructor(private readonly ai: AiService) {}

  @Post("generate-product-copy")
  async generateProductCopy(
    @Body() body: GenerateProductCopyDto,
    @Req() req: Request,
  ) {
    const actorId = (req as any).userId ?? "unknown";
    return this.ai.generateProductCopy(body, actorId);
  }

  @Get("usage")
  async listUsage(@Query("limit") limitRaw?: string) {
    const limit = Math.min(Math.max(Number(limitRaw ?? 20) || 20, 1), 100);
    return this.ai.listRecentUsage(limit);
  }
}
