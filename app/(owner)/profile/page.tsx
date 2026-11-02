import { ensureHandle, pageUser, publicUser } from "@/lib/auth";
import { config } from "@/lib/config";
import { listProjects } from "@/lib/db";
import { SOCIALS, profileStats } from "@/lib/profile";
import { ProfileForm } from "./ProfileForm";

export const metadata = { title: "My account | Sealed" };

export default async function ProfilePage() {
  const user = await ensureHandle(await pageUser());
  const stats = profileStats(user.id);
  return (
    <ProfileForm
      user={publicUser(user)}
      projects={listProjects(user.id).length}
      rating={stats.rating}
      reviews={stats.reviews.length}
      baseUrl={`${config.appUrl}/u/`}
      socials={SOCIALS}
    />
  );
}
