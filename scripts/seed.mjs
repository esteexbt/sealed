// Seeds a realistic demo workspace: three clients, sealed deliverables, one overdue payment.
// Usage: npm run seed   (wipes data/ first)
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";

const DATA = process.env.DATA_DIR || path.join(process.cwd(), "data");
const FILES = path.join(DATA, "files");
if (process.argv.includes("--if-empty") && fs.existsSync(path.join(DATA, "store.json"))) {
  const existing = JSON.parse(fs.readFileSync(path.join(DATA, "store.json"), "utf8"));
  if (existing.projects?.length) {
    console.log("Data already present, skipping seed.");
    process.exit(0);
  }
}
fs.rmSync(DATA, { recursive: true, force: true });
fs.mkdirSync(FILES, { recursive: true });

const rid = (n = 10) => crypto.randomBytes(16).toString("base64url").replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, n);
const tok = () => crypto.randomBytes(18).toString("base64url").replace(/[-_]/g, "x");
const day = (offset) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString();

function watermark(w, h) {
  const t = [];
  for (let y = -h; y < h * 2; y += 190) for (let x = -w; x < w * 2; x += 620) t.push(`<text x="${x}" y="${y}" transform="rotate(-28 ${x} ${y})">Sealed until paid</text>`);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><style>text{font:700 46px sans-serif;fill:#fff;fill-opacity:.7;stroke:#1A2238;stroke-opacity:.45;stroke-width:1.5}</style>${t.join("")}</svg>`);
}

async function art(name, svg) {
  const fid = rid();
  const originalKey = `${fid}-orig.png`;
  const previewKey = `${fid}-preview.jpg`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  fs.writeFileSync(path.join(FILES, originalKey), png);
  const meta = await sharp(png).metadata();
  const sha256 = crypto.createHash("sha256").update(png).digest("hex");
  const { data, info } = await sharp(png).resize({ width: 1100, fit: "inside" }).blur(9).toBuffer({ resolveWithObject: true });
  await sharp(data).composite([{ input: watermark(info.width, info.height) }]).jpeg({ quality: 62 }).toFile(path.join(FILES, previewKey));
  return { id: fid, name, mime: "image/png", size: png.length, originalKey, previewKey, uploadedAt: ago(3), sha256, width: meta.width, height: meta.height, removedAt: null };
}

// Three distinct logo routes for a coffee shop, drawn as vector art.
const W = 1200, H = 900;
const conceptA = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#F3E9DC"/>
<g transform="translate(600 380)"><circle r="190" fill="#3B2416"/><path d="M-60 -110 C 40 -60 -40 40 60 110" stroke="#F3E9DC" stroke-width="26" fill="none" stroke-linecap="round"/>
<ellipse rx="120" ry="160" fill="none" stroke="#F3E9DC" stroke-width="14"/></g>
<text x="600" y="700" text-anchor="middle" font-family="Georgia,serif" font-size="92" fill="#3B2416">Bean There</text>
<text x="600" y="770" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="30" letter-spacing="12" fill="#8C5A3C">COFFEE · YABA</text></svg>`;
const conceptB = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#1F4D3A"/>
<g transform="translate(600 360)" fill="none" stroke="#F2C14E" stroke-width="18" stroke-linecap="round"><path d="M-150 60 L-150 -40 Q-150 -150 0 -150 Q150 -150 150 -40 L150 60"/><path d="M-200 60 H200"/><path d="M-40 -60 q20 -30 0 -60 M40 -60 q20 -30 0 -60"/></g>
<text x="600" y="640" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-weight="700" font-size="110" fill="#F2C14E">bean there.</text>
<text x="600" y="710" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="32" fill="#CFE3D8">you’ve bean here before</text></svg>`;
const conceptC = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#FFFFFF"/>
<g transform="translate(600 400)"><rect x="-230" y="-230" width="460" height="460" rx="80" fill="#E4572E"/>
<text x="0" y="60" text-anchor="middle" font-family="Georgia,serif" font-size="230" fill="#FFF4E6">BT</text></g>
<text x="600" y="790" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="44" letter-spacing="6" fill="#2B2B2B">BEAN THERE COFFEE</text></svg>`;
const siteHome = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#FFF8F0"/>
<rect x="0" y="0" width="${W}" height="90" fill="#7A2E1F"/><text x="60" y="58" font-family="Georgia,serif" font-size="38" fill="#FFF8F0">Kemi’s Kitchen</text>
<text x="60" y="260" font-family="Georgia,serif" font-size="84" fill="#3A1A12">Home-cooked jollof,</text><text x="60" y="360" font-family="Georgia,serif" font-size="84" fill="#3A1A12">delivered hot.</text>
<rect x="60" y="430" width="300" height="80" rx="40" fill="#E2A03F"/><text x="210" y="482" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-weight="700" font-size="30" fill="#3A1A12">Order now</text>
<circle cx="900" cy="520" r="240" fill="#E2A03F"/><circle cx="900" cy="520" r="190" fill="#C8442B"/></svg>`;
const siteMenu = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#FFF8F0"/>
<text x="60" y="140" font-family="Georgia,serif" font-size="70" fill="#3A1A12">Menu</text>
${[0, 1, 2, 3].map((i) => `<rect x="${60 + (i % 2) * 560}" y="${200 + Math.floor(i / 2) * 330}" width="520" height="290" rx="24" fill="#F3E1CC"/><circle cx="${190 + (i % 2) * 560}" cy="${345 + Math.floor(i / 2) * 330}" r="90" fill="#C8442B"/><rect x="${310 + (i % 2) * 560}" y="${310 + Math.floor(i / 2) * 330}" width="220" height="24" rx="12" fill="#7A2E1F"/><rect x="${310 + (i % 2) * 560}" y="${352 + Math.floor(i / 2) * 330}" width="150" height="18" rx="9" fill="#B78A6A"/>`).join("")}</svg>`;

const filesA = [await art("logo-route-a-roastery.png", conceptA), await art("logo-route-b-modern.png", conceptB), await art("logo-route-c-monogram.png", conceptC)];
const filesK = [await art("homepage-desktop.png", siteHome), await art("menu-page.png", siteMenu)];

const ms = (title, description, deliverables, amount, dueDate, status, files = [], payment = null, reminders = []) => ({
  id: rid(), title, description, deliverables, amount, dueDate, status, files, payment, reminders,
});
const pay = (amount, h) => ({ orderId: "SIM-" + rid().toUpperCase(), captureId: "SIMCAP-" + rid().toUpperCase(), amount, currency: "USD", payerEmail: "client@sandbox.example", capturedAt: ago(h), mode: "simulation" });

const bean = {
  id: rid(), portalToken: tok(), title: "Brand identity for Bean There Coffee", clientName: "Bean There Coffee", clientEmail: "tolu@beanthere.ng", currency: "USD",
  brief: "hey!! saw your work on behance, love it. I'm opening a coffee shop in Yaba called Bean There and I need a logo + full brand kit (colours, fonts, menu template, IG templates). we launch in 3 weeks so kinda urgent lol. budget is tight, around $1,200. my email is tolu@beanthere.ng",
  summary: "A logo and launch-ready brand kit in three paid stages over three weeks, inside the $1,200 budget.",
  questions: ["Do you already have a shop sign or menu printer booked? Their specs affect the logo files.", "How many revision rounds do you expect on the logo?"],
  createdAt: ago(30),
  milestones: [
    ms("Discovery and logo concepts", "Agree the direction and present three logo routes.", ["Moodboard", "3 logo concepts"], 350, day(2), "awaiting_payment", filesA),
    ms("Logo refinement", "Develop the chosen route into a finished mark.", ["Final logo (SVG, PNG)", "Logo variations"], 400, day(10), "awaiting_payment"),
    ms("Launch brand kit", "Everything needed to open the doors with a consistent look.", ["Colour palette", "Typography", "Menu template", "6 Instagram templates"], 450, day(18), "awaiting_payment"),
  ],
};
const kemi = {
  id: rid(), portalToken: tok(), title: "Ordering website for Kemi’s Kitchen", clientName: "Kemi’s Kitchen", clientEmail: "kemi@kemiskitchen.co", currency: "USD",
  brief: "Need a simple website where people can see the menu and order on WhatsApp. 2 pages max.", summary: "A two-page ordering site with WhatsApp checkout, delivered in two stages.",
  questions: [], createdAt: ago(24 * 20),
  milestones: [
    ms("Design", "Homepage and menu designs, desktop and mobile.", ["Homepage design", "Menu page design"], 500, day(-12), "paid", [], pay(500, 24 * 11)),
    ms("Build and launch", "Live site connected to WhatsApp ordering.", ["Live website", "Handover notes"], 700, day(-4), "awaiting_payment", filesK, null, [
      { id: rid(), sentAt: ago(24 * 2), channel: "paypal_invoice", invoiceId: "INV2-SIM-" + rid().toUpperCase(), message: "Hi Kemi, a quick nudge on the build milestone. The site is ready and unlocks as soon as payment goes through." },
    ]),
  ],
};
const halo = {
  id: rid(), portalToken: tok(), title: "Launch video for Halo Fitness", clientName: "Halo Fitness", clientEmail: "studio@halofit.io", currency: "USD",
  brief: "30 second launch video for our app.", summary: "A 30-second motion launch video in two stages.", questions: [], createdAt: ago(24 * 40),
  milestones: [
    ms("Storyboard", "Lock the story and key frames.", ["Script", "Storyboard"], 300, day(-30), "paid", [], pay(300, 24 * 31)),
    ms("Final video", "Delivery-ready launch video.", ["Final MP4", "Vertical cutdowns"], 900, day(-20), "paid", [], pay(900, 24 * 19)),
  ],
};

const activity = [
  { kind: "file_uploaded", projectId: bean.id, text: "Added 3 files to Discovery and logo concepts", at: ago(3) },
  { kind: "reminder_sent", projectId: kemi.id, text: "Reminder sent to Kemi’s Kitchen for Build and launch via PayPal invoice", at: ago(48) },
  { kind: "payment_captured", projectId: kemi.id, text: "Kemi’s Kitchen paid $500 for Design. Files unlocked.", at: ago(24 * 11) },
  { kind: "payment_captured", projectId: halo.id, text: "Halo Fitness paid $900 for Final video. Files unlocked.", at: ago(24 * 19) },
].map((a) => ({ id: rid(), ...a }));

fs.writeFileSync(path.join(DATA, "store.json"), JSON.stringify({ projects: [bean, kemi, halo], activity }, null, 2));
console.log(`Seeded 3 projects. Client portal for the demo: /p/${bean.portalToken}`);
