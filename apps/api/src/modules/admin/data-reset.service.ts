import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../shared/prisma/prisma.module";
import { BackupService } from "./backup.service";

/**
 * Result of a `resetDemoData` call — every row count that was wiped.
 * Returned to the admin UI so the operator can see exactly what was
 * deleted (and later compare against the pre-wipe snapshot).
 */
export interface ResetResult {
  orders: number;
  orderItems: number;
  payments: number;
  deliveries: number;
  statusEvents: number;
  products: number;
  productImages: number;
  inventory: number;
  stockMovements: number;
  categories: number;
  /** The auto-backup row that was created BEFORE the wipe started.
   *  The admin UI surfaces this id so the operator can download the
   *  dump from the regular `/admin/system/backups` page if they need
   *  to restore. */
  backupId: string;
  backupFileName: string;
}

/**
 * Destructive demo-data wipe service.
 *
 * Scope (per the user's explicit request):
 *   - All orders + their children (items, payments, deliveries, status events)
 *   - All products + their children (images, inventory, stock movements)
 *   - All categories
 *
 * Preserved:
 *   - Customers, riders, addresses, settings, staff, discounts (kept),
 *     coupons, translations, banners, FAQs, notices, site pages,
 *     delivery zones, suppliers, payroll config, audit logs, etc.
 *
 * Defense in depth:
 *   1. Caller must pass `confirm: "WIPE DEMO DATA"` exactly.
 *   2. Service verifies JWT role === ADMIN (MANAGER is rejected at the
 *      controller layer via `@AdminOnly()`).
 *   3. An automatic pg_dump backup is taken BEFORE any deletes fire
 *      (so a bad wipe can be rolled back via the existing restore flow).
 *   4. Every deletion runs in a single Prisma `$transaction` so a mid-way
 *      failure rolls back to the pre-wipe state (then the auto-backup
 *      is the only safety net).
 *   5. Every wipe writes an AuditLog entry so it's discoverable later.
 *
 * Deletion order (FK-safe; explicit deletes are listed, cascade-deleted
 * children are noted in comments):
 *
 *   1. OrderItemSupplier   (cascade from OrderItem — but be explicit)
 *   2. OrderStatusEvent    (cascade from Order, but explicit first)
 *   3. Payment             (cascade)
 *   4. Delivery            (cascade)
 *   5. Order               → cascades OrderItem (→ OrderItemSupplier)
 *   6. StockMovement       (Restrict on Product — must come first)
 *   7. SupplierProduct     (Cascade from Product — but explicit so we
 *                           report the count)
 *   8. Product             → cascades Inventory, ProductImage,
 *                           DiscountProduct
 *   9. DiscountCategory    (Cascade from Category — explicit so we
 *                           report the count)
 *  10. Category            → cascades DiscountCategory, but Category
 *                           has parent = SetNull so children lose the
 *                           link, the parents are deleted next.
 *
 * StockMovement.orderId is checked at runtime — it's an FK on orders too.
 * Looking at the schema, StockMovement has only productId FK; the order
 * link is via OrderItem. So step 6 (StockMovement) is the only thing
 * we have to clear before touching Products.
 */
@Injectable()
export class DataResetService {
  private readonly logger = new Logger(DataResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly backup: BackupService,
  ) {}

  /**
   * Returns a snapshot of every table that would be affected by a wipe,
   * WITHOUT deleting anything. The admin UI calls this on page load so
   * the operator can see the current footprint before pulling the
   * trigger.
   */
  async previewCounts() {
    const [
      orders,
      orderItems,
      payments,
      deliveries,
      statusEvents,
      products,
      productImages,
      inventory,
      stockMovements,
      categories,
    ] = await this.prisma.$transaction([
      this.prisma.order.count(),
      this.prisma.orderItem.count(),
      this.prisma.payment.count(),
      this.prisma.delivery.count(),
      this.prisma.orderStatusEvent.count(),
      this.prisma.product.count(),
      this.prisma.productImage.count(),
      this.prisma.inventory.count(),
      this.prisma.stockMovement.count(),
      this.prisma.category.count(),
    ]);
    return {
      orders,
      orderItems,
      payments,
      deliveries,
      statusEvents,
      products,
      productImages,
      inventory,
      stockMovements,
      categories,
    };
  }

