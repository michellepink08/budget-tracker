"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function LedgerRangePicker({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`/ledger?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="ledger-from" className="text-sm">
          From
        </label>
        <input
          id="ledger-from"
          type="date"
          defaultValue={from}
          onChange={(e) => updateParam("from", e.target.value)}
          className="h-9 rounded-lg border border-input bg-input px-3 text-sm shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] hover:border-ring/50 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="ledger-to" className="text-sm">
          To
        </label>
        <input
          id="ledger-to"
          type="date"
          defaultValue={to}
          onChange={(e) => updateParam("to", e.target.value)}
          className="h-9 rounded-lg border border-input bg-input px-3 text-sm shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] hover:border-ring/50 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
        />
      </div>
    </div>
  );
}
