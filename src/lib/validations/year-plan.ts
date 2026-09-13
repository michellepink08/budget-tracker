import { z } from "zod";
import { INCOME_FORECAST_SOURCES, INCOME_FORECAST_STATUSES, YEAR_PLAN_PHASE_TYPES } from "@/lib/constants/financial";

export const yearPlanSchema = z.object({
  name: z.string().min(1, "Name is required"),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  minCashBuffer: z.number().nonnegative(), // major units; converted by the caller
  vacationReserveGoalId: z.string().nullable(),
});

export const yearPlanPhaseSchema = z.object({
  phaseType: z.enum(YEAR_PLAN_PHASE_TYPES),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  label: z.string().nullable(),
  estimatedExpensesPerCutoff: z.number().nonnegative(), // major units
});

export const incomeForecastSchema = z.object({
  phaseId: z.string().nullable(),
  source: z.enum(INCOME_FORECAST_SOURCES),
  expectedDate: z.coerce.date(),
  expectedAmount: z.number(), // major units
  cutoffLabel: z.string().min(1, "Cutoff label is required"),
  status: z.enum(INCOME_FORECAST_STATUSES),
  notes: z.string().nullable(),
});
