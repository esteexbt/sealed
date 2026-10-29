import { modelLabel } from "@/lib/ai";
import { NewProject } from "./NewProject";

export default function NewPage() {
  return <NewProject modelLabel={modelLabel} />;
}
