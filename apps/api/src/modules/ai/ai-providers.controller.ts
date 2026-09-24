import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { AdminOnly, Audience, AuthGuard, ManagerGuard, Roles, RolesGuard } from "../../shared/jwt/guards";
import { AiService } from "./ai.service";
import { BulkCreateLlmProvidersDto, CreateLlmProviderDto, UpdateLlmProviderDto } from "./ai.dto";

/**
 * Admin endpoints for managing AI provider rows.
 *
 * Lives under `/admin/ai/providers` so the URL is grouped with the
 * generation endpoint under `/admin/ai`. The "test connection" +
 * "set as default" actions are sub-resources of a specific row.
 *
 * All mutating endpoints require `AdminOnly` (not Manager) because
 * we expose raw API keys on POST/PATCH and we don't want store
 * managers to be able to rotate them.
 *
 * On list / get we DELIBERATELY return `apiKeyCipher` / `apiKeyIv` /
 * `apiKeyTag` so the admin UI can render "key configured" indicators
 * — the values are useless ciphertext without the LLM_ENCRYPTION_KEY
 * env var, so leaking the row is safe.
 */
@ApiTags("admin/ai")
@Controller("admin/ai/providers")
@UseGuards(AuthGuard, RolesGuard, ManagerGuard)
@Roles("ADMIN", "MANAGER")
@Audience("admin" as any)
@ApiBearerAuth("Admin")
export class AiProvidersController {
  constructor(private readonly ai: AiService) {}

  @Get()
  async list() {
    return this.ai.listProviders();
  }

  @Post()
  @AdminOnly()
  async create(@Body() body: CreateLlmProviderDto, @Req() req: Request) {
    const actorId = (req as any).userId ?? null;
    return this.ai.createProvider(body, actorId);
  }

  /**
   * Bulk-create up to 50 LLM provider rows in a single request.
   *
   * Useful when wiring up a fresh deployment: paste a list of
   * providers + API keys in one go instead of clicking Add N times.
   *
   * Returns `{ created, errors }` so per-row failures don't roll back
   * the whole batch — operators fix the bad rows and retry just those.
   * Same AdminOnly guard as the single-create route.
   */
  @Post("bulk")
  @AdminOnly()
  async bulkCreate(
    @Body() body: BulkCreateLlmProvidersDto,
    @Req() req: Request,
  ) {
    const actorId = (req as any).userId ?? null;
    return this.ai.bulkCreateProviders(body.providers, actorId);
  }

  @Patch(":id")
  @AdminOnly()
  async update(@Param("id") id: string, @Body() body: UpdateLlmProviderDto) {
    return this.ai.updateProvider(id, body);
  }

  @Delete(":id")
  @AdminOnly()
  async remove(@Param("id") id: string) {
    await this.ai.deleteProvider(id);
    return { ok: true };
  }

  @Post(":id/test")
  @AdminOnly()
  async test(@Param("id") id: string) {
    return this.ai.testProvider(id);
  }

  @Post(":id/set-default")
  @AdminOnly()
  async setDefault(@Param("id") id: string) {
    return this.ai.setDefault(id);
  }
}
