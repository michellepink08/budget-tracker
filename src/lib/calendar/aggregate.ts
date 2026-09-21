import type { PrismaClient } from "@prisma/client";
import { daysInMonth } from "@/lib/recurring-schedule";
import {classifyObligation,linkedPlanActual} from "@/lib/financial-obligations";
import {projectCardStatement,statementBeforeDue} from "@/lib/card-statements";

export type CalendarEntry = {
  id: string;
  sourceType:
    | "PAYABLE"
    | "CREDIT_CARD_STATEMENT"
    | "CREDIT_CARD_DUE"
    | "INSTALLMENT"
    | "LOAN_DUE"
    | "RECURRING_RULE"
    | "RECURRING_PAYABLE"
    | "INCOME_FORECAST"
    | "SHOPPING_TRIP"
    | "YEAR_PLAN_PHASE"
    | "CUSTOM_REMINDER";
  sourceId: string;
  date: Date;
  label: string;
  amount: number | null;
  confidence: "CONFIRMED" | "EXPECTED" | "ESTIMATED" | "UNCERTAIN";
  state: "UPCOMING" | "PAID" | "SKIPPED" | "OVERDUE";
};

function deriveOverdue(
  date: Date,
  now: Date,
  baseState: "UPCOMING" | "PAID" | "SKIPPED",
): CalendarEntry["state"] {
  if (baseState !== "UPCOMING") return baseState;
  return date < now ? "OVERDUE" : "UPCOMING";
}

