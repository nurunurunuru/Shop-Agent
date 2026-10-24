const S = require('./store'), U = require('./util');
const D = S.D;

const prod = code => D().products.find(p => p.code === code);
const variants = p => (p && p.variants) || [];
const needsSize = p => variants(p).length > 0;
const totalStock = p => needsSize(p) ? variants(p).reduce((a, v) => a + (+v.stock || 0), 0) : (+p.stock || 0);
const variantStock = (p, label) => (variants(p).find(v => v.label === label) || {}).stock | 0;
const inStockSizes = p => variants(p).filter(v => v.stock > 0).map(v => v.label);
function matchSize(p, txt) {
  const t = String(txt || '').trim().toLowerCase();
  if (!t) return '';
  const vs = variants(p);
  const exact = vs.find(v => v.label.toLowerCase() === t);
  if (exact) return exact.label;
  const tokens = t.split(/[\s,/]+/);
  return (vs.find(v => v.label.toLowerCase().split(/[\s,/]+/).some(x => tokens.includes(x))) || {}).label || '';
}
function stockText(p) {
  if (needsSize(p)) { const s = inStockSizes(p); return s.length ? 'স্টকে আছে: ' + s.join(', ') : 'এই মুহূর্তে স্টকে নেই'; }
  return totalStock(p) > 0 ? 'স্টকে আছে' : 'এই মুহূর্তে স্টকে নেই';
}
function deliveryFor(address) {
  const a = String(address || '').toLowerCase();
  if (/ঢাকার বাইরে|outside dhaka/.test(a)) return +D().settings.deliveryOutside;
  const inside = /ঢাকা|dhaka|মিরপুর|mirpur|উত্তরা|uttara|গুলশান|gulshan|ধানমন্ডি|dhanmondi|মোহাম্মদপুর|mohammadpur|বাড্ডা|badda|রামপুরা|rampura|বনানী|banani|মতিঝিল|motijheel|যাত্রাবাড়ী|jatrabari|তেজগাঁও|tejgaon|মালিবাগ|malibagh|খিলগাঁও|khilgaon/.test(a);
  return +(inside ? D().settings.deliveryInside : D().settings.deliveryOutside);
}
function place({ conv, cust, draft, by }) {
  const p = prod(draft.code);
  if (!p) return { error: 'notfound' };
  const qty = Math.max(1, +draft.qty || 1);
  if (needsSize(p)) { if (variantStock(p, draft.size) < qty) return { error: 'stock', available: inStockSizes(p) }; }
  else if ((+p.stock || 0) < qty) return { error: 'stock', available: [] };
  if (needsSize(p)) variants(p).find(v => v.label === draft.size).stock -= qty; else p.stock -= qty;
  const d = D(), no = ++d.counters.order, delivery = deliveryFor(draft.address), subtotal = p.price * qty;
  const order = {
    id: U.id(), no, convId: conv ? conv.id : null, customerId: cust ? cust.id : null,
    items: [{ code: p.code, name: p.name, size: draft.size || '', qty, price: p.price, image: p.images[0] || '' }],
    name: draft.name, phone: U.normPhone(draft.phone), address: draft.address,
    subtotal, delivery, total: subtotal + delivery, payment: 'COD', paid: false, status: 'pending',
    history: [{ status: 'pending', at: Date.now(), by }], courier: null, notes: [], reason: '', rating: '', createdBy: by, createdAt: Date.now(),
  };
  d.orders.push(order); S.save();
  return { order };
}
const FLOW = { pending: ['processing', 'shipped', 'cancelled'], processing: ['shipped', 'cancelled'], shipped: ['delivered', 'returned', 'cancelled'], delivered: ['returned'], cancelled: [], returned: [] };
function setStatus(order, status, { by = 'system', reason = '' } = {}) {
  if (!(FLOW[order.status] || []).includes(status)) return { error: `${order.status} থেকে ${status} করা যায় না` };
  if ((status === 'cancelled' || status === 'returned') && !order.stockRestored) {
    for (const it of order.items) {
      const p = prod(it.code); if (!p) continue;
      if (needsSize(p)) { const v = variants(p).find(x => x.label === it.size); if (v) v.stock += it.qty; } else p.stock = (+p.stock || 0) + it.qty;
    }
    order.stockRestored = true;
  }
  order.status = status; if (reason) order.reason = reason;
  order.history.push({ status, at: Date.now(), by, note: reason });
  S.save();
  return { order };
}
function statsFor(cust) {
  const d = D();
  const list = d.orders.filter(o => o.customerId === cust.id || (cust.phone && U.normPhone(o.phone) === U.normPhone(cust.phone)));
  const c = s => list.filter(o => o.status === s).length;
  return { total: list.length, delivered: c('delivered'), returned: c('returned'), cancelled: c('cancelled'), list };
}
module.exports = { prod, needsSize, totalStock, variantStock, inStockSizes, matchSize, stockText, deliveryFor, place, setStatus, statsFor, variants };
