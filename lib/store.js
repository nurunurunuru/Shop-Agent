// মাল্টি-ওয়ার্কস্পেস ডেটাবেস: প্রতিটা দোকানের (workspace) ডেটা আলাদা। কোড আগের মতোই S.D() ডাকে;
// S.D() আসলে "এই মুহূর্তে কোন দোকানের রিকোয়েস্ট চলছে" (AsyncLocalStorage) সেই দোকানের ডেটা ফেরত দেয়।
// MONGODB_URI থাকলে MongoDB-তে (registry + প্রতি দোকানে একটা ডকুমেন্ট), না থাকলে data/ ফোল্ডারে JSON ফাইল।
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');
const ALS = new AsyncLocalStorage();

const DATA = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const WS_DIR = path.join(DATA, 'ws'), REG_FILE = path.join(DATA, 'registry.json');
const LEGACY_FILES = [path.join(__dirname, '..', 'data', 'store.json'), path.join(DATA, 'store.json')];
fs.mkdirSync(WS_DIR, { recursive: true });

const RULES = `- সবসময় "আপনি" বলে সম্বোধন করবেন; ভদ্র, বিনয়ী ও পেশাদার সেলসম্যানের মতো কথা বলবেন।
- দাম বা ডেলিভারি চার্জ নিয়ে দরদাম হলে নম্রভাবে জানাবেন দাম নির্দিষ্ট; বিশেষ ছাড় চাইলে আমাদের টিমকে ডাকবেন।
- পেমেন্ট ক্যাশ অন ডেলিভারি।
- রিটার্ন, এক্সচেঞ্জ, অভিযোগ বা ড্যামেজ হলে নিজে সিদ্ধান্ত না নিয়ে টিমকে ডাকবেন।
- প্রতিটা উত্তরে গ্রাহককে পরের ধাপটা (দেখা, সাইজ বাছা, অর্ডার) সুন্দর করে জানাবেন।`;

const defaults = () => ({
  settings: {
    businessName: 'My Shop', lang: 'bn', deliveryInside: 70, deliveryOutside: 130, deliveryDays: '২-৩ দিন',
    handoverMinutes: 60, aiLive: false, followupEnabled: false, followupHours: 3, reviewLink: '',
    commentReplyEnabled: false, commentMode: 'intent', rulesLive: RULES, rulesDraft: RULES, rulesPrev: '',
    returnCharge: 0, courierChargeInside: 0, courierChargeOutside: 0,
    courierMode: '', steadfastApiKey: '', steadfastSecretKey: '', steadfastWebhookToken: '',
  },
  // কানেক্ট করা চ্যানেল (টোকেনসহ, কখনো ব্রাউজারে/ব্যাকআপে যায় না)
  channels: { pages: [], whatsapp: [] },
  users: [], sessions: {}, products: [], customers: [], conversations: [], messages: [],
  orders: [], leads: [], notifications: [], offers: [], comments: [], counters: { order: 1000, product: 0 },
});
const build = x => {
  const d = defaults();
  return { ...d, ...x, settings: { ...d.settings, ...(x.settings || {}) }, counters: { ...d.counters, ...(x.counters || {}) },
    channels: { pages: [], whatsapp: [], ...(x.channels || {}) } };
};

// ---- অবস্থা ----
let reg = { workspaces: {}, sessions: {}, emails: {}, routes: {}, legacy: '' };
const wss = new Map();
const dirtyWs = new Set(); let dirtyReg = false;
const URI = process.env.MONGODB_URI || '';
let col = null;

const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

// ---- প্রসঙ্গ (কোন দোকান) ----
const ctx = () => ALS.getStore();
function D() { const c = ALS.getStore(); if (!c) throw new Error('এই কাজটা কোনো দোকানের প্রসঙ্গের বাইরে চলছে'); return c.db; }
const wsId = () => { const c = ALS.getStore(); return c ? c.id : null; };
function run(id, fn) {
  const db = wss.get(id); if (!db) throw new Error('দোকান পাওয়া যায়নি: ' + id);
  return ALS.run({ id, db }, fn);
}
const peek = id => wss.get(id) || null;
const ids = () => [...wss.keys()];

// ---- তৈরি/রাউটিং ----
function createWorkspace(name) {
  const id = 'w' + crypto.randomBytes(6).toString('hex');
  const db = build({}); db.settings.businessName = String(name || 'My Shop').slice(0, 80);
  wss.set(id, db); dirtyWs.add(id);
  reg.workspaces[id] = { id, name: db.settings.businessName, createdAt: Date.now() };
  saveReg(); return id;
}
// route key: 'fb:<pageId>' | 'ig:<igId>' | 'wa:<phoneNumberId>'
const routeFor = key => reg.routes[key] || null;
function setRoute(key, id) { reg.routes[key] = id; saveReg(); }
function dropRoute(key) { delete reg.routes[key]; saveReg(); }
function indexUsers(id) { // ইমেইল → দোকান (লগইনের জন্য)
  const db = wss.get(id); if (!db) return;
  for (const [e, w] of Object.entries(reg.emails)) if (w === id) delete reg.emails[e];
  for (const u of db.users) if (!reg.emails[u.email] || reg.emails[u.email] === id) reg.emails[u.email] = id;
  saveReg();
}

function dropWorkspace(id) { wss.delete(id); dirtyWs.delete(id); delete reg.workspaces[id]; for (const [e, w] of Object.entries(reg.emails)) if (w === id) delete reg.emails[e]; saveReg(); }

