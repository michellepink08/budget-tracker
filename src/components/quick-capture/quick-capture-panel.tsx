"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, MicOff } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  parseQuickCaptureAction,
  confirmQuickCaptureDraftAction,
  undoQuickCaptureAction,
} from "@/actions/quick-capture.actions";
import { useVoiceCapture } from "@/lib/quick-capture/use-voice-capture";
import type { CommandDraft } from "@/lib/quick-capture/types";

type DraftState = {
  draft: CommandDraft;
  status: "pending" | "confirmed" | "error";
  error?: string;
  logId?: string;
};

const EXAMPLES = [
  "Paid 180 for food using cash",
  "Transferred 1,000 from BPI to GCash",
  "Received 5,000 from Rei in BPI Savings",
];

function summarize(draft: CommandDraft): string {
  switch (draft.intent) {
    case "expense":
    case "income":
    case "refund":
    case "credit_card_charge":
      return `${draft.intent.replace("_", " ")} — ${(draft.amountMinorUnits / 100).toFixed(2)} (${draft.account.raw})${
        draft.date.confirmed ? "" : " · estimated date"
      }`;
    case "transfer":
      return `transfer — ${(draft.amountMinorUnits / 100).toFixed(2)} from ${draft.sourceAccount.raw} to ${draft.destinationAccount.raw}`;
    case "credit_card_payment":
      return `credit card payment — ${(draft.amountMinorUnits / 100).toFixed(2)}`;
    case "loan_payment":
      return `loan payment — ${(draft.amountMinorUnits / 100).toFixed(2)}`;
    case "person_borrowed":
      return `${draft.personName} borrowed ${(draft.amountMinorUnits / 100).toFixed(2)} from ${draft.account.raw}`;
    case "reconciliation":
      return `reconcile ${draft.account.raw} to ${(draft.actualBalanceMinorUnits / 100).toFixed(2)}`;
    case "payable_create":
      return `payable — ${draft.name}, ${(draft.amountMinorUnits / 100).toFixed(2)}${
        draft.dueDate.confirmed ? "" : " · estimated due date"
      }`;
    case "payable_update":
      return `update payable${draft.amountMinorUnits ? ` to ${(draft.amountMinorUnits / 100).toFixed(2)}` : ""}`;
    case "transaction_update":
      return `update transaction${draft.amountMinorUnits ? ` to ${(draft.amountMinorUnits / 100).toFixed(2)}` : ""}`;
    case "transaction_delete":
      return "delete transaction — this can't be undone";
    case "shopping_schedule":
      return `schedule shopping for ${draft.date.value.toLocaleDateString()}`;
    case "shopping_list_add":
      return `add ${draft.itemNameRaw} to shopping list`;
    case "question": {
      const answer = draft.answer;
      if (!answer) return "question";
      if (answer.kind === "amount") return `${answer.label}: ${(answer.amountMinorUnits / 100).toFixed(2)}`;
      if (answer.kind === "text") return `${answer.label}: ${answer.text}`;
      if (answer.kind === "unavailable") return answer.message;
      return answer.label; // "list" kind — the item breakdown renders separately
    }
  }
}

export function QuickCapturePanel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<DraftState[] | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const voice = useVoiceCapture(setText);

  // Reset local state on close via the dialog's own open-change callback
  // (not an effect watching `open`) — resetting state directly inside an
  // effect body causes an extra cascading render.
  function handleOpenChange(next: boolean) {
    if (!next) {
      setText("");
      setDrafts(null);
      setParseError(null);
      voice.stop();
    }
    onOpenChange(next);
  }

  async function handleParse() {
    setParsing(true);
    setParseError(null);
    const result = await parseQuickCaptureAction(text);
    setParsing(false);
    if (!result.ok) {
      setParseError(result.error);
      return;
    }
    setDrafts(result.drafts.map((draft) => ({ draft, status: "pending" as const })));
  }

  async function handleConfirm(index: number) {
    if (!drafts) return;
    const entry = drafts[index];
    const result = await confirmQuickCaptureDraftAction(entry.draft);
    setDrafts((prev) =>
      prev!.map((d, i) =>
        i === index
          ? result.ok
            ? { ...d, status: "confirmed" as const, logId: result.logId }
            : { ...d, status: "error" as const, error: result.error }
          : d,
      ),
    );
  }

  async function handleUndo(index: number) {
    if (!drafts) return;
    const entry = drafts[index];
    if (!entry.logId) return;
    await undoQuickCaptureAction(entry.logId);
    setDrafts((prev) =>
      prev!.map((d, i) => (i === index ? { ...d, status: "pending" as const, logId: undefined } : d)),
    );
  }

  function handleCancel(index: number) {
    setDrafts((prev) => (prev ? prev.filter((_, i) => i !== index) : prev));
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Quick Capture</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <Input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleParse();
              }}
              placeholder="Paid 180 for food using cash"
            />
            {voice.supported && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={parsing}
                aria-label={voice.listening ? "Stop voice input" : "Start voice input"}
                onClick={() => (voice.listening ? voice.stop() : voice.start())}
              >
                {voice.listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
            )}
            <Button type="button" onClick={handleParse} disabled={parsing || !text.trim()}>
              {parsing ? "..." : "Parse"}
            </Button>
          </div>

          {voice.error && (
            <p className="text-sm text-destructive">
              {voice.error === "not-allowed"
                ? "Microphone access was denied. You can still type your command."
                : voice.error === "no-speech"
                  ? "Didn't catch that — try again or type instead."
                  : "Voice input isn't working right now — please type instead."}
            </p>
          )}

          {!drafts && (
            <div className="flex flex-col gap-1 text-xs text-muted-foreground">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  className="rounded-sm text-left underline hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  onClick={() => setText(example)}
                >
                  {example}
                </button>
              ))}
            </div>
          )}

          {parseError && <p className="text-sm text-destructive">{parseError}</p>}

          {drafts?.map((entry, index) => (
            <Card key={index} className="p-3 text-sm">
              <p className="mb-2">{summarize(entry.draft)}</p>

              {entry.draft.intent === "question" && entry.draft.answer?.kind === "list" && (
                <ul className="mb-2 flex flex-col gap-0.5 text-xs text-muted-foreground">
                  {entry.draft.answer.items.length === 0 && <li>Nothing to show</li>}
                  {entry.draft.answer.items.map((item, i) => (
                    <li key={i} className="flex justify-between">
                      <span>{item.label}</span>
                      <span>{(item.amountMinorUnits / 100).toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              )}

              {entry.draft.clarification && entry.status === "pending" && (
                <p className="mb-2 text-warning">{entry.draft.clarification.question}</p>
              )}

              {entry.status === "pending" && !entry.draft.clarification && entry.draft.intent !== "question" && (
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={() => handleConfirm(index)}>
                    Confirm
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => handleCancel(index)}>
                    Cancel
                  </Button>
                </div>
              )}

              {entry.status === "confirmed" && (
                <div className="flex items-center gap-2 text-success">
                  <span>Added ✓</span>
                  {entry.draft.intent !== "transaction_delete" && (
                    <button
                      type="button"
                      className="rounded-sm underline hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      onClick={() => handleUndo(index)}
                    >
                      Undo
                    </button>
                  )}
                  <button
                    type="button"
                    className="rounded-sm underline hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    onClick={() => {
                      handleOpenChange(false);
                      router.push("/transactions");
                    }}
                  >
                    View
                  </button>
                </div>
              )}

              {entry.status === "error" && <p className="text-destructive">{entry.error}</p>}
            </Card>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
