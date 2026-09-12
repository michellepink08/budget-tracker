"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { onboardingSchema } from "@/lib/validations/onboarding";
import { completeOnboardingAction } from "@/actions/onboarding.actions";
import { ACCENT_COLORS } from "@/lib/constants/appearance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type OnboardingInput = z.infer<typeof onboardingSchema>;

const CURRENCIES = ["PHP", "USD"];

export default function OnboardingPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<OnboardingInput>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: { cycleStartDay: 1, currency: "PHP", accentColor: "emerald" },
  });

  const selectedAccent = watch("accentColor");

  async function onSubmit(values: OnboardingInput) {
    setServerError(null);
    const formData = new FormData();
    formData.set("cycleStartDay", String(values.cycleStartDay));
    formData.set("currency", values.currency);
    formData.set("accentColor", values.accentColor);
    const result = await completeOnboardingAction(formData);
    if (!result.ok) {
      setServerError(result.error);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-4">
      <h1 className="text-xl font-semibold">Set up your budget</h1>
      <p className="text-sm text-muted-foreground">
        A few things before you get started. You can change these later in Settings.
      </p>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cycleStartDay">Cycle start day</Label>
          <Input
            id="cycleStartDay"
            type="number"
            min={1}
            max={31}
            {...register("cycleStartDay", { valueAsNumber: true })}
          />
          <p className="text-xs text-muted-foreground">
            e.g. 25 means each budget cycle runs from the 25th to the 24th of the next month.
          </p>
          {errors.cycleStartDay && (
            <p className="text-sm text-destructive">{errors.cycleStartDay.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="currency">Currency</Label>
          <select
            id="currency"
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            {...register("currency")}
          >
            {CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
          {errors.currency && <p className="text-sm text-destructive">{errors.currency.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Accent color</Label>
          <div className="flex gap-2">
            {ACCENT_COLORS.map((color) => (
              <button
                key={color.value}
                type="button"
                aria-label={color.label}
                onClick={() => setValue("accentColor", color.value, { shouldValidate: true })}
                className="h-8 w-8 rounded-full border-2"
                style={{
                  backgroundColor: color.swatch,
                  borderColor: selectedAccent === color.value ? color.swatch : "transparent",
                  outline: selectedAccent === color.value ? "2px solid currentColor" : "none",
                  outlineOffset: 2,
                }}
              />
            ))}
          </div>
          {errors.accentColor && (
            <p className="text-sm text-destructive">{errors.accentColor.message}</p>
          )}
        </div>

        {serverError && <p className="text-sm text-destructive">{serverError}</p>}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : "Continue"}
        </Button>
      </form>
    </div>
  );
}
