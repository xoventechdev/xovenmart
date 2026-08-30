import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { ReferralsService } from "./referrals.service";
import { Audience, AuthGuard, Roles, RolesGuard } from "../../shared/jwt/guards";

@ApiTags("referrals")
@Controller("referrals")
@UseGuards(AuthGuard, RolesGuard)
@Roles("CUSTOMER")
@Audience("customer" as any)
@ApiBearerAuth("Customer")
export class ReferralsController {
  constructor(private readonly referrals: ReferralsService) {}

  @Get("me")
  @ApiOperation({ summary: "My referral code, stats, and rewards" })
  myReferrals(@Req() req: Request) {
    return this.referrals.myReferrals(req);
  }

  @Get("referrer")
  @ApiOperation({ summary: "The user who referred me (if any)" })
  myReferrer(@Req() req: Request) {
    return this.referrals.myReferrer(req);
  }
}