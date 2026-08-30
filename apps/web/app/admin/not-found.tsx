import Link from "next/link";

export default function AdminNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-7xl font-bold text-primary-700 dark:text-primary-500">404</p>
      <h1 className="text-2xl font-semibold text-ink-900 dark:text-ink-900">
        পেজ পাওয়া যায়নি
      </h1>
      <p className="max-w-md text-sm text-ink-500">
        অ্যাডমিন প্যানেলে এই পেজটি বিদ্যমান নেই।
      </p>
      <Link
        href="/admin"
        className="mt-2 inline-flex items-center rounded-md bg-primary-700 px-4 py-2 text-sm font-medium text-white hover:bg-primary-800"
      >
        ড্যাশবোর্ডে ফিরে যান
      </Link>
    </div>
  );
}
