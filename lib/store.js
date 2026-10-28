// সহজ JSON-ফাইল ডেটাবেস (কোনো নেটিভ প্যাকেজ লাগে না)। বড় হলে Postgres-এ সরানো যাবে।
const fs = require('fs'), path = require('path');
const FILE = path.join(__dirname, '..', 'data', 'store.json');
fs.mkdirSync(path.dirname(FILE), { recursive: true });

const RULES = `- সবসময় "আপনি" বলে সম্বোধন করবেন; ভদ্র, বিনয়ী ও পেশাদার সেলসম্যানের মতো কথা বলবেন।
- দাম বা ডেলিভারি চার্জ নিয়ে দরদাম হলে নম্রভাবে জানাবেন দাম নির্দিষ্ট; বিশেষ ছাড় চাইলে আমাদের টিমকে ডাকবেন।
- পেমেন্ট ক্যাশ অন ডেলিভারি।
- রিটার্ন, এক্সচেঞ্জ, অভিযোগ বা ড্যামেজ হলে নিজে সিদ্ধান্ত না নিয়ে টিমকে ডাকবেন।
- প্রতিটা উত্তরে গ্রাহককে পরের ধাপটা (দেখা, সাইজ বাছা, অর্ডার) সুন্দর করে জানাবেন।`;

const defaults = () => ({
  settings: {
    businessName: 'My Shop', lang: 'bn', deliveryInside: 70, deliveryOutside: 130, deliveryDays: '২-৩ দিন',
    handoverMinutes: 60, aiLive: false, followupEnabled: false, followupHours: 3, reviewLink: '',
    commentReplyEnabled: false, rulesLive: RULES, rulesDraft: RULES, rulesPrev: '',
  },
  users: [], sessions: {}, products: [], customers: [], conversations: [], messages: [],
  orders: [], leads: [], notifications: [], counters: { order: 1000, product: 0 },
});

// ---- সংরক্ষণ ----
// MONGODB_URI সেট থাকলে ডেটা MongoDB-তে (স্থায়ী); না থাকলে data/store.json ফাইলে (লোকাল টেস্ট)।
const URI = process.env.MONGODB_URI || '';
let col = null; // MongoDB collection
const build = x => { const d = defaults(); return { ...d, ...x, settings: { ...d.settings, ...(x.settings || {}) }, counters: { ...d.counters, ...(x.counters || {}) } }; };

let db = defaults();
function readFile() { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return {}; } }

// সার্ভার চালুর আগে একবার ডাকতে হবে (server.js)
async function init() {
  if (!URI) { db = build(readFile()); console.log('💾 ডেটা: লোকাল ফাইল (⚠️ Render-এ রিস্টার্টে মুছে যায়; MONGODB_URI দিন)'); return; }
  const { MongoClient } = require('mongodb');
  const client = new MongoClient(URI, { serverSelectionTimeoutMS: 15000 });
  await client.connect();
  col = client.db(process.env.MONGODB_DB || 'shopagent').collection('store');
  const doc = await col.findOne({ _id: 'main' });
  if (doc && doc.data) { db = build(doc.data); console.log('💾 ডেটা: MongoDB ✅'); }
  else { db = build(readFile()); await flush(); console.log('💾 ডেটা: MongoDB ✅ (প্রথমবার — নতুন ডেটাবেস তৈরি হলো)'); }
}

let timer = null, writing = Promise.resolve(), dirty = false;
function flushFile() { const tmp = FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(db)); fs.renameSync(tmp, FILE); }
function flush() {
  clearTimeout(timer); timer = null;
  if (!col) { try { flushFile(); } catch (e) { console.error('store save', e.message); } return Promise.resolve(); }
  const json = JSON.stringify(db);
  if (json.length > 12e6) console.error('⚠️ ডেটা ১২MB ছাড়িয়েছে — MongoDB-র ১৬MB ডকুমেন্ট সীমার কাছে! পুরোনো মেসেজ ছাঁটুন।');
  dirty = false;
  // লেখা একটার পর একটা চলে, যাতে পুরোনো ডেটা নতুনের ওপর না বসে
  writing = writing.then(() => col.replaceOne({ _id: 'main' }, { _id: 'main', data: JSON.parse(json), updatedAt: new Date() }, { upsert: true }))
    .catch(e => { dirty = true; console.error('MongoDB save ব্যর্থ:', e.message); });
  return writing;
}
function save() { dirty = true; if (!timer) timer = setTimeout(flush, 500); }
// ব্যর্থ হলে আবার চেষ্টা
setInterval(() => { if (dirty && !timer) flush(); }, 15000).unref();
let closing = false;
['SIGINT', 'SIGTERM'].forEach(s => process.on(s, async () => { if (closing) return; closing = true; try { await flush(); await writing; } catch {} process.exit(0); }));

module.exports = { D: () => db, save, flush, init };
