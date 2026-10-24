// মূল ইঞ্জিন: মেসেজ আসা → বোঝা → উত্তর/কার্ড/অর্ডার ফ্লো → টিমকে জানানো
const EventEmitter = require('events');
const S = require('./store'), U = require('./util'), CH = require('./channels'), AI = require('./ai'), O = require('./orders'), Courier = require('./courier');
const D = S.D;
const bus = new EventEmitter(); bus.setMaxListeners(200);
const emit = (type, data) => bus.emit('e', { type, data });
const settings = () => D().settings;
const custOf = c => D().customers.find(x => x.id === c.customerId);
const hon = c => c && c.honorific === 'sir' ? ' স্যার' : c && c.honorific === 'madam' ? ' ম্যাম' : '';
const isLive = c => settings().aiLive || c.tester || c.platform === 'web';

// ---------- ডেটা ----------
function upsertCustomer(platform, ext, name, phone) {
  const d = D(); ext = String(ext);
  let c = d.customers.find(x => x.platform === platform && x.externalId === ext);
  if (!c) {
    c = { id: U.id(), platform, externalId: ext, name: name || '', phone: phone ? U.normPhone(phone) : '', address: '', honorific: '', tags: [], notes: [], tester: false, createdAt: Date.now() };
    d.customers.push(c);
    if (!c.name && (platform === 'messenger' || platform === 'instagram')) CH.profile(platform, ext).then(n => { if (n && !c.name) { c.name = n; S.save(); emit('conv', {}); } });
  }
  if (name && !c.name) c.name = name;
  if (phone && !c.phone) c.phone = U.normPhone(phone);
  return c;
}
function getConv(cust) {
  const d = D();
  let c = d.conversations.find(x => x.customerId === cust.id);
  if (!c) { c = { id: U.id(), customerId: cust.id, platform: cust.platform, mode: 'ai', assignedTo: null, handoverReason: '', humanUntil: null, draft: null, unread: 0, lastAt: Date.now(), lastText: '', createdAt: Date.now() }; d.conversations.push(c); }
  return c;
}
const PREV = { image: '📷 ছবি', audio: '🎤 ভয়েস', cards: '🛍 প্রোডাক্ট কার্ড' };
function addMsg(conv, m) {
  const msg = { id: U.id(), convId: conv.id, at: Date.now(), role: 'system', type: 'text', text: '', mediaUrl: '', meta: {}, ...m };
  D().messages.push(msg);
  if (msg.role !== 'draft') { conv.lastAt = msg.at; conv.lastText = msg.text || PREV[msg.type] || ''; }
  if (msg.role === 'customer') conv.unread = (conv.unread || 0) + 1;
  S.save(); emit('msg', { convId: conv.id, msgId: msg.id });
  return msg;
}
async function say(conv, payload, role = 'ai', extra = {}) {
  const cust = custOf(conv);
  const msg = addMsg(conv, { role, type: payload.type === 'buttons' ? 'text' : payload.type, text: payload.text || payload.caption || '', mediaUrl: payload.url || '', meta: { payload, ...extra } });
  try { await CH.deliver(cust, payload); }
  catch (e) { msg.meta.error = e.response?.data?.error?.message || e.message; S.save(); console.error('পাঠানো ব্যর্থ:', msg.meta.error); emit('msg', { convId: conv.id, msgId: msg.id }); }
  return msg;
}
async function think(conv, text) {
  const c = custOf(conv);
  if (c.platform === 'web') return U.sleep(200);
  await CH.typing(c, true); await U.sleep(Math.min(3500, 700 + String(text || '').length * 20));
}
function notify(userIds, text, convId) {
  const d = D(), targets = userIds ? d.users.filter(u => userIds.includes(u.id)) : d.users;
  targets.forEach(u => d.notifications.push({ id: U.id(), userId: u.id, text, convId, read: false, at: Date.now() }));
  if (d.notifications.length > 600) d.notifications = d.notifications.slice(-400);
  S.save(); emit('notify', { userIds: targets.map(u => u.id), text, convId });
}
function upsertLead(conv, cust, interest, stage) {
  const d = D();
  let l = d.leads.find(x => x.customerId === cust.id && !['won', 'lost'].includes(x.stage));
  if (!l) { l = { id: U.id(), customerId: cust.id, convId: conv ? conv.id : null, interest: '', stage: 'new', followUpAt: null, callNotes: [], createdAt: Date.now() }; d.leads.push(l); }
  if (interest) l.interest = String(interest).slice(0, 120);
  if (stage) l.stage = stage;
  l.updatedAt = Date.now(); S.save(); return l;
}

