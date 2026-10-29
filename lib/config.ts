import "server-only";

export const config = {
  paypalClientId: process.env.PAYPAL_CLIENT_ID || "",
  paypalSecret: process.env.PAYPAL_CLIENT_SECRET || "",
  openaiKey: process.env.OPENAI_API_KEY || "",
  anthropicKey: process.env.ANTHROPIC_API_KEY || "",
  googleKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || "",
  groqKey: process.env.GROQ_API_KEY || "",
  appUrl: (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, ""),
  freelancerName: process.env.FREELANCER_NAME || "Ada Okafor",
  freelancerEmail: process.env.FREELANCER_EMAIL || "ada@example.com",
};

/** Real PayPal sandbox when keys exist; otherwise a faithful local simulation. */
export const paypalMode: "sandbox" | "simulation" =
  config.paypalClientId && config.paypalSecret ? "sandbox" : "simulation";

/** First configured provider wins. Groq and Gemini both have free tiers. */
export const aiMode: "anthropic" | "openai" | "groq" | "gemini" | "offline" = config.anthropicKey
  ? "anthropic"
  : config.openaiKey
    ? "openai"
    : config.groqKey
      ? "groq"
      : config.googleKey
        ? "gemini"
        : "offline";
