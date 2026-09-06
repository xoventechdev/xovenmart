"use client";

/**
 * Admin route error boundary.
 *
 * Production hardening: Next.js renders the opaque message
 * "Application error: a client-side exception has occurred
 * (see the browser console for more information)" when any client
 * component under /admin/* throws during render.
 *
 * This boundary traps that error INSIDE the admin tree so the user
 * sees the actual error + a Reset button instead of a useless
 * one-liner. The full stack is logged to console.error for debugging.
 *
 * Auth state is intentionally NOT cleared here — a render exception
 * is unrelated to session validity, and nuking the token forces the
 * user to log in again when the bug is unrelated to their session.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Keep the same console-log behaviour Next.js does internally so
  // devs see the full stack in the browser DevTools too.
  console.error("Admin route caught client-side exception:", error);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-4 py-12 text-center">
      <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-300">
        <span className="text-2xl">⚠️</span>
      </div>
      <h1 className="text-xl font-bold text-ink-900 dark:text-ink-50">
        কিছু ভুল হয়েছে
      </h1>
      <p className="mt-2 text-sm font-semibold text-ink-500 dark:text-ink-300">
        Something went wrong
      </p>
      <p className="mt-3 max-w-md text-sm text-ink-500 dark:text-ink-300">
        অ্যাডমিন প্যানেল লোড করতে একটি সমস্যা হয়েছে। নিচের ত্রুটির বার্তাটি
        আমাদের ডেভেলপারদের সাহায্য করবে।
        <br />
        The admin panel hit an unexpected error while loading. The message
        below helps developers diagnose it.
      </p>

      <pre className="mt-5 max-h-48 w-full overflow-auto whitespace-pre-wrap break-words rounded-md border border-ink-200 bg-ink-50 p-3 text-left text-xs text-ink-700 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-200">
        {error.message || "(no message)"}
        {error.digest ? `\n\ndigest: ${error.digest}` : ""}
      </pre>

      <div className="mt-6 flex gap-2">
        <button
          onClick={reset}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-600"
        >
          আবার চেষ্টা করুন / Try again
        </button>
        <a
          href="/admin"
          className="rounded-md border border-ink-200 px-4 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50 dark:border-ink-700 dark:text-ink-200 dark:hover:bg-ink-800"
        >
          ড্যাশবোর্ডে যান / Dashboard
        </a>
      </div>
    </div>
  );
}
