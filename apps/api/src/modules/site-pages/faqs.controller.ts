import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { Audience, AuthGuard, Roles, RolesGuard } from "../../shared/jwt/guards";
import { PrismaService } from "../../shared/prisma/prisma.module";

@ApiTags("faqs")
@Controller("faqs")
export class FaqsPublicController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("public")
  @ApiOperation({ summary: "List published FAQs grouped by category. ?category=ordering" })
  list(@Query("category") category?: string) {
    return this.prisma.faq.findMany({
      where: { isPublished: true, ...(category ? { category } : {}) },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
  }
}

@ApiTags("admin/faqs")
@Controller("admin/faqs")
@UseGuards(AuthGuard, RolesGuard)
@Roles("ADMIN")
@Audience("admin" as any)
@ApiBearerAuth("Admin")
export class FaqsAdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@Query("category") category?: string) {
    return this.prisma.faq.findMany({
      where: category ? { category } : {},
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
  }

  @Post()
  async create(@Body() body: any, @Req() req: Request) {
    const actorId = (req as any).userId;
    return this.prisma.faq.create({
      data: {
        category: body.category || "general",
        questionBn: body.questionBn,
        questionEn: body.questionEn,
        answerBn: body.answerBn ?? "",
        answerEn: body.answerEn ?? "",
        isPublished: body.isPublished ?? true,
        sortOrder: body.sortOrder ?? 0,
        updatedBy: actorId,
      },
    });
  }

  @Patch(":id")
  async update(@Param("id") id: string, @Body() body: any, @Req() req: Request) {
    const actorId = (req as any).userId;
    return this.prisma.faq.update({
      where: { id },
      data: {
        ...(body.category !== undefined && { category: body.category }),
        ...(body.questionBn !== undefined && { questionBn: body.questionBn }),
        ...(body.questionEn !== undefined && { questionEn: body.questionEn }),
        ...(body.answerBn !== undefined && { answerBn: body.answerBn }),
        ...(body.answerEn !== undefined && { answerEn: body.answerEn }),
        ...(body.isPublished !== undefined && { isPublished: body.isPublished }),
        ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
        updatedBy: actorId,
      },
    });
  }

  @Delete(":id")
  async remove(@Param("id") id: string) {
    await this.prisma.faq.delete({ where: { id } });
    return { ok: true };
  }
}
