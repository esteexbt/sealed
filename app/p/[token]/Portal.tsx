"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Seal } from "@/components/Seal";

export interface PortalMilestone {
  id: string;
  title: string;
  description: string;
  deliverables: string[];
  amount: number;
  dueDate: string;
  paid: boolean;
  refunded: boolean;
  files: { id: string; name: string; hasPreview: boolean; size: number }[];
}

interface Props {
  token: string;
  title: string;
  clientName: string;
  freelancer: string;
  currency: string;
  milestones: PortalMilestone[];
  mode: "sandbox" | "simulation";
  clientId: string;
}

declare global {
  interface Window {
    paypal?: {
      Buttons: (opts: Record<string, unknown>) => { render: (el: HTMLElement) => Promise<void>; close?: () => void; isEligible?: () => boolean };
    };
  }
}

function loadPayPal(clientId: string, currency: string) {
  const src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=${currency}&intent=capture&components=buttons&disable-funding=paylater`;
  return new Promise<void>((resolve, reject) => {
    if (window.paypal) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(`script[data-sealed-paypal]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("PayPal couldn't load")));
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.dataset.sealedPaypal = "1";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("PayPal couldn't load. Check your connection and refresh."));
    document.head.appendChild(s);
  });
}

export function Portal(props: Props) {
  const { milestones, currency } = props;
  const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);
  const [justPaid, setJustPaid] = useState<Record<string, boolean>>({});
  const paidTotal = milestones.filter((m) => m.paid || justPaid[m.id]).reduce((a, m) => a + m.amount, 0);
  const total = milestones.reduce((a, m) => a + m.amount, 0);
  const nextUnpaid = milestones.find((m) => !m.paid && !justPaid[m.id] && !m.refunded);

  return (
    <div className="portal">
      <header className="portal-head">
        <p className="portal-from">
          <Seal size={26} monogram={props.freelancer.charAt(0)} />
          {props.freelancer}
        </p>
        <h1>{props.title}</h1>
        <p className="lede muted">
          Hi {props.clientName}. Everything for this project lives here. You can preview each stage now; its full files unlock the moment it’s paid.
        </p>
        <div className="portal-progress" aria-label={`${fmt(paidTotal)} of ${fmt(total)} paid`}>
          <div className="portal-bar"><span style={{ width: `${total ? (paidTotal / total) * 100 : 0}%` }} /></div>
          <span className="small muted">{fmt(paidTotal)} of {fmt(total)} paid</span>
        </div>
        {props.mode === "simulation" && (
          <p className="notice tiny">Demo mode: payments are simulated. Connect PayPal sandbox keys to take real sandbox payments.</p>
        )}
      </header>

      <ol className="portal-ms">
        {milestones.map((m, i) => (
          <MilestoneBlock
            key={m.id}
            index={i}
            m={m}
            fmt={fmt}
            {...props}
            isNext={nextUnpaid?.id === m.id}
            justPaid={Boolean(justPaid[m.id])}
            onPaid={() => setJustPaid((s) => ({ ...s, [m.id]: true }))}
          />
        ))}
      </ol>

      <footer className="portal-foot tiny muted">
        Payments are processed by PayPal. {props.freelancer} never sees your card or bank details.
      </footer>
    </div>
  );
}

