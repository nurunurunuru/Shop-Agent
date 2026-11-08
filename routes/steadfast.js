// Steadfast → আমাদের সার্ভার: পার্সেলের স্ট্যাটাস বদলালে Steadfast নিজে এখানে POST করে।
// Steadfast panel → Webhook settings: Callback URL = https://<আপনার-ডোমেইন>/steadfast/webhook
// Auth token (Generate চেপে পাওয়া) Render Environment-এ STEADFAST_WEBHOOK_TOKEN নামে দিন।
const router = require('express').Router();
const crypto = require('crypto');
const S = require('../lib/store'), O = require('../lib/orders'), E = require('../lib/engine');

const tokenOk = req => {
  const want = String(process.env.STEADFAST_WEBHOOK_TOKEN || '').trim();
  const got = (/^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || '')) || [])[1] || '';
  const a = Buffer.from(got.trim()), b = Buffer.from(want);
  return !!want && a.length === b.length && crypto.timingSafeEqual(a, b);
};
const findOrder = p => {
  const cid = String(p.consignment_id || ''), inv = String(p.invoice || '');
  return S.D().orders.find(o => o.courier && o.courier.provider === 'steadfast' && cid && String(o.courier.consignmentId) === cid)
    || S.D().orders.find(o => inv && String(o.no) === inv);
};
// Steadfast status → আমাদের অর্ডার স্ট্যাটাস (courier.js poll-এর মতোই)
const MAP = { delivered: 'delivered', partial_delivered: 'delivered', cancelled: 'returned' };

router.post('/', async (req, res) => {
  if (!process.env.STEADFAST_WEBHOOK_TOKEN) { console.error('Steadfast webhook: STEADFAST_WEBHOOK_TOKEN সেট নেই, রিকোয়েস্ট ফেরত দেওয়া হলো'); return res.status(503).json({ status: 'error', message: 'Webhook token not configured' }); }
  if (!tokenOk(req)) return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  const p = req.body || {};
  if (!p.consignment_id && !p.invoice) return res.status(400).json({ status: 'error', message: 'consignment_id or invoice required' });
  // আগে 200 দিয়ে দিই, যাতে Steadfast আবার চেষ্টা না করে; কাজ তারপর
  res.status(200).json({ status: 'success', message: 'Webhook received successfully.' });
  try {
    const o = findOrder(p);
    if (!o) return console.log('[Steadfast] অর্ডার পাওয়া যায়নি:', p.invoice || p.consignment_id);
    o.courier = o.courier || { provider: 'steadfast' };
    if (p.tracking_message) { o.courier.lastMessage = String(p.tracking_message).slice(0, 300); o.courier.lastAt = Date.now(); }
    if (p.notification_type === 'tracking_update') return S.save();
    const st = String(p.status || '').toLowerCase();
    if (st) o.courier.status = st;
    if (p.delivery_charge !== undefined && p.delivery_charge !== null && p.delivery_charge !== '') o.courier.deliveryCharge = +p.delivery_charge || 0;
    const next = MAP[st];
    if (next) {
      const r = O.setStatus(o, next, { by: 'courier', reason: next === 'returned' ? 'কুরিয়ার জানিয়েছে: cancelled' : '' });
      if (r.error) console.log('[Steadfast] #' + o.no + ' ' + r.error);
      else { console.log('[Steadfast] #' + o.no + ' → ' + next); await E.notifyOrder(o, next); }
    }
    S.save();
  } catch (e) { console.error('Steadfast webhook:', e.message); }
});

module.exports = router;
