import { pageUser, publicUser } from "@/lib/auth";
import { listProjects } from "@/lib/db";
import { providers } from "@/lib/oauth";
import { ProfileForm } from "./ProfileForm";

export const metadata = { title: "Profile | Sealed" };

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ linked?: string; error?: string }> }) {
  const user = await pageUser();
  const { linked, error } = await searchParams;
  return (
    <ProfileForm
      user={publicUser(user)}
      projects={listProjects(user.id).length}
      google={providers.google}
      paypal={providers.paypal}
      notice={linked ? `${linked === "google" ? "Google" : "PayPal"} is now linked to your account.` : ""}
      initialError={error || ""}
    />
  );
}