function MilestoneBlock({
  m,
  index,
  fmt,
  token,
  mode,
  clientId,
  currency,
  isNext,
  justPaid,
  onPaid,
}: Props & { m: PortalMilestone; index: number; fmt: (n: number) => string; isNext: boolean; justPaid: boolean; onPaid: () => void }) {
  const router = useRouter();
  const [revealed, setRevealed] = useState(m.paid);
  const unlocked = m.paid || justPaid;

  useEffect(() => {
    if (!justPaid) return;
    const t = setTimeout(() => {
      setRevealed(true);
      router.refresh();
    }, 1050);
    return () => clearTimeout(t);
  }, [justPaid, router]);

  const due = new Date(m.dueDate + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric" });

  return (
    <li className={`pm${unlocked ? " pm-paid" : ""}`}>
      <div className="pm-head">
        <span className="pm-n" aria-hidden>{index + 1}</span>
        <div>
          <h2>{m.title}</h2>
          <p className="small muted">{m.description || m.deliverables.join(", ")}</p>
        </div>
      </div>

      {m.files.length > 0 ? (
        <ul className="pm-files">
          {m.files.map((f) => (
            <li key={f.id} className="pm-file">
              <div className="pm-frame">
                {f.hasPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/files/${f.id}?t=${token}&variant=${revealed ? "full" : "preview"}`}
                    alt={revealed ? f.name : `${f.name}, sealed preview`}
                    className={revealed ? "pm-img pm-img-full" : "pm-img"}
                  />
                ) : (
                  <span className="pm-generic">{f.name.split(".").pop()?.toUpperCase()}</span>
                )}
                {!revealed && (
                  <span className="pm-seal">
                    <Seal size={72} broken={justPaid} />
                  </span>
                )}
              </div>
              <div className="pm-file-meta">
                <span className="pm-file-name">{f.name}</span>
                {revealed ? (
                  <a className="pm-dl" href={`/api/files/${f.id}?t=${token}&variant=full&download=1`}>Download</a>
                ) : (
                  <span className="tiny muted">Sealed</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="small muted pm-wait">
          {unlocked ? "Paid. Files will appear here as soon as they’re ready." : `In progress. Expected by ${due}.`}
        </p>
      )}

      <div className="pm-pay">
        <div className="pm-price">
          <span className="pm-amount">{fmt(m.amount)}</span>
          <span className="tiny muted">{unlocked ? "Paid, thank you" : m.refunded ? "Refunded" : `Due ${due}`}</span>
        </div>
        {!unlocked && !m.refunded && (
          <PayButton token={token} milestoneId={m.id} mode={mode} clientId={clientId} currency={currency} label={m.files.length ? `Pay ${fmt(m.amount)} and unlock` : `Pay ${fmt(m.amount)} in advance`} emphasis={isNext} onPaid={onPaid} />
        )}
        {unlocked && <span className="status status-paid">Unlocked</span>}
      </div>
    </li>
  );
}

function PayButton({
  token,
  milestoneId,
  mode,
  clientId,
  currency,
  label,
  emphasis,
  onPaid,
}: {
  token: string;
  milestoneId: string;
  mode: "sandbox" | "simulation";
  clientId: string;
  currency: string;
  label: string;
  emphasis: boolean;
  onPaid: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function createOrder() {
    const res = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, milestoneId }) });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Couldn't start the payment");
    return json.id as string;
  }
  async function capture(orderId: string) {
    const res = await fetch("/api/checkout/capture", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, orderId }) });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Payment didn't complete");
    onPaid();
  }

  useEffect(() => {
    if (mode !== "sandbox" || !box.current) return;
    let cancelled = false;
    const el = box.current;
    loadPayPal(clientId, currency)
      .then(() => {
        if (cancelled || !window.paypal) return;
        el.innerHTML = "";
        return window.paypal
          .Buttons({
            style: { layout: "horizontal", color: "gold", shape: "rect", label: "pay", height: 44, tagline: false },
            createOrder: async () => {
              setError("");
              return createOrder();
            },
            onApprove: async (data: { orderID: string }) => {
              try {
                await capture(data.orderID);
              } catch (e) {
                setError((e as Error).message);
              }
            },
            onError: () => setError("PayPal ran into a problem. Nothing was charged. Please try again."),
          })
          .render(el);
      })
      .catch((e: Error) => setError(e.message));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, clientId, currency, milestoneId]);

  if (mode === "sandbox") {
    return (
      <div className="pm-paypal">
        <div ref={box} className="pm-paypal-box" />
        {error && <p className="error small" role="alert">{error}</p>}
      </div>
    );
  }
  return (
    <div className="pm-paypal">
      <button
        type="button"
        className={`btn ${emphasis ? "btn-wax" : "btn-ghost"} pm-sim`}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const id = await createOrder();
            await capture(id);
          } catch (e) {
            setError((e as Error).message);
            setBusy(false);
          }
        }}
      >
        {busy ? "Confirming with PayPal…" : label}
      </button>
      {error && <p className="error small" role="alert">{error}</p>}
    </div>
  );
}
