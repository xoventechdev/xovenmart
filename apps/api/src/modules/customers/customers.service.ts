import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Request } from "express";
import { UserRole } from "@prisma/client";
import { PrismaService } from "../../shared/prisma/prisma.module";
import { CreateAddressDto, UpdateAddressDto, UpdateProfileDto } from "./dto";

/**
 * Customer self-service endpoints: profile + saved-address CRUD.
 *
 * All methods assume the caller is an authenticated CUSTOMER. Ownership
 * checks use `req.userId` and throw `NotFoundException` (NOT
 * `ForbiddenException`) when the row doesn't belong to the caller, so the
 * API never leaks existence of other users' rows.
 */
@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);

  constructor(private readonly prisma: PrismaService) {}

  private userIdOf(req: Request): string {
    const id = (req as any).userId;
    if (!id) throw new NotFoundException("User not found");
    return id;
  }

  // ────────────────────────────────────────── Profile ──

  async getProfile(req: Request) {
    const userId = this.userIdOf(req);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        phone: true,
        name: true,
        email: true,
        referralCode: true,
        registeredAt: true,
        createdAt: true,
      },
    });
    if (!user) throw new NotFoundException("User not found");
    return { user };
  }

  async updateProfile(req: Request, dto: UpdateProfileDto) {
    const userId = this.userIdOf(req);
    const email = dto.email?.trim() ? dto.email.trim().toLowerCase() : null;

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: dto.name.trim(),
        email,
      },
      select: {
        id: true,
        phone: true,
        name: true,
        email: true,
        referralCode: true,
        registeredAt: true,
        createdAt: true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: userId,
        // The audit_logs.actorRole column is the `UserRole` enum
        // (ADMIN | MANAGER | RIDER) — there is no CUSTOMER variant yet.
        // Customer self-actions are still useful to audit, so we record
        // them under the closest existing role flag. Future: add
        // CUSTOMER to the enum.
        actorRole: UserRole.ADMIN,
        entity: "user",
        entityId: userId,
        action: "profile.update",
        diff: { name: updated.name, email: updated.email },
      },
    });

    return { user: updated };
  }

  // ────────────────────────────────────────── Addresses ──

  async listAddresses(req: Request) {
    const userId = this.userIdOf(req);
    const addresses = await this.prisma.address.findMany({
      where: { userId },
      // Default first, then most recently created.
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
    return { addresses };
  }

  async createAddress(req: Request, dto: CreateAddressDto) {
    const userId = this.userIdOf(req);

    // If this is the user's very first address and isDefault wasn't
    // explicitly set, force isDefault=true so they always have a default
    // address to fall back to.
    const existingCount = await this.prisma.address.count({ where: { userId } });
    const wantsDefault =
      dto.isDefault === true || (dto.isDefault === undefined && existingCount === 0);

    return this.prisma.$transaction(async (tx) => {
      if (wantsDefault) {
        await tx.address.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }
      const address = await tx.address.create({
        data: {
          userId,
          label: dto.label?.trim() || null,
          area: dto.area.trim(),
          landmark: dto.landmark?.trim() || null,
          fullText: dto.fullText.trim(),
          lat: dto.lat ?? null,
          lng: dto.lng ?? null,
          isDefault: wantsDefault,
        },
      });
      return { address };
    });
  }

  async updateAddress(req: Request, id: string, dto: UpdateAddressDto) {
    const userId = this.userIdOf(req);

    // Ownership check — use NotFoundException to avoid existence leak.
    const existing = await this.prisma.address.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      throw new NotFoundException("Address not found");
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault === true && !existing.isDefault) {
        await tx.address.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }
      const data: any = {};
      if (dto.label !== undefined) data.label = dto.label?.trim() || null;
      if (dto.area !== undefined) data.area = dto.area.trim();
      if (dto.landmark !== undefined) data.landmark = dto.landmark?.trim() || null;
      if (dto.fullText !== undefined) data.fullText = dto.fullText.trim();
      if (dto.lat !== undefined) data.lat = dto.lat ?? null;
      if (dto.lng !== undefined) data.lng = dto.lng ?? null;
      if (dto.isDefault !== undefined) data.isDefault = dto.isDefault;
      const address = await tx.address.update({ where: { id }, data });
      return { address };
    });
  }

  async deleteAddress(req: Request, id: string) {
    const userId = this.userIdOf(req);

    const existing = await this.prisma.address.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      throw new NotFoundException("Address not found");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.address.delete({ where: { id } });
      // If we just deleted the default, promote the most recently created
      // remaining address to default (if any).
      if (existing.isDefault) {
        const fallback = await tx.address.findFirst({
          where: { userId },
          orderBy: { createdAt: "desc" },
        });
        if (fallback) {
          await tx.address.update({
            where: { id: fallback.id },
            data: { isDefault: true },
          });
        }
      }
    });

    return { ok: true };
  }
}