// ---------- কনটেক্সট ----------
function histLine(m) {
  if (m.role === 'customer') return 'Customer: ' + (m.type === 'image' ? `[sent an image: ${m.meta.desc || ''}] ${m.text}` : m.type === 'audio' ? `[voice]: ${m.text}` : m.text);
  if (m.role === 'ai' || m.role === 'agent') return (m.role === 'ai' ? 'Us(AI): ' : 'Us(team): ') + (m.type === 'cards' ? '[showed product cards: ' + ((m.meta.payload?.items || []).map(i => i.code).join(',')) + ']' : m.text);
  if (m.role === 'system' && m.meta.ctx) return '[context] ' + m.text;
  return '';
}
function buildCtx(conv, cust, text, imageMatch, excludeId, rules) {
  const d = D(), s = settings();
  const products = d.products.filter(p => p.active !== false);
  const catalogText = products.map(p => `${p.code} | ${p.name} | ${U.money(p.price)} | ${p.category || '-'} | ${O.needsSize(p) ? O.variants(p).map(v => `${v.label}:${v.stock > 0 ? v.stock + ' pcs' : 'out'}`).join(', ') : (p.stock > 0 ? 'stock ' + p.stock : 'out of stock')} | ${(p.description || '').replace(/\s+/g, ' ').slice(0, 160)}`).join('\n');
  const history = d.messages.filter(m => m.convId === conv.id && m.id !== excludeId && m.role !== 'draft').slice(-16).map(histLine).filter(Boolean).join('\n');
  const st = O.statsFor(cust);
  const ordersText = st.list.slice(-3).map(o => `#${o.no} ${o.status} | ${o.items.map(i => i.name + (i.size ? ' ' + i.size : '') + ' x' + i.qty).join(', ')} | ${U.money(o.total)}${o.courier ? ' | tracking: ' + (o.courier.url || o.courier.trackingCode) : ''}${o.reason ? ' | reason: ' + o.reason : ''} | ${U.day(o.createdAt)}`).join('\n');
  let draftText = '';
  if (conv.draft) { const dr = conv.draft, p = O.prod(dr.code); draftText = `product=${dr.code} (${p ? p.name : '?'}) size=${dr.size || '-'} qty=${dr.qty} name=${dr.name || '-'} phone=${dr.phone || '-'} address=${dr.address || '-'}; missing=${missing(conv).join(',') || 'none'}; summary_shown=${!!dr.summarySent}`; }
  return { settings: s, rules: rules ?? s.rulesLive, products, catalogText, customer: cust, platform: conv.platform, history, text, imageMatch, ordersText, draftText, stats: `${st.total} orders (${st.delivered} delivered, ${st.returned} returned, ${st.cancelled} cancelled)` };
}

