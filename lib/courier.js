const axios = require('axios');
const S = require('./store'), O = require('./orders');
const mode = () => process.env.COURIER_MODE || 'mock';
const base = () => process.env.STEADFAST_BASE || 'https://portal.packzy.com/api/v1';
// ত্রুটির পুরো অবজেক্ট (যাতে key/secret থাকে) না ছাপিয়ে শুধু Steadfast-এর আসল বার্তা দেখাই
function clean(e) {
  if (!e.response) return new Error('Steadfast-এ পৌঁছানো যায়নি: ' + e.message);
  let d = e.response.data; d = typeof d === 'string' ? d : JSON.stringify(d || {});
  return new Error(`Steadfast ${e.response.status}: ${d.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200)}`);
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
    if (!process.env.STEADFAST_API_KEY || !process.env.STEADFAST_SECRET_KEY) throw new Error('STEADFAST_API_KEY/SECRET_KEY .env-এ নেই');
    let r;
    try { r = await axios.post(base() + '/create_order', {
      invoice: String(order.no), recipient_name: order.name, recipient_phone: order.phone,
      recipient_address: order.address.slice(0, 250), cod_amount: order.paid ? 0 : order.total,
      note: order.items.map(i => `${i.name}${i.size ? ' (' + i.size + ')' : ''} x${i.qty}`).join(', ').slice(0, 200),
    }, { headers: { 'Api-Key': process.env.STEADFAST_API_KEY, 'Secret-Key': process.env.STEADFAST_SECRET_KEY, 'Content-Type': 'application/json' }, timeout: 30000 }); } catch (e) { throw clean(e); }
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
      const r = await axios.get(base() + '/status_by_cid/' + o.courier.consignmentId, { headers: { 'Api-Key': process.env.STEADFAST_API_KEY, 'Secret-Key': process.env.STEADFAST_SECRET_KEY }, timeout: 20000 });
      const st = r.data && r.data.delivery_status; if (!st) continue;
      o.courier.status = st;
      if (st === 'delivered' || st === 'partial_delivered') { O.setStatus(o, 'delivered', { by: 'courier' }); out.push({ order: o, status: 'delivered' }); }
      else if (st === 'cancelled') { O.setStatus(o, 'returned', { by: 'courier', reason: 'কুরিয়ার জানিয়েছে: cancelled' }); out.push({ order: o, status: 'returned' }); }
      S.save();
    } catch (e) { console.error('courier poll', o.no, clean(e).message); }
  }
  return out;
}
module.exports = { book, poll, mode, trackUrl, trackText };
