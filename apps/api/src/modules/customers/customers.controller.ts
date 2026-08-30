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
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { CustomersService } from "./customers.service";
import { CreateAddressDto, UpdateAddressDto, UpdateProfileDto } from "./dto";
import {
  Audience,
  AuthGuard,
  Roles,
  RolesGuard,
} from "../../shared/jwt/guards";

/**
 * Customer self-service endpoints. All routes are gated to authenticated
 * CUSTOMER tokens (audience=“customer”).
 */
@ApiTags("customers")
@ApiBearerAuth("Customer")
@UseGuards(AuthGuard, RolesGuard)
@Roles("CUSTOMER")
@Audience("customer" as any)
@Controller("customers")
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  // ────────────────────────────────────────── Profile ──

  @Get("me")
  @ApiOperation({
    summary:
      "Get the current customer's profile. Mirrors /auth/me but locked to CUSTOMER and returns only safe fields.",
  })
  getProfile(@Req() req: Request) {
    return this.customers.getProfile(req);
  }

  @Patch("me")
  @ApiOperation({
    summary:
      "Update the current customer's name and/or email. Phone is intentionally not editable here.",
  })
  updateProfile(@Req() req: Request, @Body() dto: UpdateProfileDto) {
    return this.customers.updateProfile(req, dto);
  }

  // ────────────────────────────────────────── Addresses ──

  @Get("me/addresses")
  @ApiOperation({ summary: "List the current customer's saved addresses (default first)." })
  listAddresses(@Req() req: Request) {
    return this.customers.listAddresses(req);
  }

  @Post("me/addresses")
  @ApiOperation({ summary: "Add a saved address. First address auto-becomes default." })
  createAddress(@Req() req: Request, @Body() dto: CreateAddressDto) {
    return this.customers.createAddress(req, dto);
  }

  @Patch("me/addresses/:id")
  @ApiOperation({ summary: "Update a saved address. Setting isDefault=true flips the old default." })
  updateAddress(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.customers.updateAddress(req, id, dto);
  }

  @Delete("me/addresses/:id")
  @ApiOperation({
    summary:
      "Delete a saved address. If it was the default, the next-most-recent address becomes the new default (if any remain).",
  })
  deleteAddress(@Req() req: Request, @Param("id") id: string) {
    return this.customers.deleteAddress(req, id);
  }
}
