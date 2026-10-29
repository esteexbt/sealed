import type { NextConfig } from "next";

const config: NextConfig = {
  serverExternalPackages: ["sharp", "@paypal/agent-toolkit"],
};

export default config;
