import { z } from "zod";

export const QUICK_CAPTURE_INTENTS = [
  "expense",
  "income",
  "refund",
  "credit_card_charge",
  "transfer",
  "credit_card_payment",
  "loan_payment",
  "person_borrowed",
  "reconciliation",
  "payable_create",
  "payable_update",
  "transaction_update",
  "transaction_delete",
  "shopping_list_add",
  "shopping_list_select",
  "shopping_schedule",
  "year_plan_update_assumption",
  "navigate",
  "question",
] as const;
export type QuickCaptureIntent = (typeof QUICK_CAPTURE_INTENTS)[number];

export const QUESTION_TYPES = [
  "account_balance",
  "liquid_funds",
  "safe_to_spend",
  "spending_by_category",
  "spending_current_cutoff",
  "spending_previous_cutoff",
  "upcoming_payables",
  "due_this_week",
  "next_due",
  "transfers_required",
  "credit_card_balance",
  "credit_card_due",
  "restricted_fund_balance",
  "restricted_fund_coverage",
  "expected_income",
  "shopping_selected_total",
  "year_plan_recommended_saving",
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

// A reference to an account/category/existing-record as understood from
// text: resolved to a real id, ambiguous (more than one candidate, needs
// clarification), or unresolved (no match at all).
export const resolvedRefSchema = z.object({
  raw: z.string(),
  id: z.string().nullable(),
  candidateIds: z.array(z.string()).default([]),
});
export type ResolvedRef = z.infer<typeof resolvedRefSchema>;

export const dateFieldSchema = z.object({
  value: z.date(),
  confirmed: z.boolean(),
});
export type DateField = z.infer<typeof dateFieldSchema>;

const clarificationSchema = z
  .object({
    field: z.string(),
    question: z.string(),
    options: z.array(z.string()).optional(),
  })
  .nullable();
export type Clarification = z.infer<typeof clarificationSchema>;

// Every draft carries the exact clause it came from (for the preview
// card and for Undo/audit) and an optional single clarification request
// — never more than one at a time, per the design spec.
const base = {
  clauseText: z.string(),
  clarification: clarificationSchema.default(null),
};

// A raw cutoff signal from the command text, not yet resolved to an
// actual BudgetPeriod id — resolving/creating that period happens at
// confirm-time (Phase 2), reusing createExpenseLikeTransaction's
// existing manual-override support.
const cutoffOverrideSchema = z.enum(["previous", "current", "next"]).nullable();

export const expenseLikeDraftSchema = z.object({
  intent: z.enum(["expense", "income", "refund", "credit_card_charge"]),
  amountMinorUnits: z.number().int().positive(),
  account: resolvedRefSchema,
  category: resolvedRefSchema.nullable(),
  description: z.string(),
  date: dateFieldSchema,
  cutoffOverride: cutoffOverrideSchema,
  ...base,
});
export type ExpenseLikeDraft = z.infer<typeof expenseLikeDraftSchema>;

export const transferDraftSchema = z.object({
  intent: z.literal("transfer"),
  amountMinorUnits: z.number().int().positive(),
  feeMinorUnits: z.number().int().nonnegative(),
  sourceAccount: resolvedRefSchema,
  destinationAccount: resolvedRefSchema,
  description: z.string(),
  date: dateFieldSchema,
  cutoffOverride: cutoffOverrideSchema,
  ...base,
});
export type TransferDraft = z.infer<typeof transferDraftSchema>;

export const creditCardPaymentDraftSchema = z.object({
  intent: z.literal("credit_card_payment"),
  amountMinorUnits: z.number().int().positive(),
  payingAccount: resolvedRefSchema,
  creditCardAccount: resolvedRefSchema,
  date: dateFieldSchema,
  cutoffOverride: cutoffOverrideSchema,
  ...base,
});
export type CreditCardPaymentDraft = z.infer<typeof creditCardPaymentDraftSchema>;

export const loanPaymentDraftSchema = z.object({
  intent: z.literal("loan_payment"),
  amountMinorUnits: z.number().int().positive(),
  payingAccount: resolvedRefSchema,
  loan: resolvedRefSchema,
  date: dateFieldSchema,
  cutoffOverride: cutoffOverrideSchema,
  ...base,
});
export type LoanPaymentDraft = z.infer<typeof loanPaymentDraftSchema>;

export const personBorrowedDraftSchema = z.object({
  intent: z.literal("person_borrowed"),
  amountMinorUnits: z.number().int().positive(),
  account: resolvedRefSchema,
  personName: z.string(),
  date: dateFieldSchema,
  ...base,
});
export type PersonBorrowedDraft = z.infer<typeof personBorrowedDraftSchema>;

export const reconciliationDraftSchema = z.object({
  intent: z.literal("reconciliation"),
  account: resolvedRefSchema,
  actualBalanceMinorUnits: z.number().int(),
  date: dateFieldSchema,
  ...base,
});
export type ReconciliationDraft = z.infer<typeof reconciliationDraftSchema>;

export const payableCreateDraftSchema = z.object({
  intent: z.literal("payable_create"),
  name: z.string(),
  amountMinorUnits: z.number().int().positive(),
  dueDate: dateFieldSchema,
  statementDate: dateFieldSchema.nullable(),
  account: resolvedRefSchema,
  category: resolvedRefSchema.nullable(),
  notes: z.string().nullable(),
  cutoff: z.enum(["current", "next"]).nullable(),
  ...base,
});
export type PayableCreateDraft = z.infer<typeof payableCreateDraftSchema>;

export const payableUpdateDraftSchema = z.object({
  intent: z.literal("payable_update"),
  target: resolvedRefSchema,
  amountMinorUnits: z.number().int().positive().nullable(),
  dueDate: dateFieldSchema.nullable(),
  notes: z.string().nullable(),
  notesRemove: z.boolean().default(false),
  ...base,
});
export type PayableUpdateDraft = z.infer<typeof payableUpdateDraftSchema>;

export const transactionUpdateDraftSchema = z.object({
  intent: z.literal("transaction_update"),
  target: resolvedRefSchema,
  amountMinorUnits: z.number().int().positive().nullable(),
  date: dateFieldSchema.nullable(),
  description: z.string().nullable(),
  ...base,
});
export type TransactionUpdateDraft = z.infer<typeof transactionUpdateDraftSchema>;

export const transactionDeleteDraftSchema = z.object({
  intent: z.literal("transaction_delete"),
  target: resolvedRefSchema,
  ...base,
});
export type TransactionDeleteDraft = z.infer<typeof transactionDeleteDraftSchema>;

export const shoppingListAddDraftSchema = z.object({
  intent: z.literal("shopping_list_add"),
  item: resolvedRefSchema, // resolved against ShoppingCatalogItem; id is null when it's a new free-text item
  itemNameRaw: z.string(),
  ...base,
});
export type ShoppingListAddDraft = z.infer<typeof shoppingListAddDraftSchema>;

export const shoppingListSelectDraftSchema = z.object({
  intent: z.literal("shopping_list_select"),
  item: resolvedRefSchema, // resolved against the current list's own items, not the full catalog
  ...base,
});
export type ShoppingListSelectDraft = z.infer<typeof shoppingListSelectDraftSchema>;

export const shoppingScheduleDraftSchema = z.object({
  intent: z.literal("shopping_schedule"),
  date: dateFieldSchema,
  ...base,
});
export type ShoppingScheduleDraft = z.infer<typeof shoppingScheduleDraftSchema>;

export const yearPlanUpdateAssumptionDraftSchema = z.object({
  intent: z.literal("year_plan_update_assumption"),
  phase: resolvedRefSchema, // the YearPlanPhase being extended/shortened
  newEndDate: dateFieldSchema,
  ...base,
});
export type YearPlanUpdateAssumptionDraft = z.infer<typeof yearPlanUpdateAssumptionDraftSchema>;

// Never confirmed through executeDraft/QuickCaptureLog — the panel
// handles this entirely client-side as a router.push, since it changes
// no data (design spec section G: "a navigation command, not a data
// question").
export const navigateDraftSchema = z.object({
  intent: z.literal("navigate"),
  route: z.string(),
  label: z.string(),
  ...base,
});
export type NavigateDraft = z.infer<typeof navigateDraftSchema>;

export const questionDraftSchema = z.object({
  intent: z.literal("question"),
  questionType: z.enum(QUESTION_TYPES),
  account: resolvedRefSchema.nullable(),
  category: resolvedRefSchema.nullable(),
  ...base,
});
// `answer` is a plain TypeScript field, not Zod-validated — it's never
// parsed from user input, only ever attached server-side (by
// parseQuickCaptureAction, see src/lib/quick-capture/answer-question.ts)
// before the draft crosses back to the client.
export type QuestionDraft = z.infer<typeof questionDraftSchema> & {
  answer?: import("@/lib/quick-capture/answer-question").QuestionAnswer;
};

export type CommandDraft =
  | ExpenseLikeDraft
  | TransferDraft
  | CreditCardPaymentDraft
  | LoanPaymentDraft
  | PersonBorrowedDraft
  | ReconciliationDraft
  | PayableCreateDraft
  | PayableUpdateDraft
  | TransactionUpdateDraft
  | TransactionDeleteDraft
  | ShoppingListAddDraft
  | ShoppingListSelectDraft
  | ShoppingScheduleDraft
  | YearPlanUpdateAssumptionDraft
  | NavigateDraft
  | QuestionDraft;
