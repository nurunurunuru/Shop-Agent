require('dotenv').config();
const express = require('express'), path = require('path');
const S = require('./lib/store'), U = require('./lib/util'), A = require('./lib/auth');
const app = express();
app.set('trust proxy', 1);
// webhook-এর সিগনেচার মেলাতে আসল (raw) বডি লাগে
app.use(express.json({ limit: '15mb', verify: (req, res, buf) => { if (req.originalUrl.startsWith('/webhook')) req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: false, limit: '1mb' })); // Meta-র deauth/data-deletion callback form আকারে আসে
app.use('/uploads', express.static(U.UP, { maxAge: '7d' }));
app.use('/webhook', require('./routes/webhook'));
app.use('/steadfast/webhook', require('./routes/steadfast'));
app.use('/meta', require('./routes/connect').pubRouter);

// ---- সামান্য রেট-লিমিট (ভুল পাসওয়ার্ড বারবার চেষ্টা / স্প্যাম সাইন-আপ ঠেকাতে) ----
const hits = new Map();
const limited = (key, max, windowMs) => {
  const now = Date.now(), a = (hits.get(key) || []).filter(t => now - t < windowMs);
  a.push(now); hits.set(key, a);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some(t => now - t < windowMs)) hits.delete(k);
  return a.length > max;
};

// ---- লগইন ও সাইন-আপ ----
const api = express.Router();
const signupOpen = () => process.env.ALLOW_SIGNUP !== '0';
const needsCode = () => !!String(process.env.SIGNUP_CODE || '').trim();
api.get('/auth/state', (req, res) => {
  const u = A.userOf(req);
  res.json({ hasUsers: S.ids().length > 0, signupOpen: signupOpen(), needsCode: needsCode(), user: u ? A.pub(u) : null });
});
// নতুন দোকান + মালিক। (/auth/setup পুরোনো নাম, একই কাজ)
api.post(['/auth/signup', '/auth/setup'], (req, res) => {
  if (!signupOpen()) return res.status(403).json({ error: 'এখন নতুন অ্যাকাউন্ট খোলা বন্ধ আছে' });
  if (limited('su:' + req.ip, 10, 3600e3)) return res.status(429).json({ error: 'অনেকবার চেষ্টা হয়েছে, কিছুক্ষণ পর আবার করুন' });
  if (needsCode() && String(req.body.code || '').trim() !== String(process.env.SIGNUP_CODE).trim()) return res.status(403).json({ error: 'সেটআপ কোড ভুল' });
  try {
    const r = A.signup({ shopName: req.body.shopName || req.body.shop || req.body.name + ' এর দোকান', name: req.body.name, email: req.body.email, password: req.body.password });
    S.run(r.id, () => A.login(res, r.user)); res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
api.post('/auth/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (limited('li:' + req.ip + ':' + email, 10, 15 * 60e3)) return res.status(429).json({ error: 'অনেকবার ভুল হয়েছে, ১৫ মিনিট পর আবার চেষ্টা করুন' });
  const ws = S.reg().emails[email], db = ws && S.peek(ws), u = db && db.users.find(x => x.email === email);
  if (!u || !A.check(u, req.body.password)) return res.status(401).json({ error: 'ইমেইল বা পাসওয়ার্ড ভুল' });
  S.run(ws, () => A.login(res, u)); res.json({ ok: true });
});
api.post('/auth/logout', (req, res) => { A.logout(req, res); res.json({ ok: true }); });
api.use(A.require, require('./routes/api'));
app.use('/api', api);

// ---- পেজ গার্ড ----
const pub = f => path.join(__dirname, 'public', f);
app.get('/', (req, res) => res.redirect('/app.html'));
['app.html', 'simulator.html'].forEach(f => app.get('/' + f, (req, res) => {
  if (!A.userOf(req)) return res.redirect(S.ids().length ? '/login.html' : '/setup.html');
  res.sendFile(pub(f));
}));
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
S.init().then(() => app.listen(PORT, () => {
  console.log(`\n✅ Shop Agent চালু: http://localhost:${PORT}  (${S.ids().length} দোকান)`);
  console.log(`   Gemini: ${process.env.GEMINI_API_KEY ? 'চালু' : '❌ GEMINI_API_KEY নেই (ডেমো মোড)'}`);
  console.log(`   ছবি রাখা: ${U.cloudOn() ? 'Cloudinary ✅' : '⚠️ লোকাল ডিস্ক (Render-এ রিস্টার্টে মুছে যাবে)'}`);
  console.log(`   Meta কানেক্ট: ${process.env.META_APP_ID && process.env.META_APP_SECRET ? '✅ META_APP_ID/SECRET আছে' : '❌ META_APP_ID / META_APP_SECRET নেই (দোকানদাররা পেজ কানেক্ট করতে পারবে না)'}`);
  console.log(`   Webhook সিগনেচার যাচাই: ${process.env.META_APP_SECRET ? 'চালু' : '⚠️ বন্ধ (META_APP_SECRET দিন)'} | Webhook URL: ${(process.env.PUBLIC_URL || '❌ PUBLIC_URL নেই')}/webhook`);
  console.log(`   সাইন-আপ: ${signupOpen() ? (needsCode() ? 'খোলা (কোড লাগে)' : 'সবার জন্য খোলা') : 'বন্ধ'}\n`);
  require('./routes/connect').bootLegacy();
}))
  .catch(e => { console.error('❌ ডেটাবেস চালু হয়নি:', e.message); process.exit(1); });
