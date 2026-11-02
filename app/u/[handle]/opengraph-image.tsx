import fs from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";
import { FILES_DIR } from "@/lib/db";
import { profileStats, userByHandle } from "@/lib/profile";
import { MARK } from "@/components/brandPaths";

export const alt = "Freelancer profile on Sealed";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

const font = (f: string) => fs.readFileSync(path.join(/*turbopackIgnore: true*/ process.cwd(), "assets/fonts", f));
const dataUrl = (key?: string | null) => {
  if (!key) return null;
  try {
    return `data:image/jpeg;base64,${fs.readFileSync(path.join(/*turbopackIgnore: true*/ FILES_DIR, path.basename(key))).toString("base64")}`;
  } catch {
    return null;
  }
};
const markSvg = (body: string, dot: string) =>
  `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MARK.w} ${MARK.h}"><path fill="${body}" fill-rule="evenodd" d="${MARK.body}"/><path fill="${dot}" d="${MARK.dot}"/></svg>`).toString("base64")}`;

const STAR = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#F5B72A" d="M12 3.2l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 17l-5.4 3 1.1-6.1-4.5-4.3 6.1-.8L12 3.2Z"/></svg>').toString("base64")}`;

/** The link preview for a profile: banner, photo, name, headline and Sealed's verified numbers. */
export default async function Image({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const u = userByHandle(handle);
  const name = u?.name || "Sealed";
  const s = u ? profileStats(u.id) : null;
  const banner = dataUrl(u?.bannerKey);
  const avatar = dataUrl(u?.avatarKey);
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  const facts = s
    ? [s.rating !== null ? `${s.rating.toFixed(1)} from ${s.reviews.length} verified review${s.reviews.length === 1 ? "" : "s"}` : null, `${s.stagesPaid} stage${s.stagesPaid === 1 ? "" : "s"} paid via PayPal`, s.onTime !== null ? `${s.onTime}% on time` : null].filter(Boolean)
    : [];

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#F4F5F9", fontFamily: "Public Sans" }}>
        <div style={{ height: 250, width: "100%", display: "flex", backgroundColor: "#12172E", backgroundImage: "radial-gradient(circle at 85% 20%, rgba(169,165,255,0.35), transparent 45%), radial-gradient(circle at 10% 90%, rgba(76,68,224,0.45), transparent 50%)", position: "relative" }}>
          {banner ? <img src={banner} width={1200} height={250} style={{ objectFit: "cover" }} /> : null}
        </div>
        <div style={{ display: "flex", padding: "0 64px", marginTop: -90 }}>
          <div style={{ width: 180, height: 180, borderRadius: 999, background: "#12172E", border: "8px solid #F4F5F9", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", color: "#fff", fontSize: 64, fontWeight: 700 }}>
            {avatar ? <img src={avatar} width={164} height={164} style={{ objectFit: "cover" }} /> : initials}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", padding: "18px 64px 0", gap: 10 }}>
          <div style={{ fontFamily: "Young Serif", fontSize: 64, color: "#12172E", lineHeight: 1.05 }}>{name}</div>
          {u?.headline ? <div style={{ fontSize: 30, color: "#3A4157" }}>{u.headline}</div> : null}
          <div style={{ display: "flex", gap: 14, marginTop: 8 }}>
            {facts.map((f, i) => (
              <div key={f} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 22, fontWeight: 700, color: "#0F7A55", background: "#E3F3EC", padding: "8px 16px", borderRadius: 999 }}>
                {i === 0 && s?.rating !== null ? <img src={STAR} width={22} height={22} /> : null}
                {f}
              </div>
            ))}
          </div>
        </div>
        <div style={{ position: "absolute", right: 64, bottom: 44, display: "flex", alignItems: "center", gap: 12 }}>
          <img src={markSvg("#12172E", "#4C44E0")} width={38} height={Math.round((38 * MARK.h) / MARK.w)} />
          <div style={{ fontSize: 34, fontWeight: 700, color: "#12172E", letterSpacing: -1 }}>Sealed</div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Public Sans", data: font("PublicSans-Regular.ttf"), weight: 400, style: "normal" },
        { name: "Public Sans", data: font("PublicSans-Bold.ttf"), weight: 700, style: "normal" },
        { name: "Young Serif", data: font("YoungSerif-Regular.ttf"), weight: 400, style: "normal" },
      ],
    },
  );
}