// ---------- অর্ডার ফ্লো ----------
const cardsFor = ps => ps.map(p => ({ code: p.code, title: p.name, subtitle: `${U.money(p.price)}${p.category ? ' · ' + p.category : ''}${O.totalStock(p) <= 0 ? ' · স্টক নেই' : ''}`, image: p.images[0] || '', buttons: [{ title: 'বিস্তারিত', payload: 'DETAILS:' + p.code }, { title: 'অর্ডার করুন', payload: 'BUY:' + p.code }] }));
function missing(conv) {
  const d = conv.draft, p = O.prod(d.code), m = [];
  if (O.needsSize(p) && !d.size) m.push('size');
  if (!d.name) m.push('name');
  if (!U.phoneOk(d.phone)) m.push('phone');
  if (!d.address || d.address.length < 8) m.push('address');
  return m;
}
function mergeFields(conv, cust, f) {
  if (!conv.draft || !f) return false;
  const d = conv.draft, p = O.prod(d.code); let ch = false;
  if (f.size) { const s = O.matchSize(p, f.size); if (s) { if (O.variantStock(p, s) <= 0) d.sizeProblem = s; else if (s !== d.size) { d.size = s; ch = true; } } }
  if (f.name && f.name !== d.name) { d.name = String(f.name).trim(); ch = true; }
  if (f.phone && U.phoneOk(f.phone) && U.normPhone(f.phone) !== d.phone) { d.phone = U.normPhone(f.phone); ch = true; }
  if (f.address && f.address !== d.address) { d.address = String(f.address).trim(); ch = true; }
  if (+f.qty > 0 && +f.qty <= 20 && +f.qty !== d.qty) { d.qty = +f.qty; ch = true; }
  return ch;
}
function heuristics(conv, text, plan) {
  if (!conv.draft) return;
  const f = plan.order_fields = plan.order_fields || {};
  const ph = U.findPhone(text); if (ph && !f.phone) f.phone = ph;
  if (AI.hasAI()) return;
  if (conv.draft.changing) {
    const rest0 = ph ? text.replace(/(?:\+?88)?[০-৯0-9][\s-]?[০-৯0-9]{8,}/, '').trim() : text.trim(), p0 = O.prod(conv.draft.code), sz = O.matchSize(p0, text);
    if (ph) { /* ফোন বদলাবে */ } else if (sz && O.needsSize(p0)) f.size = sz;
    else if (rest0.length >= 8 && /[,\d০-৯]|রোড|road|বাসা|house/i.test(rest0)) f.address = rest0;
    else if (rest0.length && rest0.length <= 40 && !/\d/.test(rest0)) f.name = rest0;
    conv.draft.changing = false; return;
  }
  const p = O.prod(conv.draft.code), miss = missing(conv)[0], rest = ph ? text.replace(/(?:\+?88)?[০-৯0-9][\s-]?[০-৯0-9]{8,}/, '').trim() : text.trim();
  if (miss === 'size') { const s = O.matchSize(p, text); if (s) f.size = s; }
  else if (miss === 'name' && !ph && rest.length <= 40 && !/\d/.test(rest)) f.name = f.name || rest;
  else if (miss === 'address' && rest.length >= 8) f.address = f.address || rest;
}
async function startOrder(conv, cust, code, ack) {
  const p = O.prod(code);
  if (!p || p.active === false) return say(conv, { type: 'text', text: 'দুঃখিত, প্রোডাক্টটা খুঁজে পাচ্ছি না। অন্য কিছু দেখবেন?' });
  if (O.totalStock(p) <= 0) return outOfStock(conv, cust, p);
  conv.draft = { code: p.code, qty: 1, size: '', name: cust.name || '', phone: cust.phone || '', address: cust.address || '', summarySent: false };
  upsertLead(conv, cust, p.name);
  if (ack) await say(conv, { type: 'text', text: `দারুণ পছন্দ${hon(cust)}! 😊 ${p.name} অর্ডারের জন্য কয়েকটা তথ্য লাগবে।` });
  await continueOrder(conv, cust);
}
async function outOfStock(conv, cust, p) {
  const alt = D().products.filter(x => x.active !== false && x.code !== p.code && O.totalStock(x) > 0).sort((a, b) => (b.category === p.category) - (a.category === p.category)).slice(0, 3);
  await say(conv, { type: 'text', text: `দুঃখিত${hon(cust)}, ${p.name} এই মুহূর্তে স্টকে নেই 🙏${alt.length ? ' তবে এই প্রোডাক্টগুলো আপনার পছন্দ হতে পারে 👇' : ' স্টক এলে আপনাকে জানাতে পারি।'}` });
  if (alt.length) await say(conv, { type: 'cards', items: cardsFor(alt) });
}
async function ask(conv, cust, field, p) {
  const h = hon(cust);
  if (field === 'size') {
    const sizes = O.inStockSizes(p), t = `কোন সাইজটা নেবেন${h}? (আছে: ${sizes.join(', ')})`;
    return say(conv, sizes.length <= 3 ? { type: 'buttons', text: t, buttons: sizes.map(s => ({ title: s, payload: 'SIZE:' + s })) } : { type: 'text', text: t });
  }
  const q = { name: `আপনার নামটা বলবেন${h}?`, phone: `ডেলিভারির জন্য মোবাইল নম্বরটা দিন${h} (যেমন 01XXXXXXXXX)`, address: `পুরো ঠিকানাটা লিখে দিন${h}: এলাকা/গ্রাম, থানা, জেলা` }[field];
  return say(conv, { type: 'text', text: q });
}
async function continueOrder(conv, cust, { changed } = {}) {
  const d = conv.draft; if (!d) return;
  const p = O.prod(d.code);
  if (d.sizeProblem) { const s = O.inStockSizes(p); await say(conv, { type: 'text', text: `দুঃখিত${hon(cust)}, ${d.sizeProblem} সাইজ স্টকে নেই।${s.length ? ' আছে: ' + s.join(', ') : ''}` }); d.sizeProblem = ''; }
  const m = missing(conv);
  if (m.length) { d.summarySent = false; return ask(conv, cust, m[0], p); }
  if (!d.summarySent || changed) {
    const delivery = O.deliveryFor(d.address), sub = p.price * d.qty, h = hon(cust);
    d.summarySent = true;
    await say(conv, { type: 'buttons', text: `📝 অর্ডার সামারি\n🛍 ${p.name}${d.size ? ' (' + d.size + ')' : ''} × ${d.qty} = ${U.money(sub)}\n🚚 ডেলিভারি: ${U.money(delivery)}\n💰 মোট: ${U.money(sub + delivery)} (ক্যাশ অন ডেলিভারি)\n👤 ${d.name}\n📞 ${d.phone}\n📍 ${d.address}\n\nসব ঠিক থাকলে কনফার্ম করুন${h} 👇`, buttons: [{ title: '✅ কনফার্ম', payload: 'CONFIRM' }, { title: '✏️ বদলাব', payload: 'CHANGE' }, { title: '❌ বাতিল', payload: 'CANCEL' }] });
  }
}
function invoiceText(o, cust) {
  const it = o.items[0];
  return `✅ অর্ডার কনফার্ম হয়েছে!\n🧾 অর্ডার নং: #${o.no}\n🛍 ${o.items.map(i => `${i.name}${i.size ? ' (' + i.size + ')' : ''} × ${i.qty} = ${U.money(i.price * i.qty)}`).join('\n🛍 ')}\n🚚 ডেলিভারি চার্জ: ${U.money(o.delivery)}\n💰 মোট: ${U.money(o.total)} (ক্যাশ অন ডেলিভারি)\n\n👤 ${o.name}\n📞 ${o.phone}\n📍 ${o.address}\n\n⏱ আনুমানিক ডেলিভারি: ${settings().deliveryDays}\nআমাদের সাথে থাকার জন্য ধন্যবাদ${hon(cust)} 🙏`;
}
async function sendInvoice(conv, cust, o) {
  if (o.items[0].image) await say(conv, { type: 'image', url: o.items[0].image, caption: '' });
  await say(conv, { type: 'text', text: invoiceText(o, cust) });
}
async function confirmOrder(conv, cust, by = 'ai') {
  const d = conv.draft;
  if (!d) return say(conv, { type: 'text', text: 'এই মুহূর্তে কোনো চলমান অর্ডার নেই। কিছু দেখবেন?' });
  if (missing(conv).length) return continueOrder(conv, cust);
  const r = O.place({ conv, cust, draft: d, by });
  if (r.error) { conv.draft = null; const p = O.prod(d.code); return p ? outOfStock(conv, cust, p) : null; }
  const o = r.order; conv.draft = null; conv.awaiting = false;
  cust.name = cust.name || o.name; cust.phone = o.phone; cust.address = o.address;
  D().leads.filter(l => l.customerId === cust.id && !['won', 'lost'].includes(l.stage)).forEach(l => { l.stage = 'won'; });
  S.save();
  await sendInvoice(conv, cust, o);
  notify(null, `🛒 নতুন অর্ডার #${o.no}: ${o.name}, ${U.money(o.total)}`, conv.id); emit('order', { id: o.id });
}
async function details(conv, cust, p) {
  const sizes = O.needsSize(p) ? '\n📏 সাইজ: ' + O.variants(p).map(v => v.label).join(', ') : '';
  const s = settings();
  for (const img of p.images.slice(0, 3)) await say(conv, { type: 'image', url: img, caption: '' });
  await say(conv, { type: 'buttons', text: `${p.name}\n💰 দাম: ${U.money(p.price)}\n${p.description || ''}${sizes}\n📦 ${O.stockText(p)}\n🚚 ডেলিভারি: ঢাকার ভেতরে ${U.money(s.deliveryInside)}, বাইরে ${U.money(s.deliveryOutside)} (${s.deliveryDays})\n💵 ক্যাশ অন ডেলিভারি`, buttons: [{ title: 'অর্ডার করুন', payload: 'BUY:' + p.code }] });
}
async function handleRating(conv, cust, v) {
  const o = D().orders.filter(x => x.customerId === cust.id && x.status === 'delivered' && !x.rating).pop();
  if (o) o.rating = v;
  const s = settings(), h = hon(cust);
  if (v === 'bad') { await say(conv, { type: 'text', text: `আপনার অভিজ্ঞতা ভালো হয়নি জেনে সত্যিই দুঃখিত${h} 🙏 আমাদের টিম আপনার সাথে কথা বলবে।` }); return handover(conv, `অসন্তুষ্ট রিভিউ${o ? ' (অর্ডার #' + o.no + ')' : ''}`, 'SKIP'); }
  await say(conv, { type: 'text', text: `ধন্যবাদ${h}! 😊 আপনার মতামত আমাদের অনুপ্রেরণা।${v === 'good' && s.reviewLink ? '\nসময় পেলে একটা রিভিউ দিলে খুশি হব: ' + s.reviewLink : ''}` });
}
async function handlePostback(conv, cust, payload) {
  const i = payload.indexOf(':'), cmd = i < 0 ? payload : payload.slice(0, i), arg = i < 0 ? '' : payload.slice(i + 1);
  switch (cmd) {
    case 'DETAILS': { const p = O.prod(arg); if (p) await details(conv, cust, p); return true; }
    case 'BUY': await startOrder(conv, cust, arg, true); return true;
    case 'SIZE': if (conv.draft) { mergeFields(conv, cust, { size: arg }); await continueOrder(conv, cust, { changed: true }); } return true;
    case 'CONFIRM': await confirmOrder(conv, cust); return true;
    case 'CHANGE': if (conv.draft) { conv.draft.summarySent = false; conv.draft.changing = true; await say(conv, { type: 'text', text: `কোনটা বদলাতে চান${hon(cust)}? নতুন তথ্যটা লিখে দিন (নাম / ফোন / ঠিকানা / সাইজ)।` }); } return true;
    case 'CANCEL': conv.draft = null; await say(conv, { type: 'text', text: `ঠিক আছে${hon(cust)}, অর্ডারটা বাতিল রাখলাম। আর কিছু লাগলে জানাবেন 😊` }); return true;
    case 'RATE': await handleRating(conv, cust, arg); return true;
  }
  return false;
}

