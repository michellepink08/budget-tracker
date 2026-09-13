"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { markPayablePaidAction } from "@/actions/payable.actions";
import { confirmRecurringOccurrenceAction, skipRecurringOccurrenceAction } from "@/actions/recurring.actions";
import {
  confirmRecurringPayableOccurrenceAction,
  skipRecurringPayableOccurrenceAction,
} from "@/actions/recurring-payable.actions";
import { deleteReminderAction, markReminderPaidAction, skipReminderAction } from "@/actions/calendar.actions";
import { formatMoney } from "@/lib/money";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { CalendarEntry } from "@/lib/calendar/aggregate";

const SOURCE_PAGE: Partial<Record<CalendarEntry["sourceType"], string>> = {
  INSTALLMENT: "/loans-cards",
  CREDIT_CARD_STATEMENT: "/loans-cards",
  CREDIT_CARD_DUE: "/loans-cards",
  INCOME_FORECAST: "/year-plan",
  YEAR_PLAN_PHASE: "/year-plan",
  SHOPPING_TRIP: "/shopping",
};

const STATE_STYLE: Record<CalendarEntry["state"], string> = {
  PAID: "text-success",
  OVERDUE: "text-danger",
  SKIPPED: "text-muted-foreground line-through",
  UPCOMING: "text-muted-foreground",
};

const STATE_BADGE: Record<CalendarEntry["state"], string> = {
  PAID: "🟢 Paid",
  OVERDUE: "🔴 Overdue",
  SKIPPED: "Skipped",
  UPCOMING: "Upcoming",
};

export function CalendarEntryCard({
  entry,
  currency,
  accounts,
}: {
  entry: CalendarEntry;
  currency: string;
  accounts: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [isPending, setIsPending] = useState(false);

  async function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setIsPending(true);
    const result = await action();
    setIsPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Done");
    router.refresh();
  }

  const sourcePage = SOURCE_PAGE[entry.sourceType];

  return (
    <Card className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className={`font-medium ${STATE_STYLE[entry.state]}`}>{entry.label}</p>
        <p className="text-sm text-muted-foreground">
          {entry.date.toLocaleDateString()}
          {entry.amount !== null ? ` · ${formatMoney(entry.amount, currency)}` : ""} · {STATE_BADGE[entry.state]}
          {entry.confidence !== "CONFIRMED" ? ` · ${entry.confidence.toLowerCase()}` : ""}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {entry.sourceType === "PAYABLE" && entry.state !== "PAID" && (
          <Button
            size="sm"
            disabled={isPending}
            onClick={() => run(() => markPayablePaidAction(entry.sourceId, new FormData()))}
          >
            Mark as paid
          </Button>
        )}

        {entry.sourceType === "RECURRING_RULE" && (
          <>
            <Button
              size="sm"
              disabled={isPending}
              onClick={() => run(() => confirmRecurringOccurrenceAction(entry.sourceId, new FormData()))}
            >
              Confirm
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => run(() => skipRecurringOccurrenceAction(entry.sourceId))}
            >
              Skip
            </Button>
          </>
        )}

        {entry.sourceType === "RECURRING_PAYABLE" && (
          <>
            <Button
              size="sm"
              disabled={isPending}
              onClick={() => run(() => confirmRecurringPayableOccurrenceAction(entry.sourceId, new FormData()))}
            >
              Confirm
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => run(() => skipRecurringPayableOccurrenceAction(entry.sourceId))}
            >
              Skip
            </Button>
          </>
        )}

        {entry.sourceType === "CUSTOM_REMINDER" && (
          <>
            {entry.state === "UPCOMING" && (
              <>
                {accounts.length > 0 && (
                  <select
                    className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                )}
                <Button
                  size="sm"
                  disabled={isPending || !accountId}
                  onClick={() => {
                    const formData = new FormData();
                    formData.set("accountId", accountId);
                    return run(() => markReminderPaidAction(entry.sourceId, formData));
                  }}
                >
                  Mark paid
                </Button>
                <Button size="sm" variant="outline" disabled={isPending} onClick={() => run(() => skipReminderAction(entry.sourceId))}>
                  Skip
                </Button>
              </>
            )}
            {/* Delete is always available, regardless of state — deleting
                a reminder never touches its linked transaction, so a
                paid/skipped reminder isn't "locked" the way a paid Payable
                is. */}
            <Button size="sm" variant="ghost" disabled={isPending} onClick={() => run(() => deleteReminderAction(entry.sourceId))}>
              Delete
            </Button>
          </>
        )}

        {sourcePage && (
          <Link href={sourcePage} className="text-sm underline">
            Open
          </Link>
        )}
      </div>
    </Card>
  );
}
