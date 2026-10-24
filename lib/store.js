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

let db;
function load() {
  let x = {};
  try { x = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch {}
  const d = defaults();
  db = { ...d, ...x, settings: { ...d.settings, ...(x.settings || {}) }, counters: { ...d.counters, ...(x.counters || {}) } };
}
let timer = null;
function flush() { clearTimeout(timer); timer = null; const tmp = FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(db)); fs.renameSync(tmp, FILE); }
function save() { if (!timer) timer = setTimeout(flush, 300); }
load();
process.on('exit', () => { try { flush(); } catch {} });
['SIGINT', 'SIGTERM'].forEach(s => process.on(s, () => { try { flush(); } catch {} process.exit(0); }));

module.exports = { D: () => db, save, flush };
