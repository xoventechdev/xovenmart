import { ApiProperty } from "@nestjs/swagger";
import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

const BDPhoneRegex = /^(?:\+?88)?01[3-9]\d{8}$/;

export class RequestOtpDto {
  @ApiProperty({ example: "01720694513", description: "BD phone (11 digits, starts with 01)" })
  @Matches(BDPhoneRegex, { message: "Invalid Bangladesh phone number" })
  phone!: string;
}

export class VerifyOtpDto {
  @ApiProperty({ example: "01720694513" })
  @Matches(BDPhoneRegex)
  phone!: string;

  @ApiProperty({ example: "123456" })
  @IsString()
  @Length(6, 6)
  code!: string;
}

export class CustomerLoginDto {
  @ApiProperty({ example: "01720694513", description: "BD phone (11 digits, starts with 01)" })
  @Matches(BDPhoneRegex, { message: "Invalid Bangladesh phone number" })
  phone!: string;

  @ApiProperty({ minLength: 6, maxLength: 72, example: "secret123" })
  @IsString()
  @MinLength(6)
  @MaxLength(72)
  password!: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: "01720694513" })
  @Matches(BDPhoneRegex)
  phone!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ example: "01720694513" })
  @Matches(BDPhoneRegex)
  phone!: string;

  @ApiProperty({ example: "123456" })
  @IsString()
  @Length(6, 6)
  otpCode!: string;

  @ApiProperty({ minLength: 6, maxLength: 72, example: "newpass456" })
  @IsString()
  @MinLength(6)
  @MaxLength(72)
  newPassword!: string;
}

export class RegisterDto {
  @ApiProperty({ example: "01720694513" })
  @Matches(BDPhoneRegex)
  phone!: string;

  @ApiProperty({ minLength: 2, example: "কামাল হোসেন" })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ minLength: 6, maxLength: 72, example: "secret123", description: "Password for future login (min 6 chars)" })
  @IsString()
  @MinLength(6)
  @MaxLength(72)
  password!: string;

  @ApiProperty({ required: false, example: "kamal@example.com" })
  @IsOptional()
  @IsEmail()
  email?: string;

  /** 6-digit OTP already verified via /customer/verify-otp temp token, OR provide it here */
  @ApiProperty({ required: false, example: "123456" })
  @IsOptional()
  @IsString()
  @Length(6, 6)
  otpCode?: string;

  /** Referral code (uppercase 8 chars). If present, this user is referred. */
  @ApiProperty({ required: false, example: "XVM4K7P2", description: "Referral code from a registered user" })
  @IsOptional()
  @IsString()
  @Length(8, 8)
  referralCode?: string;
}

export class AdminLoginDto {
  @ApiProperty({ example: "admin@xovenmart.com" })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 6, example: "admin123" })
  @IsString()
  @MinLength(6)
  password!: string;
}

export class RiderLoginDto {
  @ApiProperty({ example: "rider@xovenmart.com" })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 6, example: "rider123" })
  @IsString()
  @MinLength(6)
  password!: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  refreshToken!: string;
}