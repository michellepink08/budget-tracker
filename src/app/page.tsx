import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { APP_NAME } from "@/lib/config";
import { ViewDemoButton } from "@/components/landing/view-demo-button";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const DIFFERENTIATORS = [
  {
    title: "Budget cycles that match payday, not the calendar",
    body: "Set your own cutoff day — the 25th, the 10th, whatever your pay cycle actually is — and every report follows it.",
  },
  {
    title: "Real account tracking",
    body: "Cash, checking, e-wallets, credit cards, and loans, each with their own running balance.",
  },
  {
    title: "Transfers that don't lie about your spending",
    body: "Moving money between your own accounts is never counted as income or an expense — only a transfer fee is.",
  },
  {
    title: "Bills and installments, planned ahead",
    body: "See what's due this week across one-off bills, recurring bills, and credit-card installment plans in one place.",
  },
  {
    title: "Budget rollover, per category",
    body: "Unused or overspent amounts can carry into the next cycle — you choose which categories do that, and how.",
  },
  {
    title: "Reconciliation that never silently overwrites",
    body: "Tell the app what an account actually holds; it shows you the gap and asks before recording an adjustment.",
  },
];

export default async function Home() {
  const session = await auth();
  if (session) {
    redirect("/dashboard");
  }

  return (
    <div className="flex flex-col gap-16 px-4 py-16">
      <section className="mx-auto flex max-w-2xl flex-col items-center gap-6 text-center">
        <h1 className="text-4xl font-semibold">{APP_NAME}</h1>
        <p className="text-lg text-muted-foreground">
          A budget tracker built around how you actually get paid — not the calendar month.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <ViewDemoButton />
          <Link href="/signup" className={buttonVariants({ variant: "outline", size: "lg" })}>
            Sign up
          </Link>
          <Link href="/login" className={buttonVariants({ variant: "ghost", size: "lg" })}>
            Log in
          </Link>
        </div>
      </section>

      <section className="mx-auto grid max-w-4xl grid-cols-1 gap-6 sm:grid-cols-2">
        {DIFFERENTIATORS.map((item) => (
          <Card key={item.title} className="p-5">
            <h2 className="font-medium">{item.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
          </Card>
        ))}
      </section>
    </div>
  );
}
