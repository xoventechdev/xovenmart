import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request } from "express";
import { JwtAudience, JwtPayload, TokenService } from "../token.service";

export const ROLES_KEY = "roles";
export const Roles = (...roles: Array<"CUSTOMER" | "ADMIN" | "RIDER">) =>
  SetMetadata(ROLES_KEY, roles);

export const AUDIENCE_KEY = "audience";
export const Audience = (aud: JwtAudience) => SetMetadata(AUDIENCE_KEY, aud);

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
      // Attach to request for controllers
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
      this.reflector.getAllAndOverride<Array<"CUSTOMER" | "ADMIN" | "RIDER"> | undefined>(
        ROLES_KEY,
        [ctx.getHandler(), ctx.getClass()],
      );
    if (!required || required.length === 0) return true;
    const req = ctx.switchToHttp().getRequest();
    const role = (req as any).role;
    if (!role || !required.includes(role)) {
      throw new UnauthorizedException(`Required role: ${required.join(" or ")}, got: ${role}`);
    }
    return true;
  }
}
