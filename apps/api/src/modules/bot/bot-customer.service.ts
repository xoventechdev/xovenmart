import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../shared/prisma/prisma.module";
import { normalizeBDPhone, isCanonicalBDPhone } from "../../shared/phone";

/**
 * READ-ONLY phone → customer lookup for the bot module.
 *
 * Why no upsert: per the plan (Phase 1.4.2), the bot is forbidden from
 * creating customer accounts. The reasons:
 *
 *  1. Every existing customer-identity endpoint goes through OTP, an
 *     admin-toggleable safeguard (defaults ON). Bypassing OTP from a
 *     bot endpoint would create a parallel account-creation path that
 *     the toggle cannot govern.
 *
 *  2. Account creation from the bot would be unauthenticated at the
 *     bot API level (n8n has a service token but no per-customer
 *     identity), so an attacker who compromised n8n could enumerate
 *     /bot/customer/upsert to dump a customer table.
 *
 *  3. The bot doesn't actually NEED to create customers. When the
 *     bot places an order, `CheckoutService.place` already does a
 *     best-effort phone match against `User.phone` — if the customer
 *     exists, the order is linked to them; if not, the order is
 *     placed with `guestPhone` + `guestName` and the customer can
 *     self-register later via the public OTP flow.
 *
 *  So this service is strictly read-only. Returns 404 (not null) so
 *  the bot knows to ask the customer for confirmation rather than
 *  guessing.
 */
@Injectable()
export class BotCustomerService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Look up a customer by their canonical Bangladesh phone.
   *
   * Returns the user's `id`, `name`, `phone`, and a `previousOrders`
   * count so the bot can greet returning customers ("Welcome back,
   * you have X previous orders").
   */
  async lookupByPhone(rawPhone: string): Promise<{
    id: string;
    name: string | null;
    phone: string;
    previousOrders: number;
    isBlocked: boolean;
  }> {
    const canonical = normalizeBDPhone(rawPhone);
    if (!isCanonicalBDPhone(canonical)) {
      // Same error shape as a "not found" so probing for valid phone
      // formats doesn't leak which numbers are real vs. which are
      // malformed.
      throw new NotFoundException("Customer not found");
    }
    const user = await this.prisma.user.findUnique({
      where: { phone: canonical },
      select: {
        id: true,
        name: true,
        phone: true,
        isBlocked: true,
        _count: {
          select: { orders: true },
        },
      },
    });
    if (!user) throw new NotFoundException("Customer not found");
    return {
      id: user.id,
      name: user.name,
      phone: user.phone,
      previousOrders: user._count.orders,
      isBlocked: user.isBlocked,
    };
  }
}
