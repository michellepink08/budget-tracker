import { requireNotOnboarded } from "@/app/onboarding/guard";

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  await requireNotOnboarded();
  return <>{children}</>;
}
