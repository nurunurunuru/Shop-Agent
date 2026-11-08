const crypto = require('crypto');
const S = require('./store'), U = require('./util');
const can = (u, perm) => !!u && (u.role === 'owner' || (u.perms || []).includes(perm));

function hash(pw, salt = crypto.randomBytes(8).toString('hex')) {
  return { salt, hash: crypto.scryptSync(String(pw), salt, 32).toString('hex') };
}
function check(user, pw) {
  const h = crypto.scryptSync(String(pw), user.salt, 32);
  const b = Buffer.from(user.hash, 'hex');
  return h.length === b.length && crypto.timingSafeEqual(h, b);
}
function cookies(req) {
  const o = {};
  String(req.headers.cookie || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) o[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return o;
}
function login(res, user) {
  const token = crypto.randomBytes(24).toString('hex');
  S.D().sessions[token] = { uid: user.id, exp: Date.now() + 30 * 864e5 };
  S.save();
  res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${30 * 86400}`);
}
function logout(req, res) {
  delete S.D().sessions[cookies(req).sid]; S.save();
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; Path=/; Max-Age=0');
}
function userOf(req) {
  const s = S.D().sessions[cookies(req).sid];
  if (!s || s.exp < Date.now()) return null;
  return S.D().users.find(u => u.id === s.uid) || null;
}
function require_(req, res, next) {
  const u = userOf(req);
  if (!u) return res.status(401).json({ error: 'login দরকার' });
  req.user = u; next();
}
const need = perm => (req, res, next) => can(req.user, perm) ? next() : res.status(403).json({ error: 'এই কাজের অনুমতি আপনার নেই' });
function ownerOnly(req, res, next) {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'শুধু মালিক এটা করতে পারেন' });
  next();
}
function addUser({ name, email, password, role, preset, perms, restrictChats }) {
  const d = S.D();
  email = String(email || '').trim().toLowerCase();
  if (!name || !email || String(password || '').length < 6) throw new Error('নাম, ইমেইল আর ৬+ অক্ষরের পাসওয়ার্ড দিন');
  if (d.users.some(u => u.email === email)) throw new Error('এই ইমেইল আগেই আছে');
  const pr = role === 'owner' ? 'full' : (S.PRESETS[preset] ? preset : (Array.isArray(perms) ? 'custom' : 'basic'));
  const list = role === 'owner' ? S.PERMS.slice() : (Array.isArray(perms) ? perms.filter(x => S.PERMS.includes(x)) : S.PRESETS[pr].slice());
  const u = { id: U.id(), name, email, role: role || 'teammate', perms: list, preset: pr, restrictChats: !!restrictChats, ...hash(password), createdAt: Date.now() };
  d.users.push(u); S.save(); return u;
}
const pub = u => ({ id: u.id, name: u.name, email: u.email, role: u.role, preset: u.preset || 'custom', perms: u.role === 'owner' ? S.PERMS.slice() : (u.perms || []), restrictChats: !!u.restrictChats });

module.exports = { hash, can, need, check, login, logout, userOf, require: require_, ownerOnly, addUser, pub };
