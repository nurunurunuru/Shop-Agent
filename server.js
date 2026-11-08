require('dotenv').config();
const express = require('express'), path = require('path');
const S = require('./lib/store'), U = require('./lib/util'), A = require('./lib/auth');
const app = express();
app.use(express.json({ limit: '15mb' }));
app.use('/uploads', express.static(U.UP, { maxAge: '7d' }));
app.use('/webhook', require('./routes/webhook'));

// ---- লগইন ও সেটআপ ----
const api = express.Router();
api.get('/auth/state', (req, res) => res.json({ hasUsers: S.D().users.length > 0, user: (A.userOf(req) ? A.pub(A.userOf(req)) : null) }));
api.post('/auth/setup', (req, res) => {
  if (S.D().users.length) return res.status(403).json({ error: 'সেটআপ আগেই হয়ে গেছে' });
  try { const u = A.addUser({ ...req.body, role: 'owner' }); A.login(res, u); res.json({ ok: true }); } catch (e) { res.status(400).json({ error: e.message }); }
});
api.post('/auth/login', (req, res) => {
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
S.init().then(() => app.listen(PORT, () => {
  console.log(`\n✅ Shop Agent চালু: http://localhost:${PORT}`);
  console.log(`   Gemini: ${process.env.GEMINI_API_KEY ? 'চালু' : '❌ GEMINI_API_KEY নেই (ডেমো মোড)'} | কুরিয়ার: ${process.env.COURIER_MODE || 'mock'}`);
  console.log(`   ছবি রাখা: ${U.cloudOn() ? 'Cloudinary ✅' : '⚠️ লোকাল ডিস্ক (Render-এ রিস্টার্টে মুছে যাবে)'}`);
  console.log(`   PUBLIC_URL: ${process.env.PUBLIC_URL || '❌ নেই (ছবি Meta-তে যাবে না)'}\n`);
}))
  .catch(e => { console.error('❌ ডেটাবেস চালু হয়নি:', e.message); process.exit(1); });