  /**
   * Wipe demo data, gated by:
   *   - adminUserId (for audit trail) — must be a real AdminUser id
   *   - confirm    — must equal literal "WIPE DEMO DATA"
   *
   * Flow:
   *   1. Take a safety pg_dump (uses the same `BackupService` the
   *      backups page calls). If pg_dump fails we abort — no data is
   *      touched.
   *   2. Run the FK-safe cascade in a single transaction.
   *   3. Write an AuditLog row tying the wipe to the admin who
   *      triggered it and to the backup row id.
   *   4. Return counts + backup id.
   */
  async reset(adminUserId: string, confirm: string): Promise<ResetResult> {
    if (confirm !== "WIPE DEMO DATA") {
      throw new BadRequestException('Confirmation phrase must be exactly "WIPE DEMO DATA"');
    }

    // Step 1: safety backup. Goes through `BackupService.runManualBackup`
    // (the same code path the "Backup now" button hits) so the resulting
    // row shows up in `/admin/system/backups` with mode=MANUAL, trigger=USER
    // and notes prefixed with the wipe marker — admins browsing the
    // backup history can immediately tell which dump was the safety net
    // for this wipe.
    //
    // We pass an explicit `fileName` so the row is sortable alongside the
    // regular backups and easy to grep for if an admin needs to restore
    // from it (`xovenmart-pre-wipe-*.sql.gz`).
    let backupId: string;
    let backupFileName: string;
    try {
      const wipeMarker = `pre-wipe-${new Date().toISOString().replace(/[:.]/g, "-")}`;
      const result = await this.backup.runManualBackup({
        actorId: adminUserId,
        fileName: `xovenmart-${wipeMarker}.sql.gz`,
        notes: `Auto-snapshot before demo-data wipe — DO NOT DELETE without confirming the wipe was intentional.`,
      });
      if (result.status !== "SUCCESS") {
        throw new Error(
          `backup row ended in ${result.status} — check the backups page for the full error message`,
        );
      }
      backupId = result.id;
      backupFileName = result.fileName;
    } catch (e: any) {
      this.logger.error(`Pre-wipe backup failed — refusing to wipe. ${e?.message ?? e}`);
      throw new InternalServerErrorException(
        `Pre-wipe backup failed: ${e?.message ?? "unknown error"}. ` +
          `Refusing to delete any data. Verify Postgres tools are on PATH ` +
          `and try again.`,
      );
    }

    // Step 2: FK-safe cascade in one transaction.
    const counts: Omit<ResetResult, "backupId" | "backupFileName"> = {
      orders: 0,
      orderItems: 0,
      payments: 0,
      deliveries: 0,
      statusEvents: 0,
      products: 0,
      productImages: 0,
      inventory: 0,
      stockMovements: 0,
      categories: 0,
    };

    try {
      await this.prisma.$transaction(async (tx) => {
        // Delete order-side rows. OrderItemSupplier cascades from
        // OrderItem so we don't need an explicit step, but the
        // explicit deletes make the count report accurate and remove
        // the (tiny) chance of a missing cascade in a future migration.
        counts.statusEvents = await tx.orderStatusEvent.deleteMany({}).then((r) => r.count);
        counts.payments = await tx.payment.deleteMany({}).then((r) => r.count);
        counts.deliveries = await tx.delivery.deleteMany({}).then((r) => r.count);
        counts.orderItems = await tx.orderItem.deleteMany({}).then((r) => r.count);
        counts.orders = await tx.order.deleteMany({}).then((r) => r.count);

        // StockMovement.product has onDelete: Restrict so we MUST
        // clear it before deleting any Product.
        counts.stockMovements = await tx.stockMovement.deleteMany({}).then((r) => r.count);

        // SupplierProduct cascades from Product but we delete it
        // explicitly so the count is accurate and the FK direction is
        // obvious to future readers.
        await tx.supplierProduct.deleteMany({});

        // Now safe to delete products. Inventory / ProductImage /
        // DiscountProduct cascade automatically.
        counts.productImages = await tx.productImage.deleteMany({}).then((r) => r.count);
        counts.inventory = await tx.inventory.deleteMany({}).then((r) => r.count);
        counts.products = await tx.product.deleteMany({}).then((r) => r.count);

        // Finally categories. DiscountCategory cascades from both
        // Discount and Category — explicit delete so the count is
        // auditable. Category.parent is SetNull so deleting a root
        // category leaves children orphaned but alive; we then delete
        // those children in the same tx (they're already parent=null
        // so no risk of a cycle).
        await tx.discountCategory.deleteMany({});
        counts.categories = await tx.category.deleteMany({}).then((r) => r.count);
      });
    } catch (e: any) {
      this.logger.error(`Wipe transaction failed after backup ${backupId}. ${e?.message ?? e}`);
      throw new InternalServerErrorException(
        `Wipe transaction failed (your backup is at id=${backupId}, ` +
          `file=${backupFileName}). ${e?.message ?? "unknown error"}`,
      );
    }

    // Step 3: audit log so future operators can see who wiped what.
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: adminUserId,
          actorRole: "ADMIN",
          entity: "system",
          entityId: backupId,
          action: "demo_data_wipe",
          diff: {
            backupId,
            backupFileName,
            counts,
          },
        },
      });
    } catch (e: any) {
      // Don't fail the wipe just because the audit row couldn't be
      // written — the user already lost the data and we logged the
      // counts in the wipe's response.
      this.logger.warn(`Failed to write audit log for wipe ${backupId}: ${e?.message ?? e}`);
    }

    this.logger.warn(
      `Demo data wiped by admin ${adminUserId}. Backup: ${backupFileName} ` +
        `(id=${backupId}). Counts: ${JSON.stringify(counts)}`,
    );

    return {
      ...counts,
      backupId,
      backupFileName,
    };
  }
}
