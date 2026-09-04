"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Lightweight modal dialog — hand-rolled so we don't pull in
 * @radix-ui/react-dialog just for a handful of modals. Uses a fixed
 * overlay + click-outside / ESC handlers, identical feel to a shadcn
 * Dialog.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  // ESC to close
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      {/*
        Panel is a flex column capped at viewport-height minus the overlay
        padding (p-4 = 1rem each side). The body is the only scroll region
        (flex-1 + min-h-0 lets it shrink inside the constrained parent).
        Without this, tall content — e.g. AddressFormModal with the map
        section open — would silently extend past the viewport with the
        Save / Cancel buttons clipped and no scrollbar.
      */}
      <div
        className={cn(
          "relative flex w-full max-w-md max-h-[calc(100vh-2rem)] flex-col rounded-xl border border-ink-200 bg-white shadow-xl dark:border-ink-300 dark:bg-ink-100",
          className,
        )}
      >
        {title && (
          <div className="flex shrink-0 items-center justify-between border-b border-ink-200 px-4 py-3 dark:border-ink-300">
            <h2 className="text-base font-semibold text-ink-900 dark:text-ink-900">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-md p-1 text-ink-500 hover:bg-ink-100 hover:text-ink-900 dark:hover:bg-ink-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
