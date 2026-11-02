import "server-only";
import fs from "node:fs";
import path from "node:path";

/**
 * Off-server copy of everything Sealed saves, in a Supabase Storage bucket.
 * The server keeps working from its local disk; each change is also copied here,
 * and scripts/sync.mjs brings it all back when a host with a temporary disk restarts.
 * Does nothing unless SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.
 */
const URL_ = process.env.SUPABASE_URL?.replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.SUPABASE_BUCKET || "sealed";
export const backupOn = Boolean(URL_ && KEY);

// Newer Supabase secret keys (sb_secret_…) go in the apikey header only; older service_role keys are JWTs and also go as a Bearer token.
const headers = (): Record<string, string> => ({ apikey: KEY!, ...(KEY!.startsWith("eyJ") ? { Authorization: `Bearer ${KEY}` } : {}) });
const objectUrl = (name: string) => `${URL_}/storage/v1/object/${BUCKET}/${name.split("/").map(encodeURIComponent).join("/")}`;

// One upload at a time, in order, so a newer copy is never overwritten by an older one.
let queue: Promise<unknown> = Promise.resolve();
function enqueue(job: () => Promise<void>) {
  queue = queue.then(job).catch((e) => console.error("[backup]", (e as Error).message));
  return queue;
}

async function put(name: string, body: Buffer, type: string) {
  const res = await fetch(objectUrl(name), { method: "POST", headers: { ...headers(), "Content-Type": type, "x-upsert": "true" }, body: new Uint8Array(body) });
  if (!res.ok) throw new Error(`upload ${name} failed: ${res.status} ${await res.text().catch(() => "")}`);
}

/** Copy the store. Rapid changes collapse into one upload of the latest version. */
let storePending = false;
export function backupStore(file: string) {
  if (!backupOn || storePending) return;
  storePending = true;
  enqueue(async () => {
    storePending = false;
    await put("store.json", fs.readFileSync(file), "application/json");
  });
}

/** Copy one saved file (deliverable, preview, profile image) by its key in the files folder. */
export function backupFile(filesDir: string, key: string) {
  if (!backupOn) return;
  const name = path.basename(key);
  enqueue(async () => {
    const p = path.join(/*turbopackIgnore: true*/ filesDir, name);
    if (fs.existsSync(p)) await put(`files/${name}`, fs.readFileSync(p), "application/octet-stream");
  });
}

export function removeBackup(key: string) {
  if (!backupOn) return;
  const name = path.basename(key);
  enqueue(async () => {
    await fetch(`${URL_}/storage/v1/object/${BUCKET}`, { method: "DELETE", headers: { ...headers(), "Content-Type": "application/json" }, body: JSON.stringify({ prefixes: [`files/${name}`] }) });
  });
}
