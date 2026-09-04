import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { SettingsService } from "./settings.service";

/**
 * Public (no-auth) read of the admin's maintenance state.
 *
 * This is the single source of truth for "is the public site locked?".
 * The dedicated `/admin/system/maintenance` page is the only place an
 * admin can flip it; this endpoint is the only place the public site
 * reads it.
 *
 * Storage keys (already written by AdminSettingsController):
 *   - `maintenance.enabled`     boolean
 *   - `maintenance.message`     string (any language — admin chooses)
 *   - `maintenance.startsAt`    ISO string | null
 *   - `maintenance.endsAt`      ISO string | null
 *
 * We deliberately do NOT also serve `feature.maintenanceMode` — that
 * flag is being removed as part of the consolidation. The previous
 * dual-flag setup let an admin enable maintenance in two places and see
 * two different public effects (a banner vs a lock).
 *
 * Reads go through `SettingsService.getAll()` so the 60 s in-process
 * cache is shared with every other public settings consumer. The
 * dedicated endpoint invalidates that cache on write via
 * `SettingsService.set()`, so admin flips propagate within one read
 * cycle (worst case ~60 s for stale clients).
 */
@ApiTags("system")
@Controller("public/maintenance")
export class MaintenancePublicController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @ApiOperation({
    summary:
      "Public read of the admin's maintenance state. No auth required. Consumed by (public)/layout.tsx to decide whether to render the lock page.",
  })
  async getMaintenance() {
    // AppSettings only carries the typed/curated surface — maintenance
    // state lives as flat dotted keys in AppSetting (see the note in
    // settings.service.ts). Cast to a wider shape to read them.
    const all = (await this.settings.getAll()) as Record<string, any>;
    return {
      enabled: !!all["maintenance.enabled"],
      message: (all["maintenance.message"] as string | undefined) ?? "",
      startsAt: (all["maintenance.startsAt"] as string | undefined) ?? null,
      endsAt: (all["maintenance.endsAt"] as string | undefined) ?? null,
    };
  }
}
