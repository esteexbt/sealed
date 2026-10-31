import { redirect } from "next/navigation";
import { currentUser, users } from "@/lib/auth";
import { providers } from "@/lib/oauth";
import { AuthForm } from "./AuthForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in | Sealed" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; mode?: string }> }) {
  if (await currentUser()) redirect("/");
  const { error, mode } = await searchParams;
  const demo = !/^(off|false|0|no)$/i.test(process.env.DEMO_LOGIN || "") && users().some((u) => u.demo);
  return <AuthForm google={providers.google} paypal={providers.paypal} demo={demo} initialError={error || ""} initialMode={mode === "signup" ? "signup" : "signin"} />;
}
