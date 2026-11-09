// "কানেক্ট" সিস্টেম: দোকানদার ড্যাশবোর্ড থেকে বাটন চেপে নিজের Facebook পেজ / Instagram / WhatsApp যুক্ত করে।
// Meta-র ঝামেলা (ডেভেলপার অ্যাপ, রিভিউ, টোকেন, webhook) শুধু আপনি (প্ল্যাটফর্মের মালিক) একবার করেন;
// দোকানদাররা শুধু আপনার Meta App-এ "লগইন করে অনুমতি দেয়"। নিচের কোড সেই লগইনের পরের কাজগুলো নিজে করে:
// কোড → টোকেন, পেজ/নম্বর খোঁজা, webhook সাবস্ক্রাইব, দোকানের সাথে বেঁধে রাখা।
const express = require('express');
const axios = require('axios'), crypto = require('crypto');
const S = require('../lib/store'), CH = require('../lib/channels'), Courier = require('../lib/courier');

const APP_ID = () => String(process.env.META_APP_ID || '').trim();
const APP_SECRET = () => String(process.env.META_APP_SECRET || '').trim();
const publicUrl = () => String(process.env.PUBLIC_URL || '').replace(/\/$/, '');
const ready = () => !!(APP_ID() && APP_SECRET());
const str = (v, n = 200) => String(v == null ? '' : v).trim().slice(0, n);
const bad = (m, status = 400) => { const e = new Error(m); e.status = status; throw e; };
const w = fn => (req, res) => Promise.resolve(fn(req, res)).catch(e => { console.error('connect:', CH.errMsg(e)); res.status(e.status || 500).json({ error: e.status ? e.message : CH.errMsg(e) }); });

// Graph API ডাক (টোকেন সবসময় header-এ, URL-এ না, যাতে লগে না যায়)
async function g(method, path, { params, data, token } = {}) {
  const r = await axios({ method, url: CH.G() + path, params, data, headers: token ? { Authorization: 'Bearer ' + token } : undefined, timeout: 30000 });
  return r.data;
}
async function exchangeCode(code) {
  const base = { client_id: APP_ID(), client_secret: APP_SECRET(), code };
  try { return (await g('GET', '/oauth/access_token', { params: base })).access_token; }
  catch (e) { // কিছু ফ্লোতে খালি redirect_uri লাগে
    if (e.response && e.response.data && e.response.data.error && e.response.data.error.error_subcode === 36008) return (await g('GET', '/oauth/access_token', { params: { ...base, redirect_uri: '' } })).access_token;
    throw e;
  }
}
async function longLived(token) { // স্বল্পমেয়াদি টোকেন → দীর্ঘমেয়াদি (এটা থেকে পাওয়া পেজ টোকেনের মেয়াদ শেষ হয় না)
  try { const r = await g('GET', '/oauth/access_token', { params: { grant_type: 'fb_exchange_token', client_id: APP_ID(), client_secret: APP_SECRET(), fb_exchange_token: token } }); return r.access_token || token; }
  catch { return token; }
}

// একই পেজ/নম্বর অন্য দোকানে থাকলে সেখান থেকে সরিয়ে এই দোকানে আনা (প্রমাণ হয়েছে ইউজারের এটার ওপর নিয়ন্ত্রণ আছে)
function detachElsewhere(kind, id, exceptWs) {
  for (const wid of S.ids()) {
    if (wid === exceptWs) continue;
    S.run(wid, () => {
      const c = S.D().channels;
      if (kind === 'page') c.pages = c.pages.filter(p => p.pageId !== id);
      else c.whatsapp = c.whatsapp.filter(p => p.phoneId !== id);
      S.save();
    });
  }
}
function upsertPage(rec) {
  const c = S.D().channels, i = c.pages.findIndex(p => p.pageId === rec.pageId);
  if (i >= 0) c.pages[i] = { ...c.pages[i], ...rec }; else c.pages.push(rec);
  S.save();
  S.setRoute('fb:' + rec.pageId, S.wsId());
  if (rec.igId) S.setRoute('ig:' + rec.igId, S.wsId());
}

const router = express.Router();
const pub = {
  page: p => ({ pageId: p.pageId, name: p.name, igId: p.igId || '', igUsername: p.igUsername || '', connectedAt: p.connectedAt, subscribeError: p.subscribeError || '' }),
  wa: x => ({ phoneId: x.phoneId, wabaId: x.wabaId, number: x.number || '', name: x.name || '', connectedAt: x.connectedAt, registerError: x.registerError || '' }),
};

