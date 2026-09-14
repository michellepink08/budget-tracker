import Link from "next/link";

export function DemoBanner() {
  return (
    <div className="flex items-center justify-center gap-2 bg-amber-100 px-4 py-2 text-center text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
      <span>You&apos;re viewing the shared demo — changes reset periodically.</span>
      <Link href="/signup" className="font-medium underline underline-offset-2">
        Sign up to keep your own data
      </Link>
    </div>
  );
}
