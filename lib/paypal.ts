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
  if (!res.ok) throw new PayPalError(`PayPal ${init.method || "GET"} ${path} failed (${res.status})`, text);
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

export interface CaptureResult {
  orderId: string;
  status: string;
  captureId: string | null;
  amount: number;
  currency: string;
  customId: string | null;
  payerEmail: string | null;
}

/** Simulated orders live in memory for the lifetime of the server process. */
const g = globalThis as unknown as { __sealedSimOrders?: Map<string, OrderInput & { status: string }> };
const simOrders = (g.__sealedSimOrders ??= new Map());

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
      intent: "CAPTURE",
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
            brand_name: "Sealed AI",
            user_action: "PAY_NOW",
            shipping_preference: "NO_SHIPPING",
          },
        },
      },
    }),
  });
  return { id: order.id };
}

export async function captureOrder(orderId: string): Promise<CaptureResult> {
  if (paypalMode === "simulation") {
    const o = simOrders.get(orderId);
    if (!o) throw new PayPalError("Unknown order " + orderId);
    o.status = "COMPLETED";
    return {
      orderId,
      status: "COMPLETED",
      captureId: "SIMCAP-" + id().toUpperCase(),
      amount: o.amount,
      currency: o.currency,
      customId: `${o.projectId}:${o.milestoneId}`,
      payerEmail: "client@sandbox.example",
    };
  }
  type Raw = {
    id: string;
    status: string;
    payer?: { email_address?: string };
    purchase_units: {
      custom_id?: string;
      payments?: { captures?: { id: string; status: string; amount: { value: string; currency_code: string }; custom_id?: string }[] };
    }[];
  };
  const raw = await call<Raw>(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: "POST",
    idempotencyKey: `capture-${orderId}`,
  });
  const capture = raw.purchase_units[0]?.payments?.captures?.[0];
  return {
    orderId: raw.id,
    status: capture?.status || raw.status,
    captureId: capture?.id || null,
    amount: capture ? Number(capture.amount.value) : 0,
    currency: capture?.amount.currency_code || "",
    customId: capture?.custom_id || raw.purchase_units[0]?.custom_id || null,
    payerEmail: raw.payer?.email_address || null,
  };
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
}

/** Creates a draft invoice and sends it. Returns the PayPal invoice id. */
export async function createAndSendInvoice(input: InvoiceInput): Promise<{ invoiceId: string; status: string }> {
  if (paypalMode === "simulation") return { invoiceId: "INV2-SIM-" + id().toUpperCase(), status: "SENT" };
  const draft = await call<{ id?: string; href?: string }>("/v2/invoicing/invoices", {
    method: "POST",
    body: JSON.stringify({
      detail: {
        currency_code: input.currency,
        reference: input.reference.slice(0, 120),
        note: input.note.slice(0, 4000),
        payment_term: { due_date: input.dueDate },
      },
      invoicer: { name: { given_name: config.freelancerName } },
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
