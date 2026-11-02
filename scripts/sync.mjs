// Copies Sealed's data between this server's disk and the Supabase Storage bucket.
//   node scripts/sync.mjs pull   bring the saved data back after a restart (hosts with temporary disks)
//   node scripts/sync.mjs push   upload anything local that isn't saved yet (e.g. right after seeding the demo)
// Does nothing when SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY aren't set.
import fs from "node:fs";
import path from "node:path";

const URL_ = process.env.SUPABASE_URL?.replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.SUPABASE_BUCKET || "sealed";
const DATA = process.env.DATA_DIR || path.join(process.cwd(), "data");
const FILES = path.join(DATA, "files");
const mode = process.argv[2];

if (!URL_ || !KEY) {
  console.log("[sync] Supabase not configured, using the local disk only.");
  process.exit(0);
}
const h = { apikey: KEY, ...(KEY.startsWith("eyJ") ? { Authorization: `Bearer ${KEY}` } : {}) };
const obj = (name) => `${URL_}/storage/v1/object/${BUCKET}/${name}`;

async function ensureBucket() {
  const r = await fetch(`${URL_}/storage/v1/bucket/${BUCKET}`, { headers: h });
  if (r.ok) return;
  const c = await fetch(`${URL_}/storage/v1/bucket`, { method: "POST", headers: { ...h, "Content-Type": "application/json" }, body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }) });
  if (!c.ok) throw new Error(`Couldn't create bucket "${BUCKET}": ${c.status} ${await c.text()}`);
  console.log(`[sync] Created private bucket "${BUCKET}".`);
}

async function listFiles() {
  const names = [];
  for (let offset = 0; ; offset += 1000) {
    const r = await fetch(`${URL_}/storage/v1/object/list/${BUCKET}`, { method: "POST", headers: { ...h, "Content-Type": "application/json" }, body: JSON.stringify({ prefix: "files", limit: 1000, offset }) });
    if (!r.ok) throw new Error(`list failed: ${r.status} ${await r.text()}`);
    const page = await r.json();
    names.push(...page.filter((x) => x.id).map((x) => x.name));
    if (page.length < 1000) return names;
  }
}

async function get(name) {
  const r = await fetch(obj(name), { headers: h });
  if (r.status === 404 || r.status === 400) return null;
  if (!r.ok) throw new Error(`download ${name} failed: ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

async function put(name, buf, type) {
  const r = await fetch(obj(name), { method: "POST", headers: { ...h, "Content-Type": type, "x-upsert": "true" }, body: buf });
  if (!r.ok) throw new Error(`upload ${name} failed: ${r.status} ${await r.text()}`);
}

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await fn(items[i++]); }));
}

await ensureBucket();
fs.mkdirSync(FILES, { recursive: true });

if (mode === "pull") {
  const store = await get("store.json");
  if (!store) {
    console.log("[sync] Nothing saved yet.");
    process.exit(0);
  }
  fs.writeFileSync(path.join(DATA, "store.json"), store);
  const names = await listFiles();
  const missing = names.filter((n) => !fs.existsSync(path.join(FILES, n)));
  await pool(missing, 6, async (n) => {
    const b = await get(`files/${n}`);
    if (b) fs.writeFileSync(path.join(FILES, n), b);
  });
  console.log(`[sync] Restored the store and ${missing.length} file(s).`);
} else if (mode === "push") {
  const remote = new Set(await listFiles());
  const local = fs.readdirSync(FILES).filter((n) => !remote.has(n));
  await pool(local, 6, (n) => put(`files/${n}`, fs.readFileSync(path.join(FILES, n)), "application/octet-stream"));
  const storeFile = path.join(DATA, "store.json");
  if (fs.existsSync(storeFile) && !(await get("store.json"))) await put("store.json", fs.readFileSync(storeFile), "application/json");
  console.log(`[sync] Uploaded ${local.length} file(s).`);
} else {
  console.log("Usage: node scripts/sync.mjs pull|push");
  process.exit(1);
}