function clampedMonthDate(year: number, monthIndex0: number, day: number): Date {
  return new Date(year, monthIndex0, Math.min(day, daysInMonth(year, monthIndex0)));
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

type CalendarPrisma = Pick<
  PrismaClient,
  | "payable"
  | "creditCard"
  | "installmentPayment"
  | "installmentPurchase"
  | "loan"
  | "recurringRule"
  | "recurringPayable"
  | "incomeForecast"
  | "shoppingList"
  | "yearPlanPhase"
  | "customReminder"
  | "cyclePaymentPlan"
  | "transaction"
>;

export async function listCalendarEntries(
  prisma: CalendarPrisma,
  userId: string,
  range: { start: Date; end: Date },
  now: Date = new Date(),
): Promise<CalendarEntry[]> {
  const entries: CalendarEntry[] = [];

  // PAYABLE — already-materialized concrete obligations, no projection.
  const payables = await prisma.payable.findMany({
    where: { userId, dueDate: { gte: range.start, lte: range.end } },
  });
  for (const p of payables as {
    id: string;
    name: string;
    amount: number;
    dueDate: Date;
    status: string;
  }[]) {
    entries.push({
      id: `payable-${p.id}`,
      sourceType: "PAYABLE",
      sourceId: p.id,
      date: p.dueDate,
      label: p.name,
      amount: p.amount,
      confidence: "CONFIRMED",
      state: p.status === "PAID" ? "PAID" : deriveOverdue(p.dueDate, now, "UPCOMING"),
    });
  }

  // INSTALLMENT — pre-generated per-term rows, no projection.
  const installmentPayments = await prisma.installmentPayment.findMany({
    where: { userId, dueDate: { gte: range.start, lte: range.end } },
  });
  const purchaseIds = [...new Set(installmentPayments.map((p: { installmentPurchaseId: string }) => p.installmentPurchaseId))];
  const purchases = purchaseIds.length
    ? await prisma.installmentPurchase.findMany({ where: { id: { in: purchaseIds } } })
    : [];
  for (const ip of installmentPayments as {
    id: string;
    installmentPurchaseId: string;
    termNumber: number;
    amount: number;
    dueDate: Date;
    status: string;
  }[]) {
    const purchase = purchases.find((pu: { id: string }) => pu.id === ip.installmentPurchaseId) as
      | { name: string; numberOfTerms: number }
      | undefined;
    entries.push({
      id: `installment-${ip.id}`,
      sourceType: "INSTALLMENT",
      sourceId: ip.id,
      date: ip.dueDate,
      label: purchase ? `${purchase.name} (term ${ip.termNumber} of ${purchase.numberOfTerms})` : `Installment term ${ip.termNumber}`,
      amount: ip.amount,
      confidence: "CONFIRMED",
      state: ip.status === "PAID" ? "PAID" : deriveOverdue(ip.dueDate, now, "UPCOMING"),
    });
  }

  // RECURRING_RULE — exactly one upcoming occurrence at a time (nextDate);
  // confirming posts a transaction directly and advances nextDate.
  const recurringRules = await prisma.recurringRule.findMany({
    where: { userId, active: true, nextDate: { gte: range.start, lte: range.end } },
  });
  for (const r of recurringRules as { id: string; name: string; amount: number; nextDate: Date }[]) {
    entries.push({
      id: `recurring-rule-${r.id}`,
      sourceType: "RECURRING_RULE",
      sourceId: r.id,
      date: r.nextDate,
      label: r.name,
      amount: r.amount,
      confidence: "EXPECTED",
      state: deriveOverdue(r.nextDate, now, "UPCOMING"),
    });
  }

  // RECURRING_PAYABLE — same one-occurrence shape (nextDueDate); confirming
  // creates a Payable with recurringPayableId set. Dedup: skip this
  // source's own entry when a Payable already materialized that exact date.
  const recurringPayables = await prisma.recurringPayable.findMany({
    where: { userId, active: true, nextDueDate: { gte: range.start, lte: range.end } },
  });
  for (const rp of recurringPayables as { id: string; name: string; amount: number; nextDueDate: Date }[]) {
    const alreadyMaterialized = (payables as { recurringPayableId?: string | null; dueDate: Date }[]).some(
      (p) => p.recurringPayableId === rp.id && sameDay(p.dueDate, rp.nextDueDate),
    );
    if (alreadyMaterialized) continue;
    entries.push({
      id: `recurring-payable-${rp.id}`,
      sourceType: "RECURRING_PAYABLE",
      sourceId: rp.id,
      date: rp.nextDueDate,
      label: rp.name,
      amount: rp.amount,
      confidence: "EXPECTED",
      state: deriveOverdue(rp.nextDueDate, now, "UPCOMING"),
    });
  }

  // INCOME_FORECAST — plain range query; passes through its own confidence
  // status, and reports PAID once linked (never OVERDUE — an unreceived
  // expected paycheck isn't "overdue" the way a bill is).
  const forecasts = await prisma.incomeForecast.findMany({
    where: { userId, expectedDate: { gte: range.start, lte: range.end } },
  });
  for (const f of forecasts as {
    id: string;
    source: string;
    expectedAmount: number;
    expectedDate: Date;
    status: string;
    actualTransactionId: string | null;
  }[]) {
    entries.push({
      id: `income-forecast-${f.id}`,
      sourceType: "INCOME_FORECAST",
      sourceId: f.id,
      date: f.expectedDate,
      label: f.source,
      amount: f.expectedAmount,
      confidence: f.status as CalendarEntry["confidence"],
      state: f.actualTransactionId ? "PAID" : "UPCOMING",
    });
  }

  // SHOPPING_TRIP — only lists that have a plannedDate set.
  const shoppingLists = await prisma.shoppingList.findMany({
    where: { userId, plannedDate: { gte: range.start, lte: range.end } },
  });
  for (const l of shoppingLists as { id: string; name: string; plannedDate: Date }[]) {
    entries.push({
      id: `shopping-trip-${l.id}`,
      sourceType: "SHOPPING_TRIP",
      sourceId: l.id,
      date: l.plannedDate,
      label: l.name,
      amount: null,
      confidence: "EXPECTED",
      state: deriveOverdue(l.plannedDate, now, "UPCOMING"),
    });
  }

  // YEAR_PLAN_PHASE — marks when a phase begins.
  const phases = await prisma.yearPlanPhase.findMany({
    where: { userId, startDate: { gte: range.start, lte: range.end } },
  });
  for (const p of phases as { id: string; phaseType: string; label: string | null; startDate: Date }[]) {
    entries.push({
      id: `year-plan-phase-${p.id}`,
      sourceType: "YEAR_PLAN_PHASE",
      sourceId: p.id,
      date: p.startDate,
      label: p.label ?? p.phaseType,
      amount: null,
      confidence: "EXPECTED",
      state: deriveOverdue(p.startDate, now, "UPCOMING"),
    });
  }

  // CUSTOM_REMINDER — the one new model this plan introduces.
  const reminders = await prisma.customReminder.findMany({
    where: { userId, date: { gte: range.start, lte: range.end } },
  });
  for (const r of reminders as { id: string; label: string; date: Date; amount: number | null; state: string }[]) {
    entries.push({
      id: `custom-reminder-${r.id}`,
      sourceType: "CUSTOM_REMINDER",
      sourceId: r.id,
      date: r.date,
      label: r.label,
      amount: r.amount,
      confidence: "CONFIRMED",
      state:
        r.state === "PAID" || r.state === "SKIPPED"
          ? (r.state as "PAID" | "SKIPPED")
          : deriveOverdue(r.date, now, "UPCOMING"),
    });
  }

  // CREDIT_CARD_STATEMENT / CREDIT_CARD_DUE — the one source with no
  // stored occurrence rows at all; project one statement date and one due
  // date per calendar month overlapping the range, clamped the same way
  // advanceNextDate's MONTHLY case clamps (reusing daysInMonth, not
  // reimplementing it).
  const creditCards = await prisma.creditCard.findMany({
    where: { userId },
    include: { account: true },
  });
  const monthsInRange: { year: number; monthIndex0: number }[] = [];
  {
    let cursor = new Date(range.start.getFullYear(), range.start.getMonth(), 1);
    const last = new Date(range.end.getFullYear(), range.end.getMonth(), 1);
    while (cursor <= last) {
      monthsInRange.push({ year: cursor.getFullYear(), monthIndex0: cursor.getMonth() });
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
  }
  for (const cc of creditCards as {
    id: string;
    statementDay: number;
    paymentDueDay: number;
    account: { name: string };
  }[]) {
    for (const { year, monthIndex0 } of monthsInRange) {
      const statementDate = clampedMonthDate(year, monthIndex0, cc.statementDay);
      if (statementDate >= range.start && statementDate <= range.end) {
        entries.push({
          id: `credit-card-statement-${cc.id}-${year}-${monthIndex0}`,
          sourceType: "CREDIT_CARD_STATEMENT",
          sourceId: cc.id,
          date: statementDate,
          label: `${cc.account.name} statement`,
          amount: null,
          confidence: "ESTIMATED",
          state: "UPCOMING",
        });
      }
      const dueDate = clampedMonthDate(year, monthIndex0, cc.paymentDueDay);
      if (dueDate >= range.start && dueDate <= range.end) {
        entries.push({
          id: `credit-card-due-${cc.id}-${year}-${monthIndex0}`,
          sourceType: "CREDIT_CARD_DUE",
          sourceId: cc.id,
          date: dueDate,
          label: `${cc.account.name} payment due`,
          amount: null,
          confidence: "ESTIMATED",
          state: "UPCOMING",
        });
      }
    }
  }

  // LOAN_DUE — same no-stored-rows projection as the credit card due date,
  // but only for loans that opted in with a dueDay, and only for the
  // months between startDate and endDate (an open-ended loan with no
  // endDate keeps projecting for as long as it stays unarchived).
  const loans = await prisma.loan.findMany({
    where: { userId, archivedAt: null, dueDay: { not: null } },
  });
  for (const loan of loans as {
    id: string;
    name: string;
    monthlyPayment: number;
    startDate: Date;
    endDate: Date | null;
    dueDay: number | null;
  }[]) {
    if (!loan.dueDay) continue;
    const startMonthIndex = loan.startDate.getFullYear() * 12 + loan.startDate.getMonth();
    const endMonthIndex = loan.endDate ? loan.endDate.getFullYear() * 12 + loan.endDate.getMonth() : null;
    for (const { year, monthIndex0 } of monthsInRange) {
      const monthIndex = year * 12 + monthIndex0;
      if (monthIndex < startMonthIndex) continue;
      if (endMonthIndex !== null && monthIndex > endMonthIndex) continue;

      const dueDate = clampedMonthDate(year, monthIndex0, loan.dueDay);
      if (dueDate >= range.start && dueDate <= range.end) {
        entries.push({
          id: `loan-due-${loan.id}-${year}-${monthIndex0}`,
          sourceType: "LOAN_DUE",
          sourceId: loan.id,
          date: dueDate,
          label: `${loan.name} payment due`,
          amount: loan.monthlyPayment,
          confidence: "ESTIMATED",
          state: "UPCOMING",
        });
      }
    }
  }

  const plans=await prisma.cyclePaymentPlan.findMany({where:{userId},include:{budgetPeriod:true,payments:{include:{transaction:true}}},orderBy:{budgetPeriod:{startDate:"asc"}}});
  const dateKey=(date:Date)=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Manila",year:"numeric",month:"2-digit",day:"2-digit"}).format(date);
  const filtered=entries.filter(entry=>!plans.some(plan=>((entry.sourceType==="CREDIT_CARD_DUE"&&plan.sourceType==="CREDIT_CARD")||(entry.sourceType==="LOAN_DUE"&&plan.sourceType==="LOAN"))&&entry.sourceId===plan.sourceId&&dateKey(entry.date)>=dateKey(plan.budgetPeriod.startDate)&&dateKey(entry.date)<=dateKey(plan.budgetPeriod.endDate)));
  for(const plan of plans){
    if(!plan.dueDate||plan.dueDateStatus==="UNSET"||dateKey(plan.dueDate)<dateKey(range.start)||dateKey(plan.dueDate)>dateKey(range.end))continue;
    const paid=linkedPlanActual(plan);
    const remaining=plan.expectedAmount-paid;
    const routing=classifyObligation({dueDate:plan.dueDate,dueDateStatus:plan.dueDateStatus,remaining},now);
    const card=creditCards.find(c=>c.id===plan.sourceId),loan=loans.find(l=>l.id===plan.sourceId);
    filtered.push({id:`payment-plan-${plan.id}`,sourceType:plan.sourceType==="LOAN"?"LOAN_DUE":"CREDIT_CARD_DUE",sourceId:plan.sourceId,date:plan.dueDate,label:`${card?.account.name??loan?.name??"Planned payment"} payment due`,amount:Math.max(0,remaining),confidence:plan.dueDateStatus,state:routing==="PAID"?"PAID":routing==="OVERDUE"?"OVERDUE":"UPCOMING"});
  }
  const history=await prisma.transaction.findMany({where:{userId},orderBy:{date:"asc"}});
  const projected=filtered.flatMap(entry=>{
    if(entry.sourceType!=="CREDIT_CARD_STATEMENT"&&entry.sourceType!=="CREDIT_CARD_DUE")return [entry];
    const card=creditCards.find(c=>c.id===entry.sourceId);
    if(!card||!Number.isSafeInteger(card.creditLimit)||!Number.isSafeInteger(card.account.openingBalance))return [entry];
    const stored=plans.find(p=>`payment-plan-${p.id}`===entry.id);
    const dateOnly=new Date(`${dateKey(entry.date)}T00:00:00Z`);
    const cutoff=entry.sourceType==="CREDIT_CARD_STATEMENT"?dateOnly:stored?.statementDate??statementBeforeDue(dateOnly,card.statementDay);
    const forecast=projectCardStatement(card,cutoff,history,plans.filter(p=>p.sourceType==="CREDIT_CARD"),now);
    if(entry.sourceType==="CREDIT_CARD_DUE"&&forecast.dueDateStatus==="UNSET"&&!stored)return [];
    if(stored&&(!stored.statementDate||(stored.statementDate<=now&&stored.dueDateStatus==="CONFIRMED")||stored.expectedAmount!==stored.statementAmount))return [entry];
    return [{...entry,amount:entry.sourceType==="CREDIT_CARD_STATEMENT"?forecast.expected:forecast.remaining,label:entry.label+(forecast.estimatedInterest>0?" (includes estimated interest)":""),state:entry.sourceType==="CREDIT_CARD_DUE"&&forecast.remaining===0?"PAID" as const:entry.state}];
  });
  return projected.sort((a, b) => a.date.getTime() - b.date.getTime());
}
