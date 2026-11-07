import "server-only";
import { config, paypalMode } from "./config";
import { id } from "./db";

const BASE = "https://api-m.sandbox.paypal.com";

let cached: { token: string; expires: number } | null = null;

async function accessToken() {
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization:
        "Basic " + Buffer.from(`${config.paypalClientId}:${config.paypalSecret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new PayPalError(`PayPal auth failed (${res.status})`, await res.text());
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: json.access_token, expires: Date.now() + json.expires_in * 1000 };
  return cached.token;
}

export class PayPalError extends Error {
  constructor(
    message: string,
    public detail?: string,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit & { idempotencyKey?: string } = {}): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${await accessToken()}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  if (init.idempotencyKey) headers["PayPal-Request-Id"] = init.idempotencyKey;
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { ...headers, ...(init.headers as object) } });
  const text = await res.text();
  if (!res.ok) {
    // Keep PayPal's own explanation (name, message, debug id) in the server logs for troubleshooting.
    console.error(`[paypal] ${init.method || "GET"} ${path} ${res.status}`, text.slice(0, 2000), res.headers.get("paypal-debug-id") || "");
    throw new PayPalError(`PayPal ${init.method || "GET"} ${path} failed (${res.status})`, text);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

/* ----------------------------- Orders v2 ----------------------------- */

export interface OrderInput {
  projectId: string;
  milestoneId: string;
  description: string;
  amount: number;
  currency: string;
}

export interface AuthorizeResult {
  orderId: string;
  status: string;
  authorizationId: string | null;
  amount: number;
  currency: string;
  customId: string | null;
  payerEmail: string | null;
  expiresAt: string | null;
}

/** Simulated orders and holds live in memory for the lifetime of the server process. */
type SimOrder = OrderInput & { status: string };
type SimAuth = { status: "CREATED" | "CAPTURED" | "VOIDED"; amount: number; currency: string };
const g = globalThis as unknown as { __sealedSimOrders?: Map<string, SimOrder>; __sealedSimAuths?: Map<string, SimAuth> };
const simOrders = (g.__sealedSimOrders ??= new Map());
const simAuths = (g.__sealedSimAuths ??= new Map());

/**
 * intent AUTHORIZE: when the client approves, PayPal reserves the money on
 * their account but does not move it. Sealed captures it only when the
 * client approves the work (or the review window ends), and voids it if the
 * milestone is cancelled.
 */
export async function createOrder(input: OrderInput): Promise<{ id: string }> {
  if (paypalMode === "simulation") {
    const orderId = "SIM-" + id().toUpperCase();
    simOrders.set(orderId, { ...input, status: "CREATED" });
    return { id: orderId };
  }
  const order = await call<{ id: string }>("/v2/checkout/orders", {
    method: "POST",
    idempotencyKey: `order-${input.milestoneId}-${Date.now()}`,
    body: JSON.stringify({
      intent: "AUTHORIZE",
      purchase_units: [
        {
          reference_id: input.milestoneId,
          custom_id: `${input.projectId}:${input.milestoneId}`,
          description: input.description.slice(0, 127),
          amount: { currency_code: input.currency, value: input.amount.toFixed(2) },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: "Sealed",
            user_action: "PAY_NOW",
            shipping_preference: "NO_SHIPPING",
          },
        },
      },
    }),
  });
  return { id: order.id };
}

/** Turns the client's approval into a hold on their funds. */
export async function authorizeOrder(orderId: string): Promise<AuthorizeResult> {
  if (paypalMode === "simulation") {
    const o = simOrders.get(orderId);
    if (!o) throw new PayPalError("Unknown order " + orderId);
    o.status = "COMPLETED";
    const authorizationId = "SIMAUTH-" + id().toUpperCase();
    simAuths.set(authorizationId, { status: "CREATED", amount: o.amount, currency: o.currency });
    return {
      orderId,
      status: "CREATED",
      authorizationId,
      amount: o.amount,
      currency: o.currency,
      customId: `${o.projectId}:${o.milestoneId}`,
      payerEmail: "client@sandbox.example",
      expiresAt: new Date(Date.now() + 29 * 86400000).toISOString(),
    };
  }
  type Raw = {
    id: string;
    status: string;
    payer?: { email_address?: string };
    purchase_units: {
      custom_id?: string;
      payments?: {
        authorizations?: { id: string; status: string; amount: { value: string; currency_code: string }; custom_id?: string; expiration_time?: string }[];
      };
    }[];
  };
  const raw = await call<Raw>(`/v2/checkout/orders/${encodeURIComponent(orderId)}/authorize`, {
    method: "POST",
    idempotencyKey: `authorize-${orderId}`,
  });
  const auth = raw.purchase_units[0]?.payments?.authorizations?.[0];
  return {
    orderId: raw.id,
    status: auth?.status || raw.status,
    authorizationId: auth?.id || null,
    amount: auth ? Number(auth.amount.value) : 0,
    currency: auth?.amount.currency_code || "",
    customId: auth?.custom_id || raw.purchase_units[0]?.custom_id || null,
    payerEmail: raw.payer?.email_address || null,
    expiresAt: auth?.expiration_time || null,
  };
}

/** Moves held money to the freelancer. Idempotent per authorization. */
export async function captureAuthorization(authorizationId: string, amount: number, currency: string): Promise<{ captureId: string; status: string; net: number | null }> {
  if (paypalMode === "simulation") {
    const a = simAuths.get(authorizationId);
    // Holds made before a server restart aren't in memory; treat them as valid in simulation.
    if (a && a.status === "VOIDED") throw new PayPalError("This hold was cancelled");
    if (a) a.status = "CAPTURED";
    return { captureId: "SIMCAP-" + id().toUpperCase(), status: "COMPLETED", net: null };
  }
  const cap = await call<{ id: string; status: string; seller_receivable_breakdown?: { net_amount?: { value: string } } }>(`/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/capture`, {
    method: "POST",
    idempotencyKey: `capture-${authorizationId}`,
    body: JSON.stringify({ amount: { value: amount.toFixed(2), currency_code: currency }, final_capture: true }),
  });
  const net = Number(cap.seller_receivable_breakdown?.net_amount?.value);
  return { captureId: cap.id, status: cap.status, net: Number.isFinite(net) && net > 0 ? net : null };
}

/* ----------------------------- Payouts ----------------------------- */

export interface PayoutInput {
  /** One payout per stage: PayPal refuses a second batch with the same id, so it can't pay twice. */
  ref: string;
  email: string;
  amount: number;
  currency: string;
  note: string;
}

/** Sends the freelancer their money from Sealed's PayPal balance to their own PayPal email. */
export async function createPayout(input: PayoutInput): Promise<{ batchId: string; status: string }> {
  if (paypalMode === "simulation") return { batchId: "SIMPAYOUT-" + id().toUpperCase(), status: "SUCCESS" };
  const res = await call<{ batch_header: { payout_batch_id: string; batch_status: string } }>("/v1/payments/payouts", {
    method: "POST",
    body: JSON.stringify({
      sender_batch_header: { sender_batch_id: input.ref, email_subject: "You've been paid through Sealed", email_message: input.note },
      items: [{ recipient_type: "EMAIL", receiver: input.email, amount: { value: input.amount.toFixed(2), currency: input.currency }, note: input.note, sender_item_id: input.ref }],
    }),
  });
  return { batchId: res.batch_header.payout_batch_id, status: res.batch_header.batch_status };
}

/** The status of the (single) item in a payout batch: SUCCESS, PENDING, UNCLAIMED, FAILED, ... */
export async function getPayoutStatus(batchId: string): Promise<string> {
  if (paypalMode === "simulation" || batchId.startsWith("SIMPAYOUT-")) return "SUCCESS";
  const res = await call<{ batch_header: { batch_status: string }; items?: { transaction_status?: string }[] }>(`/v1/payments/payouts/${encodeURIComponent(batchId)}`);
  return res.items?.[0]?.transaction_status || res.batch_header.batch_status;
}

/** Turns PayPal's payout errors into something a freelancer can act on. */
export function payoutError(e: unknown) {
  const detail = e instanceof PayPalError ? e.detail || "" : "";
  if (/AUTHORIZATION_ERROR|NOT_AUTHORIZED|PERMISSION/i.test(detail)) return "Payouts isn't switched on for Sealed's PayPal app yet.";
  if (/INSUFFICIENT_FUNDS/i.test(detail)) return "Sealed's PayPal balance can't cover this payout yet. It will be retried.";
  if (/DUPLICATE|SENDER_BATCH_ID/i.test(detail)) return "This payout was already sent.";
  if (/RECEIVER|EMAIL/i.test(detail)) return "PayPal didn't accept that email address.";
  return (e as Error).message || "PayPal couldn't send the payout.";
}

/** Cancels a hold. The client's money was never moved, so nothing needs refunding. */
export async function voidAuthorization(authorizationId: string): Promise<void> {
  if (paypalMode === "simulation") {
    const a = simAuths.get(authorizationId);
    if (a?.status === "CAPTURED") throw new PayPalError("This hold was already released to the freelancer");
    if (a) a.status = "VOIDED";
    return;
  }
  await call(`/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/void`, {
    method: "POST",
    idempotencyKey: `void-${authorizationId}`,
  });
}

export async function refundCapture(captureId: string, amount: number, currency: string) {
  if (paypalMode === "simulation") return { id: "SIMREF-" + id().toUpperCase(), status: "COMPLETED" };
  return call<{ id: string; status: string }>(`/v2/payments/captures/${encodeURIComponent(captureId)}/refund`, {
    method: "POST",
    idempotencyKey: `refund-${captureId}`,
    body: JSON.stringify({ amount: { value: amount.toFixed(2), currency_code: currency } }),
  });
}

/* ---------------------------- Invoicing v2 ---------------------------- */

export interface InvoiceInput {
  clientName: string;
  clientEmail: string;
  itemName: string;
  amount: number;
  currency: string;
  dueDate: string;
  note: string;
  reference: string;
  /** The freelancer's name, shown as the invoice sender. */
  invoicerName: string;
}

/** Creates a draft invoice and sends it. Returns the PayPal invoice id. */
export async function createAndSendInvoice(input: InvoiceInput): Promise<{ invoiceId: string; status: string }> {
  if (paypalMode === "simulation") return { invoiceId: "INV2-SIM-" + id().toUpperCase(), status: "SENT" };
  try {
    return await sendInvoice(input);
  } catch (e) {
    const status = Number((e as Error).message.match(/\((\d{3})\)/)?.[1]);
    if (status === 401 || status === 403) throw new PayPalError("PayPal isn't letting Sealed send invoices yet, so the reminder wasn't sent. Try again later.", (e as PayPalError).detail);
    if (status >= 400 && status < 500) throw new PayPalError("PayPal couldn't create this invoice. Check the client's email address and try again.", (e as PayPalError).detail);
    throw new PayPalError("PayPal didn't respond, so the reminder wasn't sent. Try again in a moment.", (e as PayPalError).detail);
  }
}

async function sendInvoice(input: InvoiceInput): Promise<{ invoiceId: string; status: string }> {
  const draft = await call<{ id?: string; href?: string }>("/v2/invoicing/invoices", {
    method: "POST",
    body: JSON.stringify({
      detail: {
        currency_code: input.currency,
        reference: input.reference.slice(0, 120),
        note: input.note.slice(0, 4000),
        payment_term: { due_date: input.dueDate },
      },
      invoicer: { name: { given_name: input.invoicerName } },
      primary_recipients: [
        { billing_info: { name: { full_name: input.clientName }, email_address: input.clientEmail } },
      ],
      items: [
        {
          name: input.itemName.slice(0, 200),
          quantity: "1",
          unit_amount: { currency_code: input.currency, value: input.amount.toFixed(2) },
          unit_of_measure: "AMOUNT",
        },
      ],
    }),
  });
  const invoiceId = draft.id || draft.href?.split("/").pop() || "";
  if (!invoiceId) throw new PayPalError("PayPal did not return an invoice id");
  await call(`/v2/invoicing/invoices/${invoiceId}/send`, {
    method: "POST",
    body: JSON.stringify({ send_to_invoicer: false, send_to_recipient: true }),
  });
  return { invoiceId, status: "SENT" };
}

export async function getInvoiceStatus(invoiceId: string): Promise<string> {
  if (paypalMode === "simulation") return "SENT";
  const inv = await call<{ status: string }>(`/v2/invoicing/invoices/${invoiceId}`);
  return inv.status;
}
