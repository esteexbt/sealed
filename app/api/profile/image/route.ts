import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { NextResponse } from "next/server";
import { publicUser, requireUser } from "@/lib/auth";
import { FILES_DIR, id, mutate } from "@/lib/db";

const SIZES = { avatar: { width: 512, height: 512 }, banner: { width: 1500, height: 500 } } as const;
const MAX = 8 * 1024 * 1024;

/** Upload a profile photo or banner: POST multipart with "file", ?kind=avatar|banner. DELETE removes it. */
export async function POST(req: Request) {
  const { user, denied } = await requireUser();
  if (denied) return denied;
  const kind = new URL(req.url).searchParams.get("kind");
  if (kind !== "avatar" && kind !== "banner") return NextResponse.json({ error: "Unknown image." }, { status: 400 });
  const file = (await req.formData()).get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose an image first." }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: "That image is over 8 MB. Try a smaller one." }, { status: 413 });
  let out: Buffer;
  try {
    // Re-encoding strips metadata (including location) and anything that isn't a plain picture.
    out = await sharp(Buffer.from(await file.arrayBuffer()), { animated: false })
      .rotate()
      .resize({ ...SIZES[kind], fit: "cover", position: "attention" })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 86, mozjpeg: true })
      .toBuffer();
  } catch {
    return NextResponse.json({ error: "That file isn’t an image we can use. Try a JPG or PNG." }, { status: 415 });
  }
  const key = `${kind}-${user.id}-${id()}.jpg`;
  fs.mkdirSync(FILES_DIR, { recursive: true });
  fs.writeFileSync(path.join(/*turbopackIgnore: true*/ FILES_DIR, key), out);
  const old = kind === "avatar" ? user.avatarKey : user.bannerKey;
  const u = await mutate((s) => {
    const x = s.users!.find((y) => y.id === user.id)!;
    if (kind === "avatar") x.avatarKey = key;
    else x.bannerKey = key;
    x.imageVersion = (x.imageVersion || 0) + 1;
    return x;
  });
  if (old) fs.rmSync(path.join(/*turbopackIgnore: true*/ FILES_DIR, path.basename(old)), { force: true });
  return NextResponse.json({ user: publicUser(u) });
}

export async function DELETE(req: Request) {
  const { user, denied } = await requireUser();
  if (denied) return denied;
  const kind = new URL(req.url).searchParams.get("kind");
  if (kind !== "avatar" && kind !== "banner") return NextResponse.json({ error: "Unknown image." }, { status: 400 });
  const old = kind === "avatar" ? user.avatarKey : user.bannerKey;
  const u = await mutate((s) => {
    const x = s.users!.find((y) => y.id === user.id)!;
    if (kind === "avatar") x.avatarKey = null;
    else x.bannerKey = null;
    x.imageVersion = (x.imageVersion || 0) + 1;
    return x;
  });
  if (old) fs.rmSync(path.join(/*turbopackIgnore: true*/ FILES_DIR, path.basename(old)), { force: true });
  return NextResponse.json({ user: publicUser(u) });
}
