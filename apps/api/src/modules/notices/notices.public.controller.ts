import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { PrismaService } from "../../shared/prisma/prisma.module";

/**
 * Public, unauthenticated endpoint for the user-facing site (web + Android)
 * to fetch active site-wide notices for the marquee / alert strip.
 *
 * Mirrors the `useDeliveryPublic` pattern:
 *   - No guards, no JWT — anyone can read notices.
 *   - Filters server-side: only `isActive = true` AND time window covers
 *     "now" (`startsAt IS NULL OR startsAt <= now`, `endsAt IS NULL OR
 *     endsAt >= now`).
 *   - Orders by `sortOrder` then `createdAt` desc.
 *
 * Returns a plain array — the empty array is a valid response (the
 * frontend renders nothing in that case).
 */
@ApiTags("notices")
@Controller("notices")
export class NoticesPublicController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("public")
  async publicList() {
    const now = new Date();
    return this.prisma.notice.findMany({
      where: {
        isActive: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        textBn: true,
        textEn: true,
        linkUrl: true,
        linkLabelBn: true,
        linkLabelEn: true,
        severity: true,
        position: true,
      },
    });
  }
}
