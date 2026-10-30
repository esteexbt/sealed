import type { NextConfig } from "next";

const config: NextConfig = {
  serverExternalPackages: ["sharp", "@paypal/agent-toolkit", "pdfjs-dist", "@napi-rs/canvas"],
};

export default config;