// ব্রাউজারকে যা জানাতে হয় (কোনো সিক্রেট না)
router.get('/config', (req, res) => res.json({
  ready: ready(), appId: APP_ID(), graphVersion: process.env.GRAPH_VERSION || 'v25.0',
  fbConfigId: str(process.env.META_FB_CONFIG_ID), waConfigId: str(process.env.META_WA_CONFIG_ID), waSolutionId: str(process.env.META_WA_SOLUTION_ID),
  publicHttps: /^https:\/\//.test(publicUrl()),
}));

router.get('/status', (req, res) => {
  const d = S.D(), s = d.settings, wid = S.wsId(), legacy = CH.isLegacy();
  const token = s.steadfastWebhookToken || '';
  res.json({
    ready: ready(), webhookUrl: publicUrl() + '/webhook',
    pages: d.channels.pages.map(pub.page), whatsapp: d.channels.whatsapp.map(pub.wa),
    legacy: legacy ? { page: !!process.env.PAGE_ACCESS_TOKEN, instagram: !!process.env.IG_ACCESS_TOKEN, whatsapp: !!process.env.WHATSAPP_TOKEN } : null,
    courier: { mode: Courier.mode(), hasKeys: !!(s.steadfastApiKey && s.steadfastSecretKey), viaEnv: legacy && !s.steadfastApiKey && !!process.env.STEADFAST_API_KEY, webhookUrl: publicUrl() + '/steadfast/webhook/' + wid, webhookToken: token },
  });
});

// ---------- Facebook Page + Instagram ----------
// ব্রাউজার FB.login দিয়ে `code` (বা accessToken) পাঠায়। যে পেজগুলোর অনুমতি ইউজার Meta-র ডায়ালগে দিয়েছে সেগুলোই আসে।
router.post('/facebook', w(async (req, res) => {
  if (!ready()) bad('সার্ভারে META_APP_ID / META_APP_SECRET সেট করা নেই', 503);
  const { code, accessToken } = req.body || {};
  if (!code && !accessToken) bad('Facebook থেকে কোনো কোড আসেনি (লগইন সম্পূর্ণ হয়নি)');
  const userToken = await longLived(accessToken || await exchangeCode(code));
  const me = await g('GET', '/me', { params: { fields: 'id,name' }, token: userToken });
  const list = await g('GET', '/me/accounts', { params: { fields: 'id,name,access_token,instagram_business_account{id,username}', limit: 100 }, token: userToken });
  const pages = (list.data || []).filter(p => p.access_token);
  if (!pages.length) return res.json({ ok: false, error: 'কোনো Facebook পেজ পাওয়া যায়নি। লগইনের সময় পেজটা টিক দিয়ে অনুমতি দিতে হবে (আর আপনাকে পেজের অ্যাডমিন হতে হবে)।' });
  const out = [];
  for (const pg of pages) {
    const ig = pg.instagram_business_account || null;
    const rec = { pageId: String(pg.id), name: pg.name, token: pg.access_token, igId: ig ? String(ig.id) : '', igUsername: ig ? (ig.username || '') : '', fbUserId: String(me.id), connectedAt: Date.now(), subscribeError: '' };
    try { await g('POST', `/${pg.id}/subscribed_apps`, { params: { subscribed_fields: CH.NEEDED.join(',') }, token: pg.access_token }); }
    catch (e) { rec.subscribeError = CH.errMsg(e); }
    detachElsewhere('page', rec.pageId, S.wsId());
    upsertPage(rec);
    out.push({ ...pub.page(rec), subscribed: !rec.subscribeError });
  }
  res.json({ ok: true, user: me.name, connected: out });
}));

