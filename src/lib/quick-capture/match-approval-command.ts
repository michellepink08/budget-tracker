export type ApprovalCommand = "confirm" | "cancel" | "undo";

const CONFIRM_WORDS = new Set(["confirm", "yes", "yeah", "ok", "okay"]);
const CANCEL_WORDS = new Set(["cancel", "no", "nope"]);

// Only the first word is checked — a real dictated sentence ("confirm
// that please") still counts, but this is deliberately narrow: it's only
// ever called while the panel is in "approving" mode (see the panel's
// state machine), never against ordinary dictation, so there's no risk
// of a normal sentence that happens to start with one of these words
// misfiring as a command.
export function matchApprovalCommand(text: string): ApprovalCommand | null {
  const firstWord = text.trim().toLowerCase().split(/\s+/)[0];
  if (!firstWord) return null;
  if (CONFIRM_WORDS.has(firstWord)) return "confirm";
  if (CANCEL_WORDS.has(firstWord)) return "cancel";
  if (firstWord === "undo") return "undo";
  return null;
}
