import { Module } from "@nestjs/common";
import { ReferralsService } from "./referrals.service";
import { ReferralsController } from "./referrals.controller";
import { ReferralCodePublicController } from "./referral-code.public.controller";
import { SharedJwtModule } from "../../shared/jwt/jwt.service";

@Module({
  imports: [SharedJwtModule],
  controllers: [ReferralsController, ReferralCodePublicController],
  providers: [ReferralsService],
  exports: [ReferralsService],
})
export class ReferralsModule {}