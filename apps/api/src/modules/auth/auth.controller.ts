import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { Request } from "express";
import { Throttle } from "@nestjs/throttler";
import { AuthService } from "./auth.service";
import { JwtAudience } from "../../shared/jwt/token.service";
import { Audience, AuthGuard, Roles, RolesGuard } from "../../shared/jwt/guards";
import { RegisterDto, RequestOtpDto, VerifyOtpDto, AdminLoginDto, RiderLoginDto, RefreshTokenDto, CustomerLoginDto, ForgotPasswordDto, ResetPasswordDto, RegisterStartDto, RegisterVerifyDto, LoginStartDto, LoginVerifyDto, ForgotByIdentifierDto, ResetByIdentifierDto } from "./dto";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // ────────────────────────────────────────── Customer phone OTP ──

  /**
   * Returns the admin-configurable login/registration options. The web
   * client calls this on /login + /register mount to know:
   *   - whether to show the OTP step,
   *   - what channel to tell the user ("check your email" vs "check
   *     your phone"),
   *   - the OTP TTL so the countdown timer matches the server,
   *   - the OTP length so the input mask / validation matches.
   */
  @Get("customer/login-options")
  @ApiOperation({
    summary: "Read admin-configured login/registration options",
  })
  @HttpCode(200)
  loginOptions() {
    return this.auth.getLoginOptions();
  }

  /**
   * New flexible 2-step registration — Step 1.
   * Collects name + email + mobile + password + optional ref code and
   * creates the User row. If the admin has OTP enabled, an OTP is sent
   * and the response indicates which channel it went to.
   */
  @Post("customer/register/start")
  @ApiOperation({
    summary:
      "Step 1 of new flexible registration. Returns nextStep: 'verify' or 'complete'.",
  })
  @HttpCode(200)
  @Throttle({ medium: { limit: 5, ttl: 60_000 } })
  registerStart(@Body() dto: RegisterStartDto, @Req() req: Request) {
    return this.auth.startRegistration(dto, req);
  }

  /**
   * New flexible 2-step registration — Step 2.
   * Verifies the OTP and issues tokens.
   */
  @Post("customer/register/verify")
  @ApiOperation({
    summary: "Step 2 of registration. Verify the OTP and get tokens.",
  })
  @HttpCode(200)
  @Throttle({ medium: { limit: 10, ttl: 60_000 } })
  registerVerify(@Body() dto: RegisterVerifyDto, @Req() req: Request) {
    return this.auth.verifyRegistration(dto, req);
  }

  /**
   * New flexible login — start. Accepts identifier (email or phone)
   * with optional password. If OTP is enabled and/or the login was
   * passwordless, returns nextStep: 'verify' so the client moves to the
   * OTP step.
   */
  @Post("customer/login/start")
  @ApiOperation({
    summary:
      "New flexible login: identifier (+ optional password) → nextStep.",
  })
  @HttpCode(200)
  @Throttle({ medium: { limit: 10, ttl: 60_000 } })
  customerLoginStart(@Body() dto: LoginStartDto, @Req() req: Request) {
    return this.auth.startLogin(dto, req);
  }

  @Post("customer/login/verify")
  @ApiOperation({
    summary: "Step 2 of login. Verify OTP and get tokens.",
  })
  @HttpCode(200)
  @Throttle({ medium: { limit: 10, ttl: 60_000 } })
  customerLoginVerify(@Body() dto: LoginVerifyDto, @Req() req: Request) {
    return this.auth.verifyLogin(dto, req);
  }

  /** Identifier-aware forgot password — accepts email or phone. */
  @Post("customer/forgot-password-identifier")
  @ApiOperation({
    summary: "Forgot password — accepts email or phone as identifier.",
  })
  @HttpCode(200)
  @Throttle({ short: { limit: 1, ttl: 1000 }, medium: { limit: 3, ttl: 60_000 } })
  customerForgotByIdentifier(
    @Body() dto: ForgotByIdentifierDto,
    @Req() req: Request,
  ) {
    return this.auth.forgotPasswordByIdentifier(dto.identifier, req);
  }

  @Post("customer/reset-password-identifier")
  @ApiOperation({
    summary:
      "Reset password using identifier + OTP. Issues fresh tokens.",
  })
  @HttpCode(200)
  @Throttle({ medium: { limit: 5, ttl: 60_000 } })
  customerResetByIdentifier(
    @Body() dto: ResetByIdentifierDto,
    @Req() req: Request,
  ) {
    return this.auth.resetPasswordByIdentifier(
      dto.identifier,
      dto.otpCode,
      dto.newPassword,
      req,
    );
  }

  @Post("customer/request-otp")
  @ApiOperation({ summary: "Request OTP for customer phone (legacy)" })
  @HttpCode(200)
  @Throttle({ short: { limit: 1, ttl: 1000 }, medium: { limit: 3, ttl: 60_000 } })
  requestOtp(@Body() dto: RequestOtpDto, @Req() req: Request) {
    return this.auth.requestOtp(dto.phone, req);
  }

  @Post("customer/register")
  @ApiOperation({
    summary:
      "Register a new customer after OTP verification. Optionally accepts a referral code (REQUIRED for referral rewards).",
  })
  @HttpCode(200)
  @Throttle({ medium: { limit: 5, ttl: 60_000 } })
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.auth.registerCustomer(dto, req);
  }

  @Post("customer/verify-otp")
  @ApiOperation({
    summary:
      "Verify OTP and get access + refresh tokens. If user does not exist, issues a temp token (frontend should call /register to complete profile).",
  })
  @HttpCode(200)
  verifyOtp(@Body() dto: VerifyOtpDto, @Req() req: Request) {
    return this.auth.verifyOtp(dto, req);
  }

  @Post("customer/login")
  @ApiOperation({
    summary:
      "Phone + password login for returning customers. Throws machine-readable codes (USER_NOT_FOUND / PASSWORD_NOT_SET / INVALID_CREDENTIALS) so the frontend can route appropriately.",
  })
  @HttpCode(200)
  @Throttle({ medium: { limit: 10, ttl: 60_000 } })
  customerLogin(@Body() dto: CustomerLoginDto, @Req() req: Request) {
    return this.auth.customerLogin(dto, req);
  }

  @Post("customer/forgot-password")
  @ApiOperation({
    summary:
      "Request a password-reset OTP. Always returns 200 (and a devCode in non-prod) to prevent phone enumeration.",
  })
  @HttpCode(200)
  @Throttle({ short: { limit: 1, ttl: 1000 }, medium: { limit: 3, ttl: 60_000 } })
  customerForgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    return this.auth.forgotPassword(dto, req);
  }

  @Post("customer/reset-password")
  @ApiOperation({
    summary:
      "Verify the reset OTP and set a new password. Issues fresh tokens so the user is logged in immediately.",
  })
  @HttpCode(200)
  @Throttle({ medium: { limit: 5, ttl: 60_000 } })
  customerResetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request) {
    return this.auth.resetPassword(dto, req);
  }

  @Post("customer/refresh")
  @ApiOperation({ summary: "Rotate refresh token (customer)" })
  @HttpCode(200)
  refreshCustomer(@Body() dto: RefreshTokenDto, @Req() req: Request) {
    return this.auth.refresh(dto.refreshToken, JwtAudience.CUSTOMER, req);
  }

  @Post("customer/logout")
  @ApiOperation({ summary: "Revoke refresh token (customer)" })
  @HttpCode(204)
  logout(@Body() dto: RefreshTokenDto) {
    return this.auth.logout(dto.refreshToken);
  }

  // ────────────────────────────────────────── Admin login ──

  @Post("admin/login")
  @ApiOperation({ summary: "Admin/staff email + password login" })
  @HttpCode(200)
  @Throttle({ medium: { limit: 10, ttl: 60_000 } })
  adminLogin(@Body() dto: AdminLoginDto, @Req() req: Request) {
    return this.auth.adminLogin(dto, req);
  }

  @Post("admin/refresh")
  @ApiOperation({ summary: "Rotate refresh token (admin)" })
  @HttpCode(200)
  refreshAdmin(@Body() dto: RefreshTokenDto, @Req() req: Request) {
    return this.auth.refresh(dto.refreshToken, JwtAudience.ADMIN, req);
  }

  // ────────────────────────────────────────── Rider login ──

  @Post("rider/login")
  @ApiOperation({ summary: "Rider email + password login" })
  @HttpCode(200)
  @Throttle({ medium: { limit: 10, ttl: 60_000 } })
  riderLogin(@Body() dto: RiderLoginDto, @Req() req: Request) {
    return this.auth.riderLogin(dto, req);
  }

  @Post("rider/refresh")
  @ApiOperation({ summary: "Rotate refresh token (rider)" })
  @HttpCode(200)
  refreshRider(@Body() dto: RefreshTokenDto, @Req() req: Request) {
    return this.auth.refresh(dto.refreshToken, JwtAudience.RIDER, req);
  }

  // ────────────────────────────────────────── Profile ──

  @Get("me")
  @UseGuards(AuthGuard, RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get current user profile (any role)" })
  me(@Req() req: Request) {
    return this.auth.me(req);
  }
}
