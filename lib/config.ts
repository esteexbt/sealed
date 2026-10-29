import "server-only";

export const config = {
  paypalClientId: process.env.PAYPAL_CLIENT_ID || "",
  paypalSecret: process.env.PAYPAL_CLIENT_SECRET || "",
  openaiKey: process.env.OPENAI_API_KEY || "",
  anthropicKey: process.env.ANTHROPIC_API_KEY || "",
  appUrl: (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, ""),
  freelancerName: process.env.FREELANCER_NAME || "Ada Okafor",
  freelancerEmail: process.env.FREELANCER_EMAIL || "ada@example.com",
};

/** Real PayPal sandbox when keys exist; otherwise a faithful local simulation. */
export const paypalMode: "sandbox" | "simulation" =
  config.paypalClientId && config.paypalSecret ? "sandbox" : "simulation";

export const aiMode: "openai" | "anthropic" | "offline" = config.anthropicKey
  ? "anthropic"
  : config.openaiKey
    ? "openai"
    : "offline";
