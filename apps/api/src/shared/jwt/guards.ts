// Auth guards — moved here for simplicity
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request } from "express";
import { JwtAudience, JwtPayload, TokenService } from "./token.service";

export type AdminRole = "ADMIN" | "MANAGER";
export type AnyRole = "CUSTOMER" | "ADMIN" | "MANAGER" | "RIDER";

export const ROLES_KEY = "roles";
export const Roles = (...roles: AnyRole[]) => SetMetadata(ROLES_KEY, roles);

export const AUDIENCE_KEY = "audience";
export const Audience = (aud: JwtAudience) => SetMetadata(AUDIENCE_KEY, aud);

/**
 * Mark a route as ADMIN-ONLY (technical, off-limits to MANAGER).
 * The ManagerGuard will block MANAGER role from these routes.
 */
export const ADMIN_ONLY_KEY = "admin_only";
export const AdminOnly = () => SetMetadata(ADMIN_ONLY_KEY, true);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly token: TokenService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const audience =
      this.reflector.getAllAndOverride<JwtAudience | undefined>(AUDIENCE_KEY, [
        ctx.getHandler(),
        ctx.getClass(),
      ]) ?? null;

    const header = req.header("authorization") ?? req.header("Authorization");
    if (!header || !header.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing or malformed Authorization header");
    }
    const token = header.slice("Bearer ".length).trim();

    try {
      const payload = this.token.verifyAccessToken(token) as JwtPayload;
      if (audience && payload.audience !== audience) {
        throw new UnauthorizedException(`Token audience mismatch (expected ${audience})`);
      }
      (req as any).user = payload;
      (req as any).userId = payload.sub;
      (req as any).role = payload.role;
      (req as any).audience = payload.audience;
      return true;
    } catch (e) {
      throw new UnauthorizedException(
        e instanceof Error ? e.message : "Invalid token",
      );
    }
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required =
      this.reflector.getAllAndOverride<AnyRole[] | undefined>(ROLES_KEY, [
        ctx.getHandler(),
        ctx.getClass(),
      ]);
    if (!required || required.length === 0) return true;
    const req = ctx.switchToHttp().getRequest();
    const role = (req as any).role;
    if (!role || !required.includes(role)) {
      throw new UnauthorizedException(`Required role: ${required.join(" or ")}, got: ${role}`);
    }
    return true;
  }
}

/**
 * Blocks MANAGER role on routes marked with @AdminOnly().
 * Use this in combination with @Roles("ADMIN", "MANAGER") so MANAGER
 * can READ but @AdminOnly on writes prevents technical mutations.
 *
 * Example:
 *   @Roles("ADMIN", "MANAGER")  // both can reach this route
 *   @AdminOnly()                 // but only ADMIN can pass
 *
 *   @Roles("ADMIN", "MANAGER")
 *   // (no @AdminOnly)            // both can use it
 */
@Injectable()
export class ManagerGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const adminOnly = this.reflector.getAllAndOverride<boolean | undefined>(
      ADMIN_ONLY_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!adminOnly) return true;
    const req = ctx.switchToHttp().getRequest();
    const role = (req as any).role;
    if (role === "MANAGER") {
      throw new ForbiddenException(
        "This action requires ADMIN role. Managers do not have access to technical settings.",
      );
    }
    return true;
  }
}