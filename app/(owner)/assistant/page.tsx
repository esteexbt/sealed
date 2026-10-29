import { modelLabel } from "@/lib/ai";
import { paypalMode } from "@/lib/config";
import { Assistant } from "./Assistant";

export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return <Assistant initial={q || ""} modelLabel={modelLabel} paypalMode={paypalMode} />;
}