// ---------- হ্যান্ডওভার ----------
async function handover(conv, reason, reply) {
  const cust = custOf(conv);
  conv.mode = 'human'; conv.handoverReason = reason || ''; conv.assignedTo = null; conv.humanUntil = null;
  if (reply !== 'SKIP') await say(conv, { type: 'text', text: reply || `ধন্যবাদ${hon(cust)}! আমাদের টিমের একজন এখনই আপনার সাথে কথা বলবেন, একটু অপেক্ষা করুন 🙏` });
  addMsg(conv, { role: 'system', text: '🙋 মানুষের সাহায্য দরকার: ' + (reason || '') });
  notify(null, `🙋 ${cust.name || 'কাস্টমার'}: ${reason || 'টিমের সাহায্য দরকার'}`, conv.id);
  S.save(); emit('conv', { convId: conv.id });
}
async function backToAI(conv) {
  conv.mode = 'ai'; conv.humanUntil = null; conv.handoverReason = ''; conv.assignedTo = null;
  addMsg(conv, { role: 'system', text: '🤖 চ্যাট আবার AI-এর হাতে' }); emit('conv', { convId: conv.id });
}
function claim(conv, user, minutes) {
  conv.mode = 'human'; conv.assignedTo = user.id; conv.humanUntil = +minutes > 0 ? Date.now() + minutes * 60000 : null; conv.unread = 0;
  addMsg(conv, { role: 'system', text: `👤 ${user.name} চ্যাটটা নিয়েছেন${+minutes > 0 ? ' (' + minutes + ' মিনিট)' : ''}` }); emit('conv', { convId: conv.id });
}
function assign(conv, user, by) {
  conv.mode = 'human'; conv.assignedTo = user ? user.id : null; conv.humanUntil = null;
  addMsg(conv, { role: 'system', text: user ? `👤 ${by.name} চ্যাটটা ${user.name}-কে দিয়েছেন` : 'চ্যাট unassigned' });
  if (user && user.id !== by.id) notify([user.id], `📌 ${by.name} আপনাকে একটা চ্যাট দিয়েছেন: ${custOf(conv).name || 'কাস্টমার'}`, conv.id);
  emit('conv', { convId: conv.id });
}
async function agentSend(conv, user, text) {
  if (conv.mode !== 'human') claim(conv, user, settings().handoverMinutes);
  conv.unread = 0;
  return say(conv, { type: 'text', text }, 'agent', { by: user.name });
}

