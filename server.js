require('dotenv').config();
const express = require('express'), path = require('path');
const S = require('./lib/store'), U = require('./lib/util'), A = require('./lib/auth');
const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '60mb' }));
app.use('/uploads', express.static(U.UP, { maxAge: '7d' }));
app.use('/webhook', require('./routes/webhook'));

// ---- লগইন ও সেটআপ ----
const api = express.Router();
const hits = new Map();
const limit = (req, res, next) => { // ভুল পাসওয়ার্ড/কোড অনুমান ঠেকাতে: প্রতি IP-তে মিনিটে ১০ বার
  const k = req.ip, now = Date.now(), a = (hits.get(k) || []).filter(t => now - t < 60000);
  if (a.length >= 10) return res.status(429).json({ error: 'অনেকবার চেষ্টা হয়েছে, ১ মিনিট পরে আবার চেষ্টা করুন' });
  a.push(now); hits.set(k, a); next();
};
api.get('/auth/state', (req, res) => res.json({ hasUsers: S.D().users.length > 0, needsCode: !!process.env.SETUP_CODE, user: (A.userOf(req) ? A.pub(A.userOf(req)) : null) }));
api.post('/auth/setup', limit, (req, res) => {
  if (S.D().users.length) return res.status(403).json({ error: 'সেটআপ আগেই হয়ে গেছে' });
  if (process.env.SETUP_CODE && String(req.body.code || '').trim() !== process.env.SETUP_CODE) return res.status(403).json({ error: 'সেটআপ কোড ভুল' });
  try { const u = A.addUser({ ...req.body, role: 'owner' }); A.login(res, u); res.json({ ok: true }); } catch (e) { res.status(400).json({ error: e.message }); }
});
api.post('/auth/login', limit, (req, res) => {
  const u = S.D().users.find(x => x.email === String(req.body.email || '').trim().toLowerCase());
  if (!u || !A.check(u, req.body.password)) return res.status(401).json({ error: 'ইমেইল বা পাসওয়ার্ড ভুল' });
  A.login(res, u); res.json({ ok: true });
});
api.post('/auth/logout', (req, res) => { A.logout(req, res); res.json({ ok: true }); });
api.use(A.require, require('./routes/api'));
app.use('/api', api);

// ---- পেজ গার্ড ----
const pub = f => path.join(__dirname, 'public', f);
app.get('/', (req, res) => res.redirect('/app.html'));
['app.html', 'simulator.html'].forEach(f => app.get('/' + f, (req, res) => {
  if (!S.D().users.length) return res.redirect('/setup.html');
  if (!A.userOf(req)) return res.redirect('/login.html');
  res.sendFile(pub(f));
}));
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n✅ Shop Agent চালু: http://localhost:${PORT}`);
  console.log(`   Gemini: ${process.env.GEMINI_API_KEY ? 'চালু' : '❌ GEMINI_API_KEY নেই (ডেমো মোড)'} | কুরিয়ার: ${process.env.COURIER_MODE || 'mock'}`);
  console.log(`   PUBLIC_URL: ${process.env.PUBLIC_URL || '❌ নেই (ছবি Meta-তে যাবে না)'}\n`);
});
