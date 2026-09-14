"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { firstAccountSchema, onboardingSchema } from "@/lib/validations/onboarding";
import { ACCOUNT_TYPES } from "@/lib/constants/financial";
import { completeOnboardingAction, completeOnboardingWithAccountAction } from "@/actions/onboarding.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type OnboardingInput = z.infer<typeof onboardingSchema>;
type FirstAccountInput = z.infer<typeof firstAccountSchema>;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isFinishing, setIsFinishing] = useState(false);

  const {
    register: registerOnboarding,
    handleSubmit: handleOnboardingSubmit,
    getValues: getOnboardingValues,
    formState: { errors: onboardingErrors },
  } = useForm<OnboardingInput>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: { cycleStartDay: 1, currency: "PHP" },
  });

  const {
    register: registerAccount,
    handleSubmit: handleAccountSubmit,
    watch,
    setValue,
    formState: { errors: accountErrors },
  } = useForm<FirstAccountInput>({
    resolver: zodResolver(firstAccountSchema),
    defaultValues: { name: "", accountType: "CHECKING", openingBalance: 0 },
  });

  const accountType = watch("accountType");

  function goToAccountStep() {
    setStep(2);
  }

  async function finishWithAccount(accountValues: FirstAccountInput) {
    setServerError(null);
    setIsFinishing(true);
    const onboardingValues = getOnboardingValues();
    const formData = new FormData();
    formData.set("cycleStartDay", String(onboardingValues.cycleStartDay));
    formData.set("currency", onboardingValues.currency);
    formData.set("name", accountValues.name);
    formData.set("accountType", accountValues.accountType);
    formData.set("openingBalance", String(accountValues.openingBalance));

    const result = await completeOnboardingWithAccountAction(formData);
    setIsFinishing(false);
    if (!result.ok) {
      setServerError(result.error);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  async function skipAccountStep() {
    setServerError(null);
    setIsFinishing(true);
    const onboardingValues = getOnboardingValues();
    const formData = new FormData();
    formData.set("cycleStartDay", String(onboardingValues.cycleStartDay));
    formData.set("currency", onboardingValues.currency);

    const result = await completeOnboardingAction(formData);
    setIsFinishing(false);
    if (!result.ok) {
      setServerError(result.error);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-4">
      {step === 1 ? (
        <>
          <h1 className="text-xl font-semibold">Set up your budget</h1>
          <p className="text-sm text-muted-foreground">
            One thing before you get started. You can change this later in Settings.
          </p>
          <form onSubmit={handleOnboardingSubmit(goToAccountStep)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cycleStartDay">Cycle start day</Label>
              <Input
                id="cycleStartDay"
                type="number"
                min={1}
                max={31}
                {...registerOnboarding("cycleStartDay", { valueAsNumber: true })}
              />
              <p className="text-xs text-muted-foreground">
                e.g. 25 means each budget cycle runs from the 25th to the 24th of the next month.
              </p>
              {onboardingErrors.cycleStartDay && (
                <p className="text-sm text-destructive">{onboardingErrors.cycleStartDay.message}</p>
              )}
            </div>

            <Button type="submit">Continue</Button>
          </form>
        </>
      ) : (
        <>
          <h1 className="text-xl font-semibold">Add your first account</h1>
          <p className="text-sm text-muted-foreground">
            Add a bank, e-wallet, or cash account to get started. You can add more, or skip this for now
            and add one later from Accounts.
          </p>
          <form onSubmit={handleAccountSubmit(finishWithAccount)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" placeholder="e.g. Everyday Checking" {...registerAccount("name")} />
              {accountErrors.name && <p className="text-sm text-destructive">{accountErrors.name.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="accountType">Type</Label>
              <Select
                value={accountType}
                onValueChange={(v) => setValue("accountType", v as FirstAccountInput["accountType"])}
              >
                <SelectTrigger id="accountType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="openingBalance">Opening balance</Label>
              <Input
                id="openingBalance"
                type="number"
                step="0.01"
                {...registerAccount("openingBalance", { valueAsNumber: true })}
              />
              {accountErrors.openingBalance && (
                <p className="text-sm text-destructive">{accountErrors.openingBalance.message}</p>
              )}
            </div>

            {serverError && <p className="text-sm text-destructive">{serverError}</p>}

            <div className="flex flex-col gap-2">
              <Button type="submit" disabled={isFinishing}>
                {isFinishing ? "Saving..." : "Add account & finish"}
              </Button>
              <Button type="button" variant="ghost" disabled={isFinishing} onClick={skipAccountStep}>
                Skip for now
              </Button>
              <button
                type="button"
                className="text-sm text-muted-foreground underline-offset-4 hover:underline"
                onClick={() => setStep(1)}
              >
                Back
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
