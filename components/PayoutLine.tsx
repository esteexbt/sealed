"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Payout } from "@/lib/types";

/** Where a released stage's money went: on its way, sent, or waiting for something from the freelancer. */
export function PayoutLine({ payout, currency }: { payout: Payout; currency: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const amt = new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: payout.amount % 1 ? 2 : 0 }).format(payout.amount);
  const retry = async () => {
    setBusy(true);
    await fetch("/api/payouts/retry", { method: "POST" }).catch(() => {});
    setBusy(false);
    router.refresh();
  };

  if (payout.status === "sent")
    return <p className={`payout payout-sent`}><b>{amt}</b> sent to {payout.email}</p>;
  if (payout.status === "pending")
    return (
      <p className="payout payout-pending">
        <b>{amt}</b> on its way to {payout.email}
        {payout.paypalStatus === "UNCLAIMED" && <> · that email has no PayPal account yet, so PayPal is holding it for them</>}
      </p>
    );
  if (payout.status === "waiting_email")
    return (
      <p className="payout payout-wait">
        <b>{amt}</b> is ready for you. <Link href="/profile#getting-paid">Add your PayPal email</Link> and it’s sent straight away.
      </p>
    );
  return (
    <p className="payout payout-failed">
      <span>Payout of <b>{amt}</b> didn’t go through: {payout.error || "PayPal refused it."}</span>
      <button type="button" className="link-btn" onClick={retry} disabled={busy}>{busy ? "Trying…" : "Try again"}</button>
    </p>
  );
}
