"use server";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { copyLastCyclePlans } from "@/lib/copy-last-cycle";
export async function copyLastCycleAction(periodId: string) { const session = await auth(); if (!session?.user?.id) return { ok: false as const, error: "You must be logged in" }; const result = await copyLastCyclePlans(prisma, session.user.id, periodId); if (result.ok) revalidatePath("/budget"); return result; }