// ---------- প্ল্যান চালানো ----------
async function executePlan(conv, cust, plan, text) {
  const c = plan.customer || {};
  if (plan.honorific) cust.honorific = plan.honorific;
  if (c.name && !cust.name) cust.name = c.name;
  if (c.phone && U.phoneOk(c.phone)) cust.phone = U.normPhone(c.phone);
  if (c.address && c.address.length > 8 && !cust.address) cust.address = c.address;
  let changed = conv.draft ? mergeFields(conv, cust, plan.order_fields) : false;
  if (plan.action === 'handover') { await handover(conv, plan.handover_reason, plan.reply); return; }
  if (plan.reply) { await think(conv, plan.reply); await say(conv, { type: 'text', text: plan.reply }); }
  if (plan.action === 'show_products') {
    const ps = plan.product_codes.map(O.prod).filter(p => p && p.active !== false);
    if (ps.length) { await say(conv, { type: 'cards', items: cardsFor(ps) }); conv.awaiting = true; }
  } else if (plan.action === 'start_order') { await startOrder(conv, cust, plan.product_codes[0], !plan.reply); S.save(); return; }
  else if (plan.action === 'confirm_order') { await confirmOrder(conv, cust); S.save(); return; }
  else if (plan.action === 'cancel_order') { conv.draft = null; if (!plan.reply) await say(conv, { type: 'text', text: `ঠিক আছে${hon(cust)}, অর্ডারটা বাতিল রাখলাম 😊` }); }
  if (plan.intent === 'price') conv.awaiting = true;
  if (plan.lead_interest) upsertLead(conv, cust, plan.lead_interest);
  if (conv.draft && plan.action !== 'cancel_order') await continueOrder(conv, cust, { changed });
  S.save();
}

