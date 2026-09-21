export type LoanImportPlan = {
  missing: Array<{
    loan: { id: string; [key: string]: unknown };
    openingBalance: number;
    endingBalance: number;
    provenance: string;
    sourceKey: string;
    payment: { amount: number; type: string; subcategoryId?: string | null; [key: string]: unknown };
  }>;
  alreadyRecorded: Array<{ name: string; recordId: string; endingBalance: number }>;
  probableDuplicates: Array<{ name: string; recordIds: string[] }>;
};
export function planSeptemberLoanImport(state: unknown): LoanImportPlan;