router.post('/page/:id/resubscribe', w(async (req, res) => {
  const p = S.D().channels.pages.find(x => x.pageId === req.params.id) || bad('পেজ পাওয়া যায়নি', 404);
  try { await g('POST', `/${p.pageId}/subscribed_apps`, { params: { subscribed_fields: CH.NEEDED.join(',') }, token: p.token }); p.subscribeError = ''; S.save(); }
  catch (e) { p.subscribeError = CH.errMsg(e); S.save(); return res.json({ ok: false, error: p.subscribeError }); }
  res.json({ ok: true, page: await CH.pageSubs(p.pageId).catch(() => null) });
}));
router.get('/page/:id/check', w(async (req, res) => {
  const p = S.D().channels.pages.find(x => x.pageId === req.params.id) || bad('পেজ পাওয়া যায়নি', 404);
  try { res.json({ ok: true, ...(await CH.pageSubs(p.pageId)) }); } catch (e) { res.json({ ok: false, error: CH.errMsg(e) }); }
}));
router.delete('/page/:id', w(async (req, res) => {
  const c = S.D().channels, p = c.pages.find(x => x.pageId === req.params.id) || bad('পেজ পাওয়া যায়নি', 404);
  try { await g('DELETE', `/${p.pageId}/subscribed_apps`, { token: p.token }); } catch {} // না পারলেও সরিয়ে দিই
  c.pages = c.pages.filter(x => x !== p); S.save();
  if (S.routeFor('fb:' + p.pageId) === S.wsId()) S.dropRoute('fb:' + p.pageId);
  if (p.igId && S.routeFor('ig:' + p.igId) === S.wsId()) S.dropRoute('ig:' + p.igId);
  res.json({ ok: true });
}));

// ---------- WhatsApp (Embedded Signup) ----------
// ব্রাউজার পাঠায়: code (FB.login থেকে) + wabaId + phoneId (Meta-র WA_EMBEDDED_SIGNUP ইভেন্ট থেকে)।
// ব্রাউজারের পাঠানো আইডি প্রমাণ না, তাই টোকেন দিয়ে সার্ভার থেকেই নম্বরটা যাচাই করি।
router.post('/whatsapp', w(async (req, res) => {
  if (!ready()) bad('সার্ভারে META_APP_ID / META_APP_SECRET সেট করা নেই', 503);
  const code = str(req.body.code, 2000), wabaId = str(req.body.wabaId, 40), phoneId = str(req.body.phoneId, 40);
  if (!code) bad('Meta থেকে কোড আসেনি (সেটআপ সম্পূর্ণ হয়নি)');
  if (!/^\d+$/.test(wabaId) || !/^\d+$/.test(phoneId)) bad('WhatsApp নম্বর/অ্যাকাউন্টের আইডি পাওয়া যায়নি — Meta-র সেটআপ শেষ পর্যন্ত করুন');
  const token = await exchangeCode(code);
  let info;
  try { info = await g('GET', `/${phoneId}`, { params: { fields: 'display_phone_number,verified_name' }, token }); }
  catch (e) { bad('এই নম্বরে আপনার অ্যাক্সেস যাচাই করা যায়নি: ' + CH.errMsg(e)); }
  await g('POST', `/${wabaId}/subscribed_apps`, { token }); // আমাদের অ্যাপ এই WABA-র মেসেজ পাবে
  const rec = { phoneId, wabaId, token, number: info.display_phone_number || '', name: info.verified_name || '', connectedAt: Date.now(), registerError: '', pin: '' };
  const pin = String(crypto.randomInt(100000, 999999)); // Cloud API-তে নম্বর রেজিস্টার (২-ধাপ যাচাইয়ের PIN)
  try { await g('POST', `/${phoneId}/register`, { data: { messaging_product: 'whatsapp', pin }, token }); rec.pin = pin; }
  catch (e) { rec.registerError = CH.errMsg(e); }
  detachElsewhere('wa', phoneId, S.wsId());
  const c = S.D().channels, i = c.whatsapp.findIndex(x => x.phoneId === phoneId);
  if (i >= 0) c.whatsapp[i] = { ...c.whatsapp[i], ...rec }; else c.whatsapp.push(rec);
  S.save(); S.setRoute('wa:' + phoneId, S.wsId());
  res.json({ ok: true, whatsapp: pub.wa(rec) });
}));
router.delete('/whatsapp/:id', w(async (req, res) => {
  const c = S.D().channels, x = c.whatsapp.find(p => p.phoneId === req.params.id) || bad('নম্বর পাওয়া যায়নি', 404);
  c.whatsapp = c.whatsapp.filter(p => p !== x); S.save();
  if (!c.whatsapp.some(p => p.wabaId === x.wabaId)) { try { await g('DELETE', `/${x.wabaId}/subscribed_apps`, { token: x.token }); } catch {} }
  if (S.routeFor('wa:' + x.phoneId) === S.wsId()) S.dropRoute('wa:' + x.phoneId);
  res.json({ ok: true });
}));

