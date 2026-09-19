"use client";

import * as React from "react";
import { Input, type InputProps } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface NumericInputProps
  extends Omit<InputProps, "value" | "onChange" | "type"> {
  /**
   * The numeric value held by the parent form. We never render this
   * directly — the user can clear the field and we must NOT immediately
   * snap the displayed value back to "0". The number is only pushed to
   * the parent so the save payload stays a clean `number`.
   */
  value: number | null;
  /**
   * Parent setter. Called on every keystroke with the parsed number —
   * `0` when the field is empty so the payload stays a clean `number`
   * (server contract is unchanged; backend already treats 0 as
   * "unset" for prices).
   *
   * Set `allowNull` if you want to forward `null` for the empty state
   * (e.g. `weightGrams` — the backend accepts `null` for "no weight").
   */
  onChange: (n: number | null) => void;
  /**
   * When true, the empty field forwards `null` instead of `0`.
   * Use for fields where "blank" is semantically different from "zero"
   * (e.g. variant weightGrams → no weight set yet).
   */
  allowNull?: boolean;
  /**
   * Number of decimal places allowed. Default `0` (integer input — the
   * shop sells whole taka). Set to `2` for money fields that need
   * paise-style precision.
   */
  decimals?: number;
}

/**
 * A `<input type="number">` wrapper that lets the admin clear the
 * field without it snapping back to "0".
 *
 * Why this exists: the bare `<Input type="number" value={n}
 * onChange={Number(e.target.value)}>` pattern React's strict render
 * cycle requires — when the field is cleared, `e.target.value` is `""`,
 * `Number("")` is `0`, and the next render shows "0" in the field even
 * though the admin just deleted it. This is annoying for "type then
 * delete then retype" workflows (price entry, stock updates).
 *
 * We hold a local string `draft` that mirrors what the admin actually
 * sees. The parent still owns the canonical `number` — we only forward
 * the parsed value, never the draft itself.
 */
export const NumericInput = React.forwardRef<HTMLInputElement, NumericInputProps>(
  function NumericInput(
    { value, onChange, allowNull, decimals = 0, className, ...rest },
    ref,
  ) {
    // The string the input actually displays. Synced from `value`
    // whenever the parent's number changes for reasons OTHER than our
    // own keystroke (e.g. form reset, edit-mode hydration) — we detect
    // that by comparing the parsed draft to the new value.
    const [draft, setDraft] = React.useState<string>(() => formatNumber(value, decimals));

    // Track the last value we forwarded up via our own onChange.
    // We intentionally do NOT overwrite this on every render — that
    // would defeat the sync effect below (see the previous bug where
    // every edit-mode hydration was ignored because the ref was
    // overwritten with the new value BEFORE the effect ran).
    const lastForwardedRef = React.useRef<number | null | undefined>(value);

    React.useEffect(() => {
      // Only sync from outside when the parent value diverged from
      // what we last sent up. This is the edit-hydration path and the
      // "AI fill" path. Anything else (regular typing) we keep the
      // local draft untouched so clearing the field doesn't snap back.
      if (value === lastForwardedRef.current) return;
      setDraft(formatNumber(value, decimals));
      lastForwardedRef.current = value;
    }, [value, decimals]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      setDraft(raw);
      if (raw === "" || raw === "-") {
        onChange(allowNull ? null : 0);
        lastForwardedRef.current = allowNull ? null : 0;
        return;
      }
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) {
        onChange(parsed);
        lastForwardedRef.current = parsed;
      }
    };

    return (
      <Input
        ref={ref}
        type="number"
        inputMode="decimal"
        // Render the local draft, NOT the parent number. This is the
        // whole point of the wrapper — an empty field stays empty.
        value={draft}
        onChange={handleChange}
        className={cn(className)}
        {...rest}
      />
    );
  },
);

/**
 * Format a number for the input's initial string. `0` is rendered as
 * "" so the field opens empty rather than pre-filled with "0" —
 * matches the "admin types it themselves" UX.
 */
function formatNumber(n: number | null | undefined, decimals: number): string {
  if (n === null || n === undefined) return "";
  if (!Number.isFinite(n)) return "";
  if (n === 0) return "";
  // Drop trailing zeros so "1.50" doesn't render as "1.50" forever —
  // toFixed would, but we only need decimals > 0 for future use.
  return decimals > 0 ? n.toFixed(decimals).replace(/\.?0+$/, "") : String(n);
}
