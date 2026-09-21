import { formatMoney } from "@/lib/money";
import { LendingFormDialog } from "@/components/lending/lending-form-dialog";
import { RecordRepaymentDialog } from "@/components/lending/record-repayment-dialog";
import { MarkReturnedButton } from "@/components/lending/mark-returned-button";
import { ArchiveLendingButton } from "@/components/lending/archive-lending-button";
import { Card } from "@/components/ui/card";
import {lendingStatus} from "@/lib/workspace-ledger";

const LENDING_CURRENCY = "PHP";

type LendingRow = {
  id: string;
  borrowerName: string;
  kind: string;
  amount: number | null;
  outstanding: number | null;
  itemDescription: string | null;
  itemValue: number | null;
  returned: boolean;
  accountId: string | null;
  date: Date;
  history?:{id:string;date:Date;amount:number;accountName:string;currency:string;description:string}[];
};

export function LendingList({
  lendings,
  accounts,
}: {
  lendings: LendingRow[];
  accounts: { id: string; name: string; currency: string }[];
}) {
  if (lendings.length === 0) {
    return <p className="text-muted-foreground">No lending recorded yet.</p>;
  }

  const groups=[...new Set(lendings.map(l=>l.borrowerName))].map(name=>({name,rows:lendings.filter(l=>l.borrowerName===name)}));
  return (
    <div className="flex flex-col gap-3">
      {groups.map(group=><section key={group.name} className="rounded-xl border bg-card p-4"><div className="mb-4 flex flex-wrap justify-between gap-2"><h2 className="text-lg font-medium">{group.name}</h2><p className="font-medium tabular-nums">{formatMoney(group.rows.reduce((s,l)=>s+(l.outstanding??0),0),LENDING_CURRENCY)} still owed</p></div><div className="flex flex-col gap-3">{group.rows.map((lending) => (
        <Card key={lending.id} className="flex flex-col gap-3 border-0 bg-background p-4">
          <div>
            <p className="font-medium">{lending.borrowerName}</p>
            {lending.kind==="CASH"&&<p className="mt-1 text-xs font-medium text-primary">{lendingStatus(lending.amount??0,lending.outstanding??0)}</p>}
            {lending.kind === "CASH" ? (
              <p className="text-sm text-muted-foreground">
                {formatMoney(lending.outstanding ?? 0, LENDING_CURRENCY)} outstanding of{" "}
                {formatMoney(lending.amount ?? 0, LENDING_CURRENCY)} · lent {lending.date.toLocaleDateString()}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {lending.itemDescription}
                {lending.itemValue ? ` (~${formatMoney(lending.itemValue, LENDING_CURRENCY)})` : ""} ·{" "}
                {lending.returned ? "Returned" : "Not returned"} · lent {lending.date.toLocaleDateString()}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {lending.kind === "CASH" && (lending.outstanding??0)>0 && <RecordRepaymentDialog lendingId={lending.id} accounts={accounts} />}
            {lending.kind === "ITEM" && !lending.returned && <MarkReturnedButton lendingId={lending.id} />}
            <LendingFormDialog
              accounts={accounts}
              existing={{
                id: lending.id,
                borrowerName: lending.borrowerName,
                kind: lending.kind,
                amount: lending.amount,
                accountId: lending.accountId,
                itemDescription: lending.itemDescription,
                itemValue: lending.itemValue,
                date: lending.date,
              }}
            />
            <ArchiveLendingButton lendingId={lending.id} name={lending.borrowerName} />
          </div>
          <p className="text-xs text-muted-foreground">Lent from {accounts.find(a=>a.id===lending.accountId)?.name??"Historical / item record"}. Repayments are not income.</p>
          <details><summary className="cursor-pointer text-sm text-primary">Repayment history</summary><div className="mt-3 flex flex-col gap-2">{lending.history?.length?lending.history.map(t=><div key={t.id} className="flex flex-wrap justify-between gap-2 border-t pt-2 text-sm"><span>{t.description}<span className="block text-xs text-muted-foreground">{t.date.toLocaleDateString("en-PH",{timeZone:"Asia/Manila"})} · Received in {t.accountName}</span></span><span className="tabular-nums">{formatMoney(t.amount,t.currency)}</span></div>):<p className="text-xs text-muted-foreground">No repayments recorded.</p>}</div></details>
        </Card>
      ))}</div></section>)}
    </div>
  );
}
