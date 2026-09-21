"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border bg-card p-6">
      <h2 className="text-lg font-semibold">This page hit a problem</h2>
      <p className="text-sm text-muted-foreground">
        Your data is safe. Try again, and if it keeps happening, go back to the Dashboard.
      </p>
      <div className="flex gap-2">
        <Button onClick={() => retry()}>Try again</Button>
        <Button variant="outline" render={<a href="/dashboard" />}>
          Go to Dashboard
        </Button>
      </div>
    </div>
  );
}