// ---------- আসা মেসেজ ----------
const queues = new Map();
function enqueue(ev) {
  const k = ev.platform + ':' + ev.externalId;
  const p = (queues.get(k) || Promise.resolve()).then(() => handleIncoming(ev)).catch(e => console.error('handleIncoming:', e));
  queues.set(k, p); p.finally(() => { if (queues.get(k) === p) queues.delete(k); });
  return p;
}
async function handleIncoming(ev) {
  const cust = upsertCustomer(ev.platform, ev.externalId, ev.name, ev.phone);
  if (ev.waPhoneId) cust.waPhoneId = ev.waPhoneId;
  const conv = getConv(cust);
  conv.lastCustomerAt = Date.now(); conv.followupSent = false; conv.awaiting = false;
  let text = ev.text || '', type = 'text', mediaUrl = '', meta = {}, img = null;
  if (ev.media) {
    try {
      const m = ev.media.buf ? ev.media : await CH.fetchMedia(ev.platform, ev.media.url || ev.media.id);
      mediaUrl = U.saveUpload(m.buf, m.mime); type = ev.media.kind;
      if (type === 'image') { img = m; const ds = await AI.describeImage(m.buf, m.mime); meta.desc = ds.description || ''; meta.code = ds.visible_code || ''; }
      else { meta.transcript = await AI.transcribe(m.buf, m.mime); text = meta.transcript || text; }
    } catch (e) { console.error('মিডিয়া:', e.message); meta.error = 'মিডিয়া নামানো যায়নি'; }
  }
  const msg = ev.postback ? null : addMsg(conv, { role: 'customer', type, text, mediaUrl, meta });
  if (ev.postback) addMsg(conv, { role: 'customer', type: 'text', text: '🔘 ' + (ev.text || ev.postback), meta: { postback: ev.postback } });
  if (conv.mode === 'human') {
    if (conv.humanUntil && Date.now() > conv.humanUntil) await backToAI(conv);
    else { notify(conv.assignedTo ? [conv.assignedTo] : null, `💬 ${cust.name || 'কাস্টমার'}: ${(text || ev.text || '').slice(0, 60) || 'নতুন মেসেজ'}`, conv.id); return; }
  }
  const live = isLive(cust);
  if (ev.postback) { if (live && await handlePostback(conv, cust, ev.postback)) { S.save(); return; } if (!live) return; text = ev.text || ''; }
  await CH.markSeen(cust, ev.msgId);
  let imageMatch = '';
  if (type === 'image') {
    const m = AI.hasAI() ? await AI.matchImage(img.buf, img.mime, D().products.filter(p => p.active !== false)) : null;
    if (m) { msg.meta.match = m; imageMatch = `${m.description || meta.desc || ''} | catalog matches: ${(m.codes || []).join(', ') || 'none'} (confidence ${m.confidence || '?'})`; }
    else imageMatch = meta.desc || '(ছবি, বর্ণনা নেই)';
  }
  const ctx = buildCtx(conv, cust, text || (type === 'image' ? '[ছবি পাঠিয়েছে]' : ''), imageMatch, msg && msg.id);
  const plan = await AI.brain(ctx);
  heuristics(conv, text, plan);
  if (!live) { addMsg(conv, { role: 'draft', text: plan.reply || '(টেক্সট নেই)', meta: { plan, text } }); S.save(); return; }
  await executePlan(conv, cust, plan, text);
}

