import {
  BadRequestException,
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
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import * as bcrypt from "bcryptjs";
import { AdminOnly, Audience, AuthGuard, ManagerGuard, Roles, RolesGuard } from "../../shared/jwt/guards";
import { PrismaService } from "../../shared/prisma/prisma.module";

@ApiTags("admin/staff")
@Controller("admin/staff")
@UseGuards(AuthGuard, RolesGuard, ManagerGuard)
@Roles("ADMIN", "MANAGER")
@Audience("admin" as any)
@ApiBearerAuth("Admin")
export class StaffController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: "List admin/manager staff accounts" })
  async list(@Req() req: Request) {
    const role = (req as any).role;
    const where = role === "ADMIN" ? {} : { id: (req as any).userId };
    const staff = await this.prisma.adminUser.findMany({
      where,
      select: {
        id: true, email: true, name: true, phone: true, role: true, isActive: true,
        lastLoginAt: true, permissions: true, createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return staff;
  }

  @Post()
  @UseGuards(AuthGuard, RolesGuard, ManagerGuard)
  @Roles("ADMIN")
  @AdminOnly()
  @ApiOperation({ summary: "Create admin/manager staff (ADMIN only)" })
  async create(@Body() body: any, @Req() req: Request) {
    const actorId = (req as any).userId;
    const passwordHash = await bcrypt.hash(body.password, 12);
    const u = await this.prisma.adminUser.create({
      data: {
        email: body.email.toLowerCase(),
        passwordHash,
        name: body.name,
        phone: body.phone,
        role: body.role || "MANAGER",
        permissions: body.permissions ?? undefined,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId,
        actorRole: "ADMIN",
        entity: "staff",
        entityId: u.id,
        action: "create",
        diff: { email: u.email, role: u.role, name: u.name },
      },
    });
    return { id: u.id, email: u.email, name: u.name, role: u.role };
  }

  @Patch(":id")
  @UseGuards(AuthGuard, RolesGuard, ManagerGuard)
  @Roles("ADMIN")
  @AdminOnly()
  async update(@Param("id") id: string, @Body() body: any, @Req() req: Request) {
    const actorId = (req as any).userId;
    const data: any = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.phone !== undefined) data.phone = body.phone;
    if (body.role !== undefined) data.role = body.role;
    if (body.isActive !== undefined) data.isActive = body.isActive;
    if (body.permissions !== undefined) data.permissions = body.permissions;
    if (body.password) {
      data.passwordHash = await bcrypt.hash(body.password, 12);
    }
    const u = await this.prisma.adminUser.update({ where: { id }, data });
    await this.prisma.auditLog.create({
      data: {
        actorId, actorRole: "ADMIN", entity: "staff", entityId: id,
        action: "update", diff: body,
      },
    });
    return { id: u.id, email: u.email, name: u.name, role: u.role, isActive: u.isActive };
  }

  @Delete(":id")
  @UseGuards(AuthGuard, RolesGuard, ManagerGuard)
  @Roles("ADMIN")
  @AdminOnly()
  async remove(@Param("id") id: string, @Req() req: Request) {
    const actorId = (req as any).userId;
    // Prevent deleting/deactivating yourself
    if (id === actorId) {
      throw new BadRequestException("Cannot delete your own account");
    }
    await this.prisma.adminUser.update({ where: { id }, data: { isActive: false } });
    await this.prisma.auditLog.create({
      data: {
        actorId, actorRole: "ADMIN", entity: "staff", entityId: id, action: "soft_delete",
      },
    });
    return { ok: true };
  }
}

/**
 * Permission catalog — single source of truth shared by admin UI.
 * Tells the staff page which permissions are even possible.
 */
@ApiTags("admin/permissions")
@Controller("admin/permissions")
@UseGuards(AuthGuard, RolesGuard, ManagerGuard)
@Roles("ADMIN")
@AdminOnly()
@Audience("admin" as any)
@ApiBearerAuth("Admin")
export class PermissionsController {
  @Get("catalog")
  @ApiOperation({ summary: "List all permission keys + descriptions + role defaults" })
  catalog() {
    return PERMISSION_CATALOG;
  }
}

/** Permission key → { moduleBn, moduleEn, action, labelBn, labelEn, defaultRoles } */
export const PERMISSION_CATALOG: Array<{
  key: string;
  module: string;
  moduleBn: string;
  moduleEn: string;
  action: "view" | "create" | "update" | "delete" | "export";
  labelBn: string;
  labelEn: string;
  /** Which roles get this permission by default */
  defaultRoles: ("ADMIN" | "MANAGER")[];
  adminOnly?: boolean;
}> = [
  // ─── Orders ───
  { key: "orders.view", module: "orders", moduleBn: "অর্ডার", moduleEn: "Orders", action: "view", labelBn: "অর্ডার দেখুন", labelEn: "View orders", defaultRoles: ["ADMIN", "MANAGER"] },
  { key: "orders.update_status", module: "orders", moduleBn: "অর্ডার", moduleEn: "Orders", action: "update", labelBn: "স্ট্যাটাস পরিবর্তন", labelEn: "Change status", defaultRoles: ["ADMIN", "MANAGER"] },
  { key: "orders.assign_rider", module: "orders", moduleBn: "অর্ডার", moduleEn: "Orders", action: "update", labelBn: "রাইডার নিযুক্ত করুন", labelEn: "Assign rider", defaultRoles: ["ADMIN", "MANAGER"] },
  { key: "orders.cancel", module: "orders", moduleBn: "অর্ডার", moduleEn: "Orders", action: "delete", labelBn: "অর্ডার বাতিল", labelEn: "Cancel orders", defaultRoles: ["ADMIN", "MANAGER"] },
  { key: "orders.refund", module: "orders", moduleBn: "অর্ডার", moduleEn: "Orders", action: "update", labelBn: "রিফান্ড প্রসেস", labelEn: "Process refunds", defaultRoles: ["ADMIN"] },

  // ─── Products ───
  { key: "products.view", module: "products", moduleBn: "পণ্য", moduleEn: "Products", action: "view", labelBn: "পণ্য দেখুন", labelEn: "View products", defaultRoles: ["ADMIN", "MANAGER"] },
  { key: "products.create", module: "products", moduleBn: "পণ্য", moduleEn: "Products", action: "create", labelBn: "পণ্য যোগ", labelEn: "Create products", defaultRoles: ["ADMIN", "MANAGER"] },
  { key: "products.update", module: "products", moduleBn: "পণ্য", moduleEn: "Products", action: "update", labelBn: "পণ্য সম্পাদনা", labelEn: "Edit products", defaultRoles: ["ADMIN", "MANAGER"] },
  { key: "products.delete", module: "products", moduleBn: "পণ্য", moduleEn: "Products", action: "delete", labelBn: "পণ্য মুছুন", labelEn: "Delete products", defaultRoles: ["ADMIN"] },

  // ─── Categories ───
  { key: "categories.view", module: "categories", moduleBn: "ক্যাটাগরি", moduleEn: "Categories", action: "view", labelBn: "ক্যাটাগরি দেখুন", labelEn: "View categories", defaultRoles: ["ADMIN", "MANAGER"] },
  { key: "categories.manage", module: "categories", moduleBn: "ক্যাটাগরি", moduleEn: "Categories", action: "update", labelBn: "ক্যাটা�রি পরিচালনা", labelEn: "Manage categories", defaultRoles: ["ADMIN", "MANAGER"] },

  // ─── Inventory ───
  { key: "inventory.view", module: "inventory", moduleBn: "ইনভেন্টরি", moduleEn: "Inventory", action: "view", labelBn: "ইনভেন্�রি দেখুন", labelEn: "View inventory", defaultRoles: ["ADMIN", "MANAGER"] },
  { key: "inventory.adjust", module: "inventory", moduleBn: "ইনভেন্টরি", moduleEn: "Inventory", action: "update", labelBn: "স্টক অ্যাডজাস্ট", labelEn: "Adjust stock", defaultRoles: ["ADMIN", "MANAGER"] },

  // ─── Customers ───
  { key: "customers.view", module: "customers", moduleBn: "কাস্টমার", moduleEn: "Customers", action: "view", labelBn: "কাস্টমার দেখুন", labelEn: "View customers", defaultRoles: ["ADMIN", "MANAGER"] },
  { key: "customers.block", module: "customers", moduleBn: "কাস্টমার", moduleEn: "Customers", action: "update", labelBn: "কাস্টমার ব্লক", labelEn: "Block customers", defaultRoles: ["ADMIN"] },

  // ─── Riders ───
  { key: "riders.view", module: "riders", moduleBn: "রাইডার", moduleEn: "Riders", action: "view", labelBn: "রাইডার দেখুন", labelEn: "View riders", defaultRoles: ["ADMIN", "MANAGER"] },
  { key: "riders.create", module: "riders", moduleBn: "রাইডার", moduleEn: "Riders", action: "create", labelBn: "রাইডার যোগ", labelEn: "Add riders", defaultRoles: ["ADMIN"] },
  { key: "riders.settle_cash", module: "riders", moduleBn: "রাইডার", moduleEn: "Riders", action: "update", labelBn: "ক্যাশ সেটেলমেন্ট", labelEn: "Cash settlement", defaultRoles: ["ADMIN"] },

  // ─── Coupons ───
  { key: "coupons.view", module: "coupons", moduleBn: "কুপন", moduleEn: "Coupons", action: "view", labelBn: "কুপন দেখুন", labelEn: "View coupons", defaultRoles: ["ADMIN", "MANAGER"] },
  { key: "coupons.create", module: "coupons", moduleBn: "কুপন", moduleEn: "Coupons", action: "create", labelBn: "কুপন তৈরি", labelEn: "Create coupons", defaultRoles: ["ADMIN", "MANAGER"] },
  { key: "coupons.update", module: "coupons", moduleBn: "কুপন", moduleEn: "Coupons", action: "update", labelBn: "কুপন সম্পাদনা", labelEn: "Edit coupons", defaultRoles: ["ADMIN"] },
  { key: "coupons.delete", module: "coupons", moduleBn: "কুপন", moduleEn: "Coupons", action: "delete", labelBn: "কুপন মুছুন", labelEn: "Delete coupons", defaultRoles: ["ADMIN"] },

  // ─── Delivery zones ───
  { key: "zones.view", module: "delivery-zones", moduleBn: "জোন", moduleEn: "Delivery Zones", action: "view", labelBn: "জোন দেখুন", labelEn: "View zones", defaultRoles: ["ADMIN", "MANAGER"] },
  { key: "zones.manage", module: "delivery-zones", moduleBn: "জোন", moduleEn: "Delivery Zones", action: "update", labelBn: "জোন পরিচালনা", labelEn: "Manage zones", defaultRoles: ["ADMIN"] },

  // ─── Reports ───
  { key: "reports.view", module: "reports", moduleBn: "রিপোর্ট", moduleEn: "Reports", action: "view", labelBn: "রিপোর্ট দেখুন", labelEn: "View reports", defaultRoles: ["ADMIN", "MANAGER"] },
  { key: "reports.export", module: "reports", moduleBn: "রিপোর্ট", moduleEn: "Reports", action: "export", labelBn: "রিপোর্ট এক্সপোর্ট", labelEn: "Export reports", defaultRoles: ["ADMIN", "MANAGER"] },

  // ─── Public site ───
  { key: "public_site.view", module: "public-site", moduleBn: "পাবলিক সাইট", moduleEn: "Public Site", action: "view", labelBn: "পাবলিক সাইট দেখুন", labelEn: "View public site", defaultRoles: ["ADMIN", "MANAGER"] },
  { key: "public_site.update", module: "public-site", moduleBn: "পাবলিক সাইট", moduleEn: "Public Site", action: "update", labelBn: "পাবলিক সাইট সম্পাদনা", labelEn: "Edit public site", defaultRoles: ["ADMIN", "MANAGER"] },
  { key: "public_site.pages", module: "public-site", moduleBn: "পাবলিক সাইট", moduleEn: "Public Site", action: "update", labelBn: "পেজ ম্যানেজার (Privacy/Terms)", labelEn: "Manage pages (Privacy/Terms)", defaultRoles: ["ADMIN"] },

  // ─── Technical (ADMIN-only) ───
  { key: "seo.manage", module: "seo", moduleBn: "SEO", moduleEn: "SEO", action: "update", labelBn: "SEO সেটিংস", labelEn: "SEO settings", defaultRoles: ["ADMIN"], adminOnly: true },
  { key: "system.settings", module: "system", moduleBn: "সিস্টেম", moduleEn: "System", action: "update", labelBn: "সিস্টেম সেটিংস", labelEn: "System settings", defaultRoles: ["ADMIN"], adminOnly: true },
  { key: "system.feature_toggles", module: "system", moduleBn: "সি�্টেম", moduleEn: "System", action: "update", labelBn: "ফিচার টগল", labelEn: "Feature toggles", defaultRoles: ["ADMIN"], adminOnly: true },
  { key: "system.auth_settings", module: "system", moduleBn: "সিস্টেম", moduleEn: "System", action: "update", labelBn: "অথ সেটিংস", labelEn: "Auth settings", defaultRoles: ["ADMIN"], adminOnly: true },
  { key: "system.maintenance", module: "system", moduleBn: "সিস্টেম", moduleEn: "System", action: "update", labelBn: "মে�নটেন্যান্স মোড", labelEn: "Maintenance mode", defaultRoles: ["ADMIN"], adminOnly: true },
  { key: "system.api_health", module: "system", moduleBn: "সিস্টেম", moduleEn: "System", action: "view", labelBn: "API স্বাস্থ্য", labelEn: "API health", defaultRoles: ["ADMIN"], adminOnly: true },
  { key: "staff.manage", module: "system", moduleBn: "সিস্টেম", moduleEn: "System", action: "update", labelBn: "স্টাফ/�্যাডমিন ম্যানেজমেন্ট", labelEn: "Staff & admin management", defaultRoles: ["ADMIN"], adminOnly: true },
  { key: "audit.view", module: "audit", moduleBn: "অডিট", moduleEn: "Audit", action: "view", labelBn: "অডিট লগ দেখুন", labelEn: "View audit logs", defaultRoles: ["ADMIN"], adminOnly: true },
  { key: "templates.manage", module: "templates", moduleBn: "টেমপ্লেট", moduleEn: "Templates", action: "update", labelBn: "টেমপ্লেট সম্পাদনা", labelEn: "Edit templates", defaultRoles: ["ADMIN"], adminOnly: true },
];