// ---- চালুর সময় লোড ----
async function init() {
  if (URI) {
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(URI, { serverSelectionTimeoutMS: 15000 });
    await client.connect();
    col = client.db(process.env.MONGODB_DB || 'shopagent').collection('store');
    const r = await col.findOne({ _id: 'registry' });
    if (r && r.data) { reg = { ...reg, ...r.data }; for await (const doc of col.find({ _id: /^ws:/ })) wss.set(doc._id.slice(3), build(doc.data)); console.log('💾 ডেটা: MongoDB ✅ (' + wss.size + ' দোকান)'); }
    else await migrateLegacy((await col.findOne({ _id: 'main' }) || {}).data);
  } else {
    const r = readJson(REG_FILE);
    if (r) { reg = { ...reg, ...r }; for (const f of fs.readdirSync(WS_DIR)) if (f.endsWith('.json')) { const x = readJson(path.join(WS_DIR, f)); if (x) wss.set(f.slice(0, -5), build(x)); } console.log('💾 ডেটা: লোকাল ফাইল (' + wss.size + ' দোকান) ⚠️ Render-এ রিস্টার্টে মুছে যায়; MONGODB_URI দিন'); }
    else await migrateLegacy(LEGACY_FILES.map(readJson).find(Boolean));
  }
  // মেয়াদ-উত্তীর্ণ সেশন সাফ
  const now = Date.now(); for (const [t, s] of Object.entries(reg.sessions)) if (!s || s.exp < now) delete reg.sessions[t];
  await flush();
}

// আগের এক-দোকানের ডেটা থাকলে সেটাই প্রথম দোকান হয়ে যায় (কিছু হারায় না; পুরোনো ডকুমেন্ট ব্যাকআপ হিসেবে থেকে যায়)
async function migrateLegacy(old) {
  if (!old || !Array.isArray(old.users) || !old.users.length) { console.log('💾 নতুন ডেটাবেস তৈরি হলো (এখনো কোনো দোকান নেই)'); return; }
  const id = 'wmain'; const db = build(old);
  for (const [t, s] of Object.entries(db.sessions || {})) reg.sessions[t] = { ...s, ws: id };
  db.sessions = {};
  wss.set(id, db); dirtyWs.add(id);
  reg.workspaces[id] = { id, name: db.settings.businessName, createdAt: Date.now(), legacy: true };
  reg.legacy = id; indexUsers(id);
  console.log('♻️ আগের ডেটা প্রথম দোকান হিসেবে নেওয়া হলো: ' + db.settings.businessName + ' (' + db.users.length + ' ইউজার)');
}

// ---- সংরক্ষণ ----
let timer = null, writing = Promise.resolve();
const atomic = (f, obj) => { const t = f + '.tmp'; fs.writeFileSync(t, JSON.stringify(obj)); fs.renameSync(t, f); };
function flush() {
  clearTimeout(timer); timer = null;
  const jobs = [];
  if (dirtyReg) { dirtyReg = false; jobs.push(['registry', reg]); }
  for (const id of [...dirtyWs]) { dirtyWs.delete(id); const db = wss.get(id); if (db) jobs.push(['ws:' + id, db]); }
  if (!jobs.length) return writing;
  if (!col) {
    for (const [k, v] of jobs) { try { atomic(k === 'registry' ? REG_FILE : path.join(WS_DIR, k.slice(3) + '.json'), v); } catch (e) { console.error('store save', e.message); if (k === 'registry') dirtyReg = true; else dirtyWs.add(k.slice(3)); } }
    return Promise.resolve();
  }
  const snaps = jobs.map(([k, v]) => { const json = JSON.stringify(v); if (json.length > 12e6) console.error('⚠️ ' + k + ' ডেটা ১২MB ছাড়িয়েছে — MongoDB-র ১৬MB সীমার কাছে! পুরোনো মেসেজ ছাঁটুন।'); return [k, json]; });
  writing = writing.then(async () => {
    for (const [k, json] of snaps) {
      try { await col.replaceOne({ _id: k }, { _id: k, data: JSON.parse(json), updatedAt: new Date() }, { upsert: true }); }
      catch (e) { console.error('MongoDB save ব্যর্থ (' + k + '):', e.message); if (k === 'registry') dirtyReg = true; else dirtyWs.add(k.slice(3)); }
    }
  });
  return writing;
}
const schedule = () => { if (!timer) timer = setTimeout(flush, 500); };
function save() { const c = ALS.getStore(); if (c) dirtyWs.add(c.id); schedule(); }
function saveReg() { dirtyReg = true; schedule(); }
setInterval(() => { if ((dirtyReg || dirtyWs.size) && !timer) flush(); }, 15000).unref();
let closing = false;
['SIGINT', 'SIGTERM'].forEach(s => process.on(s, async () => { if (closing) return; closing = true; try { await flush(); await writing; } catch {} process.exit(0); }));

// ---- টিমের অ্যাক্সেস (পারমিশন) ----
const PERMS = ['inbox', 'orders', 'leads', 'products', 'reports', 'desk', 'team', 'settings'];
const PRESETS = { full: PERMS.slice(), partial: ['inbox', 'orders', 'leads'], basic: ['inbox'] };

// রিস্টোর/পুরোনো ডেটার পর ঘাটতি ঠিক করে
function migrate() {
  const c = ALS.getStore(); c.db = build(c.db); wss.set(c.id, c.db);
  c.db.users.forEach(u => { if (u.role === 'owner') { u.perms = PERMS.slice(); u.preset = 'full'; } else if (!Array.isArray(u.perms)) { u.preset = u.preset || 'basic'; u.perms = (PRESETS[u.preset] || PRESETS.basic).slice(); } });
  indexUsers(c.id); dirtyWs.add(c.id);
}

module.exports = { D, wsId, run, peek, ids, createWorkspace, dropWorkspace, routeFor, setRoute, dropRoute, indexUsers, reg: () => reg, saveReg, save, flush, init, migrate, PERMS, PRESETS };
