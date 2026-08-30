import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import {
  AdminOnly,
  Audience,
  AuthGuard,
  ManagerGuard,
  Roles,
  RolesGuard,
} from "../../shared/jwt/guards";
import { CreatePosOrderDto } from "./dto";
import { PosService } from "./pos.service";

/**
 * POS (Quick Order) admin endpoints.
 *
 *   GET  /admin/pos/customers/lookup?phone=...
 *   GET  /admin/pos/products/search?q=...&limit=...
 *   POST /admin/pos/orders
 *
 * Both ADMIN and MANAGER can use POS (cashier workflow). Writing an
 * order is sensitive (stock decrement + audit log) so the create
 * endpoint is also @AdminOnly() — actually no: cashiers are usually
 * MANAGERs, so we let both roles create orders. Reading/lookup is
 * unrestricted.
 */
@ApiTags("admin/pos")
@Controller("admin/pos")
@UseGuards(AuthGuard, RolesGuard, ManagerGuard)
@Roles("ADMIN", "MANAGER")
@Audience("admin" as any)
@ApiBearerAuth("Admin")
export class PosController {
  constructor(private readonly pos: PosService) {}

  @Get("customers/lookup")
  @ApiOperation({ summary: "Look up a customer by phone (returns null if not found)" })
  async lookupCustomer(@Query("phone") phone: string) {
    return this.pos.lookupCustomerByPhone(phone);
  }

  @Get("products/search")
  @ApiOperation({ summary: "Lightweight product search for the Quick Order screen" })
  async searchProducts(
    @Query() q: { q?: string; limit?: number },
  ) {
    const items = await this.pos.searchProducts(q.q ?? "", q.limit ?? 12);
    return items.map((p: any) => ({
      id: p.id,
      slug: p.slug,
      nameBn: p.nameBn,
      nameEn: p.nameEn,
      sku: p.sku,
      salePrice: Number(p.salePrice),
      mrp: p.mrp != null ? Number(p.mrp) : null,
      unit: p.unit,
      stockQty: p.inventory?.stockQty ?? 0,
      image: p.images?.[0]?.url ?? null,
    }));
  }

  @Post("orders")
  @ApiOperation({ summary: "Place a POS order on behalf of a customer" })
  async place(@Body() dto: CreatePosOrderDto, @Req() req: Request) {
    const actorId = (req as any).userId as string;
    const role = ((req as any).role as "ADMIN" | "MANAGER") ?? "ADMIN";
    return this.pos.place(dto, actorId, role);
  }
}