// ---------- কুরিয়ার (Steadfast): প্রতিটা দোকানের নিজের key ----------
router.put('/courier', w(async (req, res) => {
  const s = S.D().settings, b = req.body || {};
  const mode = b.mode === 'steadfast' ? 'steadfast' : 'mock';
  if (b.apiKey) s.steadfastApiKey = str(b.apiKey, 120);
  if (b.secretKey) s.steadfastSecretKey = str(b.secretKey, 120);
  if (mode === 'steadfast' && !(s.steadfastApiKey && s.steadfastSecretKey) && !(CH.isLegacy() && process.env.STEADFAST_API_KEY)) bad('Steadfast API Key আর Secret Key দুটোই দিন');
  s.courierMode = mode;
  if (!s.steadfastWebhookToken) s.steadfastWebhookToken = crypto.randomBytes(18).toString('hex');
  S.save(); res.json({ ok: true, mode });
}));

// ---------- Meta-র আবশ্যক callback (App Review-তে লাগে) ----------
const pubRouter = express.Router();
function signed(sr) {
  const [sig, payload] = String(sr || '').split('.');
  if (!sig || !payload || !APP_SECRET()) return null;
  const want = crypto.createHmac('sha256', APP_SECRET()).update(payload).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(want);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { return null; }
}
function forgetFbUser(uid) { // এই Facebook ইউজারের কানেক্ট-করা সব পেজ ও তাদের টোকেন মুছে ফেলা
  let n = 0;
  for (const wid of S.ids()) S.run(wid, () => {
    const c = S.D().channels, keep = [];
    for (const p of c.pages) { if (p.fbUserId === String(uid)) { n++; S.dropRoute('fb:' + p.pageId); if (p.igId) S.dropRoute('ig:' + p.igId); } else keep.push(p); }
    if (keep.length !== c.pages.length) { c.pages = keep; S.save(); }
  });
  return n;
}
pubRouter.post('/deauth', (req, res) => { const d = signed(req.body && req.body.signed_request); if (!d) return res.sendStatus(400); forgetFbUser(d.user_id); res.sendStatus(200); });
pubRouter.post('/data-deletion', (req, res) => {
  const d = signed(req.body && req.body.signed_request); if (!d) return res.sendStatus(400);
  forgetFbUser(d.user_id);
  const code = crypto.randomBytes(8).toString('hex');
  res.json({ url: publicUrl() + '/privacy-policy.html?deleted=' + code, confirmation_code: code });
});

// ---------- আগের এক-দোকানের সেটআপ: .env-এর পেজ/নম্বরকে সেই দোকানের সাথে বেঁধে দেওয়া ----------
async function bootLegacy(attempt = 0) {
  const lg = S.reg().legacy; if (!lg) return;
  const wa = String(process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
  if (wa && !S.routeFor('wa:' + wa)) S.setRoute('wa:' + wa, lg);
  const bind = key => { if (!S.routeFor(key)) { S.setRoute(key, lg); console.log('🔗 আগের সেটআপ যুক্ত হলো: ' + key); } };
  const errs = []; let again = false;
  const PAGE = String(process.env.PAGE_ACCESS_TOKEN || '').trim(), IG = String(process.env.IG_ACCESS_TOKEN || '').trim();
  if (PAGE) {
    try {
      const me = await g('GET', '/me', { params: { fields: 'id,instagram_business_account{id}' }, token: PAGE });
      bind('fb:' + me.id); if (me.instagram_business_account) bind('ig:' + me.instagram_business_account.id);
    } catch (e) { errs.push('PAGE_ACCESS_TOKEN: ' + CH.errMsg(e)); again = true; }
  }
  if (IG && IG !== PAGE) { // Instagram Login-এর টোকেন (IGAA...) graph.instagram.com-এ চলে, graph.facebook.com-এ না
    let done = false;
    for (const base of [CH.G(), 'https://graph.instagram.com']) {
      try { const me = (await axios.get(base + '/me', { params: { fields: 'id,user_id' }, headers: { Authorization: 'Bearer ' + IG }, timeout: 20000 })).data; bind('ig:' + (me.user_id || me.id)); done = true; break; } catch {}
    }
    if (!done) errs.push('IG_ACCESS_TOKEN: টোকেনটা দুই জায়গাতেই অচল (মেয়াদ শেষ বা ভুল কপি)');
  }
  if (errs.length) {
    console.error('আগের সেটআপের কিছু আইডি আনা যায়নি → ' + errs.join(' | ') + (again && attempt < 5 ? ' — ১ মিনিট পর আবার চেষ্টা' : ''));
    if (again && attempt < 5) setTimeout(() => bootLegacy(attempt + 1), 60000).unref();
  }
}

module.exports = { router, pubRouter, bootLegacy };