// ---------- অর্ডার স্ট্যাটাসের খবর গ্রাহককে ----------
async function notifyOrder(o, status) {
  const conv = o.convId && D().conversations.find(c => c.id === o.convId); if (!conv) return;
  const cust = custOf(conv), h = hon(cust);
  if (status === 'processing') await say(conv, { type: 'text', text: `📦 আপনার অর্ডার #${o.no} প্রসেস হচ্ছে${h}। শীঘ্রই কুরিয়ারে দেওয়া হবে।` });
  if (status === 'shipped') await say(conv, { type: 'text', text: `🚚 আপনার অর্ডার #${o.no} কুরিয়ারে দেওয়া হয়েছে${h}!${o.courier ? `\n📍 ট্র্যাকিং কোড: ${o.courier.trackingCode}${o.courier.url ? '\n🔗 ' + o.courier.url : ''}` : ''}\n⏱ আনুমানিক ডেলিভারি: ${settings().deliveryDays}\nকুরিয়ার কল করলে ফোনটা ধরবেন 🙏` });
  if (status === 'delivered') await say(conv, { type: 'buttons', text: `🎉 আপনার অর্ডার #${o.no} ডেলিভারি হয়েছে${h}। আমাদের থেকে কেনার জন্য ধন্যবাদ! পণ্যটা কেমন লাগল?`, buttons: [{ title: '😍 দারুণ', payload: 'RATE:good' }, { title: '🙂 ঠিক আছে', payload: 'RATE:ok' }, { title: '☹️ ভালো না', payload: 'RATE:bad' }] });
  if (status === 'cancelled') await say(conv, { type: 'text', text: `আপনার অর্ডার #${o.no} বাতিল করা হয়েছে${h}।${o.reason ? ' কারণ: ' + o.reason : ''} আবার কিছু লাগলে জানাবেন 🙏` });
  emit('order', { id: o.id });
}

