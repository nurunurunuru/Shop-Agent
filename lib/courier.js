const axios = require('axios');
const S = require('./store'), O = require('./orders');
const mode = () => String(process.env.COURIER_MODE || 'mock').trim().toLowerCase();
const base = () => String(process.env.STEADFAST_BASE || 'https://portal.packzy.com/api/v1').trim().replace(/\/+$/, '');
const apiKey = () => String(process.env.STEADFAST_API_KEY || '').trim();
const secretKey = () => String(process.env.STEADFAST_SECRET_KEY || '').trim();
const headers = () => ({ 'Api-Key': apiKey(), 'Secret-Key': secretKey(), 'Content-Type': 'application/json' });
// ত্রুটির পুরো অবজেক্ট (যাতে key/secret থাকে) না ছাপিয়ে শুধু Steadfast-এর আসল বার্তা দেখাই
function clean(e) {
  if (!e.response) return new Error('Steadfast-এ পৌঁছানো যায়নি: ' + e.message);
  const status = e.response.status;
  let raw = e.response.data;
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw || {});
  const msg = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (status === 401 && /account is not active/i.test(msg)) {
    return new Error('Steadfast API: Account is not active. আপনার ওয়েব/merchant login active হলেও API access/key আলাদা করে active না থাকতে পারে। Steadfast panel-এর API settings থেকে নতুন API Key/Secret Key নিয়ে আবার দিন, এবং API access active আছে কি না নিশ্চিত করুন।');
  }
  if (status === 401) return new Error('Steadfast API: 401 Unauthorized. API Key/Secret Key ভুল, পুরোনো, বা এই merchant account-এর জন্য নয়। API settings থেকে দুটো key আবার copy করুন।');
  return new Error(`Steadfast ${status}: ${msg.slice(0, 250)}`);
}

async function check() {
  if (mode() !== 'steadfast') return { ok: true, mode: mode(), message: 'Courier mode mock' };
  if (!apiKey() || !secretKey()) return { ok: false, mode: 'steadfast', message: 'STEADFAST_API_KEY/STEADFAST_SECRET_KEY .env/Render Environment Variables-এ নেই' };
  try {
    const r = await axios.get(base() + '/get_balance', { headers: headers(), timeout: 20000 });
    return { ok: true, mode: 'steadfast', balance: r.data && (r.data.current_balance ?? r.data.balance), response: r.data };
  } catch (e) {
    return { ok: false, mode: 'steadfast', message: clean(e).message };
  }
}

// ট্র্যাকিং লিংক: Steadfast-এর সরাসরি লিংকের ধরন বদলেছে (/t/কোড আর কাজ করছিল না), তাই সাধারণ ট্র্যাকিং পেজ + কোড।
// সঠিক সরাসরি লিংক পেলে .env-এ TRACK_URL_TEMPLATE=https://.../{code} দিন।
const trackUrl = o => {
  if (!o.courier || o.courier.provider !== 'steadfast') return '';
  const t = process.env.TRACK_URL_TEMPLATE;
  return t ? t.replace('{code}', o.courier.trackingCode).replace('{cid}', o.courier.consignmentId) : 'https://steadfast.com.bd/tracking';
};
const trackText = o => `📍 ট্র্যাকিং কোড: ${o.courier.trackingCode}${trackUrl(o) ? `\n🔗 ${trackUrl(o)}${process.env.TRACK_URL_TEMPLATE ? '' : ' (এখানে কোডটা পেস্ট করুন)'}` : ''}`;
async function book(order) {
  if (order.courier) throw new Error('আগেই বুক করা হয়েছে');
  if (mode() === 'steadfast') {
    if (!apiKey() || !secretKey()) throw new Error('STEADFAST_API_KEY/SECRET_KEY .env বা Render Environment Variables-এ নেই');
    let r;
    try { r = await axios.post(base() + '/create_order', {
      invoice: String(order.no), recipient_name: order.name, recipient_phone: order.phone,
      recipient_address: order.address.slice(0, 250), cod_amount: order.paid ? 0 : order.total,
      note: order.items.map(i => `${i.name}${i.size ? ' (' + i.size + ')' : ''} x${i.qty}`).join(', ').slice(0, 200),
    }, { headers: headers(), timeout: 30000 }); } catch (e) { throw clean(e); }
    const c = r.data && r.data.consignment;
    if (!c) throw new Error('Steadfast উত্তর বুঝতে পারিনি: ' + JSON.stringify(r.data).slice(0, 200));
    order.courier = { provider: 'steadfast', consignmentId: c.consignment_id, trackingCode: c.tracking_code, status: c.status || 'booked', url: '' };
    order.courier.url = trackUrl(order);
  } else {
    order.courier = { provider: 'mock', consignmentId: 'MOCK' + order.no, trackingCode: 'MOCKTRK' + order.no, status: 'booked', url: '' };
  }
  S.save();
  return order.courier;
}
// Steadfast স্ট্যাটাস মিলিয়ে অর্ডার আপডেট করে; পরিবর্তনগুলো ফেরত দেয় (engine গ্রাহককে জানায়)
async function poll() {
  if (mode() !== 'steadfast') return [];
  const out = [];
  for (const o of S.D().orders.filter(x => x.status === 'shipped' && x.courier && x.courier.provider === 'steadfast')) {
    try {
      const r = await axios.get(base() + '/status_by_cid/' + o.courier.consignmentId, { headers: headers(), timeout: 20000 });
      const st = r.data && r.data.delivery_status; if (!st) continue;
      o.courier.status = st;
      if (st === 'delivered' || st === 'partial_delivered') { O.setStatus(o, 'delivered', { by: 'courier' }); out.push({ order: o, status: 'delivered' }); }
      else if (st === 'cancelled') { O.setStatus(o, 'returned', { by: 'courier', reason: 'কুরিয়ার জানিয়েছে: cancelled' }); out.push({ order: o, status: 'returned' }); }
      S.save();
    } catch (e) { console.error('courier poll', o.no, clean(e).message); }
  }
  return out;
}
module.exports = { book, poll, check, mode, trackUrl, trackText };
