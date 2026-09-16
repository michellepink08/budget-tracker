"use client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { copyLastCycleAction } from "@/actions/copy-last-cycle.actions";
export function CopyLastCycleButton({ periodId }: { periodId: string }) { const router = useRouter(); return <button type="button" className="h-9 rounded border px-3 text-sm" onClick={async () => { const result = await copyLastCycleAction(periodId); if (!result.ok) return toast.error(result.error); toast.success(`Copied ${result.incomeCopied} income, ${result.allocationsCopied} budgets, and ${result.paymentPlansCopied} payment plans`); router.refresh(); }}>Copy last cycle</button>; }