// ---------- কমেন্ট ----------
async function handleComment({ platform, commentId, postId, text, fromName }) {
  const s = settings(); if (!s.commentReplyEnabled) return;
  const prods = D().products.filter(p => p.active !== false && (p.postIds || []).some(x => postId && (x === postId || String(postId).endsWith('_' + x) || x.endsWith('_' + postId))));
  const plan = await AI.commentPlan({ settings: s, commenter: fromName || 'আপনি', comment: text, products: prods });
  try { await CH.replyComment(platform, commentId, plan.public_reply); } catch (e) { console.error('কমেন্ট রিপ্লাই:', e.response?.data?.error?.message || e.message); }
  try {
    const r = await CH.privateReply(platform, commentId, plan.dm);
    if (r.recipient_id) {
      const cust = upsertCustomer(platform, r.recipient_id, fromName), conv = getConv(cust);
      addMsg(conv, { role: 'system', text: `💬 পোস্টে কমেন্ট করেছিলেন: "${text}"${prods.length ? ' (প্রোডাক্ট: ' + prods.map(p => p.name).join(', ') + ')' : ''}`, meta: { ctx: true } });
      addMsg(conv, { role: 'ai', text: plan.dm }); conv.awaiting = true; conv.lastCustomerAt = Date.now();
      if (prods[0]) upsertLead(conv, cust, prods[0].name);
      S.save();
    }
  } catch (e) { console.error('প্রাইভেট রিপ্লাই:', e.response?.data?.error?.message || e.message); }
}

// ---------- ডেস্ক টেস্ট ----------
async function testPlan(message, rules) {
  const cust = { name: 'টেস্ট কাস্টমার', phone: '', honorific: '', platform: 'web' };
  const conv = { id: '__test__', platform: 'web', draft: null };
  return AI.brain(buildCtx(conv, { ...cust, id: '__t' }, message, '', null, rules));
}

// ---------- ব্যাকগ্রাউন্ড টিক ----------
let ticks = 0;
async function tick() {
  const d = D(), now = Date.now(), s = settings();
  for (const c of d.conversations) if (c.mode === 'human' && c.humanUntil && now > c.humanUntil) await backToAI(c);
  if (s.followupEnabled) {
    for (const c of d.conversations) {
      if (c.mode !== 'ai' || !c.awaiting || c.followupSent || !c.lastCustomerAt || c.draft) continue;
      const age = now - c.lastCustomerAt, cust = custOf(c);
      if (age > s.followupHours * 3600e3 && age < 23 * 3600e3 && isLive(cust)) {
        c.followupSent = true; const last = d.leads.filter(l => l.customerId === cust.id).pop();
        const fallback = `${cust.name ? cust.name + hon(cust) + ', ' : ''}আপনি যে প্রোডাক্টটা দেখছিলেন সেটা এখনো স্টকে আছে 😊 অর্ডার করতে চাইলে বা কিছু জানার থাকলে এখানেই লিখুন।`;
        const t = await AI.smallText(`Write ONE short, warm, non-pushy Bangla follow-up message (max 2 lines) from the shop "${s.businessName}" to a customer${cust.name ? ' named ' + cust.name : ''} who was looking at: ${last ? last.interest : 'our products'} and went silent. Do not invent offers. Plain text only.`, fallback);
        await say(c, { type: 'text', text: t });
      }
    }
  }
  if (++ticks % 10 === 0) for (const r of await Courier.poll()) await notifyOrder(r.order, r.status);
}
setInterval(() => tick().catch(e => console.error('tick', e)), 60000);

module.exports = { bus, emit, enqueue, say, addMsg, notify, custOf, claim, assign, backToAI, handover, agentSend, notifyOrder, sendInvoice, upsertLead, handleComment, testPlan, executePlan, hon, getConv, upsertCustomer, tick };
