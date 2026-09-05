-- Flexible 2-step customer login/registration flow.
-- Adds OTP identifier abstraction so a single OtpCode row can carry either
-- a phone or an email code, plus User lifecycle tracking for the
-- PENDING_VERIFY -> ACTIVE flip.

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING_VERIFY', 'ACTIVE', 'DISABLED');
CREATE TYPE "OtpChannel" AS ENUM ('SMS', 'EMAIL');
CREATE TYPE "OtpIdentifierType" AS ENUM ('PHONE', 'EMAIL');

-- AlterTable: users
ALTER TABLE "users"
  ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "email_verified_at" TIMESTAMP(3),
  ADD COLUMN "phone_verified_at" TIMESTAMP(3),
  ADD COLUMN "needs_email_completion" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "users_status_idx" ON "users"("status");
CREATE INDEX "users_needs_email_completion_idx" ON "users"("needs_email_completion");

-- AlterTable: otp_codes
-- Drop the phone-not-null constraint first by allowing a default of '',
-- then add the new identifier-abstraction columns.
ALTER TABLE "otp_codes" ALTER COLUMN "phone" SET DEFAULT '';
-- Backfill any legacy NULL phone rows so the new NOT NULL '' default doesn't trip
UPDATE "otp_codes" SET "phone" = '' WHERE "phone" IS NULL;
ALTER TABLE "otp_codes" ALTER COLUMN "phone" SET NOT NULL;

-- Add the new columns
ALTER TABLE "otp_codes"
  ADD COLUMN "target" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "channel" "OtpChannel" NOT NULL DEFAULT 'SMS',
  ADD COLUMN "identifier_type" "OtpIdentifierType" NOT NULL DEFAULT 'PHONE';

-- Backfill target from phone for legacy rows so target isn't empty.
UPDATE "otp_codes" SET "target" = "phone" WHERE "target" = '';

CREATE INDEX "otp_codes_target_expires_at_idx" ON "otp_codes"("target", "expires_at");
CREATE INDEX "otp_codes_target_purpose_expires_at_idx" ON "otp_codes"("target", "purpose", "expires_at");
