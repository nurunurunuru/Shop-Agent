const router = require('express').Router();
const path = require('path'), fs = require('fs');
const S = require('../lib/store'), U = require('../lib/util'), A = require('../lib/auth'), E = require('../lib/engine'), O = require('../lib/orders'), AI = require('../lib/ai'), Courier = require('../lib/courier'), CH = require('../lib/channels');
const D = S.D, need = A.need;
const w = fn => (req, res) => Promise.resolve(fn(req, res)).catch(e => { console.error(e.isAxiosError ? 'axios: ' + e.message : e); res.status(e.status || 500).json({ error: e.message }); });
const bad = (m, status = 400) => { const e = new Error(m); e.status = status; throw e; };
const needAny = (...ps) => (req, res, next) => ps.some(p => A.can(req.user, p)) ? next() : res.status(403).json({ error: 'এই কাজের অনুমতি আপনার নেই' });
const conv = (id, req) => {
  const c = D().conversations.find(x => x.id === id) || bad('চ্যাট পাওয়া যায়নি', 404);
  if (req && req.user.role !== 'owner' && req.user.restrictChats && c.assignedTo !== req.user.id) bad('এই চ্যাট আপনাকে দেওয়া হয়নি', 403);
  return c;
};
const cust = id => D().customers.find(c => c.id === id) || bad('কাস্টমার পাওয়া যায়নি', 404);
const order = id => D().orders.find(o => o.id === id) || bad('অর্ডার পাওয়া যায়নি', 404);
const str = (v, n = 500) => String(v == null ? '' : v).trim().slice(0, n);
const nameOf = u => u.name || (u.platform === 'whatsapp' ? '+' + u.externalId : u.platform === 'web' ? 'ওয়েব কাস্টমার' : 'ইউজার …' + String(u.externalId).slice(-4));

// ---------- SSE ----------
router.get('/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.write('retry: 3000\n\n');
  const on = ev => { if (ev.type === 'notify' && !ev.data.userIds.includes(req.user.id)) return; res.write(`event: ${ev.type}\ndata: ${JSON.stringify(ev.data)}\n\n`); };
  E.bus.on('e', on);
  const ka = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => { E.bus.off('e', on); clearInterval(ka); });
});
router.get('/me', (req, res) => res.json({ user: A.pub(req.user), settings: { aiLive: D().settings.aiLive, hasAI: AI.hasAI(), courier: Courier.mode(), publicUrl: process.env.PUBLIC_URL || '', businessName: D().settings.businessName } }));

// ---------- ইনবক্স ----------
const view = c => {
  const u = E.custOf(c), sc = E.score(u, c);
  return { id: c.id, customerId: u.id, name: nameOf(u), hasName: !!u.name, avatar: u.avatar || '', platform: c.platform, mode: c.mode, assignedTo: c.assignedTo, unread: c.unread || 0, lastText: c.lastText, lastAt: c.lastAt, handoverReason: c.handoverReason, phone: u.phone, tags: u.tags || [], priority: sc.priority, why: sc.why, kind: sc.kind, purchased: sc.purchased, hasDraft: D().messages.some(m => m.convId === c.id && m.role === 'draft') };
};
router.get('/conversations', needAny('inbox'), (req, res) => {
  const { q = '', filter = 'all', platform = '', priority = '', kind = '', tag = '', assignee = '', purchased = '' } = req.query, d = D();
  let list = d.conversations.slice();
  if (req.user.role !== 'owner' && req.user.restrictChats) list = list.filter(c => c.assignedTo === req.user.id);
  if (platform) list = list.filter(c => c.platform === platform);
  if (filter === 'human') list = list.filter(c => c.mode === 'human');
  if (filter === 'mine') list = list.filter(c => c.assignedTo === req.user.id);
  if (filter === 'unassigned') list = list.filter(c => c.mode === 'human' && !c.assignedTo);
  if (filter === 'unread') list = list.filter(c => c.unread > 0);
  if (assignee) list = list.filter(c => assignee === 'none' ? !c.assignedTo : c.assignedTo === assignee);
  if (tag) list = list.filter(c => (E.custOf(c).tags || []).includes(tag));
  if (priority || kind || purchased) list = list.filter(c => { const sc = E.score(E.custOf(c), c); return (!priority || sc.priority === priority) && (!kind || sc.kind === kind) && (!purchased || sc.purchased); });
  if (q.trim()) {
    const s = q.trim().toLowerCase(), digits = U.bn(q).replace(/\D/g, '');
    const hit = new Set(d.messages.filter(m => (m.text || '').toLowerCase().includes(s)).map(m => m.convId));
    list = list.filter(c => {
      const u = E.custOf(c);
      return (u.name || '').toLowerCase().includes(s) || (digits.length >= 3 && U.normPhone(u.phone).includes(digits)) || hit.has(c.id)
        || d.orders.some(o => o.convId === c.id && (String(o.no) === s.replace('#', '') || (U.normPhone(o.phone).includes(digits) && digits.length >= 3)));
    });
  }
  const tags = [...new Set(d.customers.flatMap(c => c.tags || []))].sort();
  res.json({ list: list.sort((a, b) => b.lastAt - a.lastAt).slice(0, 200).map(view), tags });
});
router.get('/conversations/:id', needAny('inbox'), w(async (req, res) => {
  const c = conv(req.params.id, req), u = E.custOf(c), d = D();
  c.unread = 0; S.save();
  const st = O.statsFor(u);
  res.json({
    conv: { ...view(c), draft: c.draft, humanUntil: c.humanUntil },
    customer: { ...u, displayName: nameOf(u) }, messages: d.messages.filter(m => m.convId === c.id).slice(-300),
    score: E.score(u, c),
    stats: { total: st.total, delivered: st.delivered, returned: st.returned, cancelled: st.cancelled },
    orders: st.list.slice().reverse().map(o => ({ id: o.id, no: o.no, status: o.status, total: o.total, at: o.createdAt })),
    lead: d.leads.filter(l => l.customerId === u.id).pop() || null,
    related: u.phone ? d.customers.filter(x => x.id !== u.id && x.phone && U.normPhone(x.phone) === U.normPhone(u.phone)).map(x => ({ id: x.id, platform: x.platform, name: x.name })) : [],
  });
}));
router.post('/conversations/:id/send', needAny('inbox'), w(async (req, res) => {
  const text = str(req.body.text, 2000); if (!text) bad('মেসেজ লিখুন');
  await E.agentSend(conv(req.params.id, req), req.user, text); res.json({ ok: true });
}));
router.post('/conversations/:id/attach', needAny('inbox'), w(async (req, res) => {
  const c = conv(req.params.id, req), files = Array.isArray(req.body.files) ? req.body.files : [];
  if (!files.length) bad('ফাইল বাছুন');
  for (const f of files) {
    if (!/^\/uploads\/[\w.-]+$/.test(String(f.url))) bad('ফাইলের ঠিকানা ভুল');
    await E.agentSendFile(c, req.user, { url: f.url, kind: ['image', 'video', 'file'].includes(f.kind) ? f.kind : 'file', name: str(f.name, 100) });
  }
  res.json({ ok: true });
}));
router.post('/conversations/:id/send-products', needAny('inbox'), w(async (req, res) => {
  const m = await E.agentSendProducts(conv(req.params.id, req), req.user, (req.body.codes || []).map(String).slice(0, 10)); if (!m) bad('প্রোডাক্ট বাছুন');
  res.json({ ok: true });
}));
router.post('/conversations/:id/mode', needAny('inbox'), w(async (req, res) => {
  const c = conv(req.params.id, req);
  if (req.body.mode === 'ai') await E.backToAI(c); else E.claim(c, req.user, +req.body.minutes || 0);
  S.save(); res.json({ ok: true });
}));
router.post('/conversations/:id/assign', needAny('inbox'), w(async (req, res) => {
  const u = req.body.userId ? D().users.find(x => x.id === req.body.userId) || bad('ইউজার নেই') : null;
  E.assign(conv(req.params.id, req), u, req.user); S.save(); res.json({ ok: true });
}));
router.post('/conversations/:id/drafts/:mid/send', needAny('inbox'), w(async (req, res) => {
  const c = conv(req.params.id, req), d = D(), i = d.messages.findIndex(m => m.id === req.params.mid && m.role === 'draft');
  if (i < 0) bad('ড্রাফট নেই', 404);
  const m = d.messages[i]; d.messages.splice(i, 1);
  if (req.body.text) m.meta.plan.reply = str(req.body.text, 2000);
  await E.executePlan(c, E.custOf(c), m.meta.plan, m.meta.text); res.json({ ok: true });
}));
router.post('/conversations/:id/drafts/:mid/discard', needAny('inbox'), w(async (req, res) => {
  const d = D(); d.messages = d.messages.filter(m => !(m.id === req.params.mid && m.role === 'draft')); S.save(); res.json({ ok: true });
}));

// ---------- কাস্টমার ----------
router.patch('/customers/:id', needAny('inbox'), w(async (req, res) => {
  const u = cust(req.params.id), b = req.body;
  if (b.name !== undefined) u.name = str(b.name, 80);
  if (b.phone !== undefined) u.phone = U.normPhone(str(b.phone, 20));
  if (b.address !== undefined) u.address = str(b.address, 300);
  if (b.honorific !== undefined) u.honorific = ['sir', 'madam'].includes(b.honorific) ? b.honorific : '';
  if (b.tags !== undefined) u.tags = String(b.tags).split(',').map(x => x.trim()).filter(Boolean).slice(0, 10);
  if (b.tester !== undefined) u.tester = !!b.tester;
  if (b.priority !== undefined) u.priority = ['high', 'normal', 'low'].includes(b.priority) ? b.priority : '';
  S.save(); res.json(u);
}));
router.post('/customers/:id/notes', needAny('inbox'), w(async (req, res) => {
  const u = cust(req.params.id), text = str(req.body.text, 1000); if (!text) bad('নোট লিখুন');
  u.notes.push({ id: U.id(), text, by: req.user.name, at: Date.now() }); S.save(); res.json(u);
}));
router.post('/customers/:id/refresh-profile', needAny('inbox'), w(async (req, res) => {
  const u = cust(req.params.id), r = await E.refreshProfile(u, true);
  res.json({ name: u.name, avatar: u.avatar || '', error: r && r.error ? r.error : '' });
}));

// ---------- প্রোডাক্ট ও ফাইল আপলোড ----------
function normProduct(b, old) {
  const d = D();
  let code = str(b.code, 20).toUpperCase().replace(/\s+/g, '');
  if (!code) { if (old) code = old.code; else do { code = 'P' + (++d.counters.product); } while (d.products.some(p => p.code === code)); }
  if (d.products.some(p => p.code === code && (!old || p.id !== old.id))) bad('এই কোড আগেই আছে: ' + code);
  const price = +b.price; if (!(price >= 0) || !str(b.name)) bad('নাম আর দাম দিন');
  const variants = U.splitVariants(Array.isArray(b.variants) ? b.variants : []);
  return {
    id: old ? old.id : U.id(), code, name: str(b.name, 120), price, cost: Math.max(0, +b.cost || 0), category: str(b.category, 40), description: str(b.description, 800),
    keywords: str(b.keywords, 200), images: (Array.isArray(b.images) ? b.images : []).map(x => str(x, 500)).filter(Boolean).slice(0, 6),
    variants, stock: variants.length ? 0 : Math.max(0, +b.stock || 0), postIds: String(b.postIds || '').split(',').map(x => x.trim()).filter(Boolean),
    active: b.active !== false, createdAt: old ? old.createdAt : Date.now(),
  };
}
router.get('/products', needAny('inbox', 'products', 'orders'), (req, res) => res.json(D().products.map(p => ({ ...p, totalStock: O.totalStock(p) }))));
router.post('/products', need('products'), w(async (req, res) => { const p = normProduct(req.body); D().products.push(p); S.save(); res.json(p); }));
router.put('/products/:id', need('products'), w(async (req, res) => {
  const d = D(), i = d.products.findIndex(p => p.id === req.params.id); if (i < 0) bad('নেই', 404);
  d.products[i] = normProduct(req.body, d.products[i]); S.save(); res.json(d.products[i]);
}));
router.delete('/products/:id', need('products'), w(async (req, res) => { const d = D(); d.products = d.products.filter(p => p.id !== req.params.id); S.save(); res.json({ ok: true }); }));
router.post('/upload', needAny('inbox', 'products'), w(async (req, res) => {
  const f = U.parseDataUrl(req.body.dataUrl); if (!f) bad('ফাইল পড়া যায়নি');
  if (!U.ALLOWED.test(f.mime)) bad('এই ধরনের ফাইল আপলোড করা যায় না (ছবি, MP4 ভিডিও, PDF, Word/Excel চলবে)');
  if (f.buf.length > 10 * 1024 * 1024) bad('ফাইল ১০MB-এর বেশি');
  res.json({ url: U.saveUpload(f.buf, f.mime), kind: U.fileKind(f.mime), name: str(req.body.name, 100), size: f.buf.length });
}));

// ---------- অর্ডার ----------
const ov = o => ({ ...o, finance: O.finance(o), custName: (D().customers.find(c => c.id === o.customerId) || {}).name || o.name });
router.get('/orders', need('orders'), (req, res) => {
  const { status = '', q = '' } = req.query; let list = D().orders.slice();
  if (status) list = list.filter(o => o.status === status);
  if (q.trim()) { const s = q.trim().toLowerCase().replace('#', ''), dg = U.bn(q).replace(/\D/g, ''); list = list.filter(o => String(o.no) === s || (o.name || '').toLowerCase().includes(s) || (dg.length >= 3 && o.phone.includes(dg)) || (o.address || '').toLowerCase().includes(s)); }
  const counts = {}; D().orders.forEach(o => counts[o.status] = (counts[o.status] || 0) + 1);
  res.json({ counts, orders: list.sort((a, b) => b.createdAt - a.createdAt).slice(0, 300).map(ov) });
});
router.patch('/orders/:id/status', need('orders'), w(async (req, res) => {
  const o = order(req.params.id), st = str(req.body.status, 20), reason = str(req.body.reason, 200);
  if (['cancelled', 'returned'].includes(st) && !reason) bad('কারণ লিখুন');
  const r = O.setStatus(o, st, { by: req.user.name, reason }); if (r.error) bad(r.error);
  if (st === 'returned') o.returnReason = reason; S.save();
  await E.notifyOrder(o, st).catch(e => console.error('notifyOrder', e.message)); res.json(ov(o));
}));
router.post('/orders/:id/paid', need('orders'), w(async (req, res) => { const o = order(req.params.id); o.paid = !!req.body.paid; o.history.push({ status: o.status, at: Date.now(), by: req.user.name, note: o.paid ? '💵 টাকা পেয়েছি' : 'টাকা পাওয়া বাতিল' }); S.save(); res.json(ov(o)); }));
router.post('/orders/:id/charges', need('orders'), w(async (req, res) => {
  const o = order(req.params.id);
  if (req.body.courierCharge !== undefined) o.courierCharge = Math.max(0, +req.body.courierCharge || 0);
  if (req.body.returnCharge !== undefined) o.returnCharge = Math.max(0, +req.body.returnCharge || 0);
  S.save(); res.json(ov(o));
}));
router.post('/orders/:id/note', need('orders'), w(async (req, res) => { const o = order(req.params.id); o.notes.push({ text: str(req.body.text, 500), by: req.user.name, at: Date.now() }); S.save(); res.json(ov(o)); }));
router.post('/orders/:id/courier', need('orders'), w(async (req, res) => {
  const o = order(req.params.id);
  if (!['pending', 'processing'].includes(o.status)) bad('শুধু pending/processing অর্ডার বুক করা যায়');
  await Courier.book(o); O.setStatus(o, 'shipped', { by: req.user.name, reason: 'কুরিয়ার বুক' });
  await E.notifyOrder(o, 'shipped').catch(e => console.error(e.message)); res.json(ov(o));
}));
router.post('/orders/manual', need('orders'), w(async (req, res) => {
  const b = req.body, p = O.prod(str(b.code)) || bad('প্রোডাক্ট কোড ভুল');
  const c = b.convId ? conv(b.convId, req) : null, u = c ? E.custOf(c) : null;
  if (!U.phoneOk(b.phone) || !str(b.name) || str(b.address).length < 8) bad('নাম, সঠিক ফোন ও পুরো ঠিকানা দিন');
  if (O.needsSize(p) && !O.matchSize(p, b.size)) bad('সাইজ বাছুন');
  const r = O.place({ conv: c, cust: u, draft: { code: p.code, qty: +b.qty || 1, size: O.matchSize(p, b.size), name: str(b.name), phone: b.phone, address: str(b.address) }, by: req.user.name, byId: req.user.id });
  if (r.error) bad('স্টক নেই');
  if (u && O.needsSize(p)) u.lastSize = O.matchSize(p, b.size);
  if (c) await E.sendInvoice(c, u, r.order).catch(e => console.error(e.message));
  E.emit('order', { id: r.order.id }); res.json(ov(r.order));
}));

// ---------- লিড ও অফার ----------
const lv = l => { const u = D().customers.find(c => c.id === l.customerId) || {}; return { ...l, name: nameOf(u), phone: u.phone, platform: u.platform }; };
router.get('/leads', need('leads'), (req, res) => res.json(D().leads.map(lv).sort((a, b) => (['won', 'lost'].includes(a.stage) - ['won', 'lost'].includes(b.stage)) || ((a.followUpAt || 9e15) - (b.followUpAt || 9e15)) || b.updatedAt - a.updatedAt)));
router.post('/leads', need('leads'), w(async (req, res) => { const u = cust(req.body.customerId), l = E.upsertLead(E.getConv(u), u, str(req.body.interest, 120), 'follow_up'); if (req.body.followUpAt) l.followUpAt = +req.body.followUpAt; S.save(); res.json(lv(l)); }));
router.patch('/leads/:id', need('leads'), w(async (req, res) => {
  const l = D().leads.find(x => x.id === req.params.id) || bad('নেই', 404), b = req.body;
  if (b.stage && ['new', 'interested', 'follow_up', 'won', 'lost'].includes(b.stage)) l.stage = b.stage;
  if (b.followUpAt !== undefined) l.followUpAt = b.followUpAt ? +b.followUpAt : null;
  if (b.interest !== undefined) l.interest = str(b.interest, 120);
  l.updatedAt = Date.now(); S.save(); res.json(lv(l));
}));
router.post('/leads/:id/call', need('leads'), w(async (req, res) => {
  const l = D().leads.find(x => x.id === req.params.id) || bad('নেই', 404);
  l.callNotes.push({ text: str(req.body.text, 500), result: str(req.body.result, 30), by: req.user.name, at: Date.now() }); l.updatedAt = Date.now(); S.save(); res.json(lv(l));
}));
const ofv = o => ({ ...o, sentCount: Object.keys(o.sentTo || {}).length, sentTo: undefined });
router.get('/offers', need('leads'), (req, res) => res.json(D().offers.map(ofv).reverse()));
router.post('/offers', need('leads'), w(async (req, res) => {
  const text = str(req.body.text, 800); if (!text) bad('অফারের লেখা দিন');
  const of = { id: U.id(), text, audience: ['purchased', 'regular', 'all'].includes(req.body.audience) ? req.body.audience : 'purchased', codes: (req.body.codes || []).map(String).slice(0, 5), active: true, exp: +req.body.expDays > 0 ? Date.now() + req.body.expDays * 864e5 : null, sentTo: {}, createdAt: Date.now(), by: req.user.name };
  D().offers.push(of); S.save(); res.json(ofv(of));
}));
router.patch('/offers/:id', need('leads'), w(async (req, res) => { const o = D().offers.find(x => x.id === req.params.id) || bad('নেই', 404); if (req.body.active !== undefined) o.active = !!req.body.active; S.save(); res.json(ofv(o)); }));
router.delete('/offers/:id', need('leads'), w(async (req, res) => { const d = D(); d.offers = d.offers.filter(x => x.id !== req.params.id); S.save(); res.json({ ok: true }); }));
router.post('/offers/:id/send', need('leads'), w(async (req, res) => { const o = D().offers.find(x => x.id === req.params.id) || bad('নেই', 404); res.json(await E.sendOfferNow(o)); }));

// ---------- রিপোর্ট ও হিসাব ----------
router.get('/analytics', need('reports'), (req, res) => {
  const d = D(), days = [];
  for (let i = 0; i < 7; i++) days.push(U.day(Date.now() - i * 864e5));
  const cogsOf = o => o.items.reduce((a, i) => a + (+i.cost || 0) * i.qty, 0);
  const row = k => {
    const ms = d.messages.filter(m => U.day(m.at) === k), placed = d.orders.filter(o => U.day(o.createdAt) === k);
    let sales = 0, refunds = 0, returnCost = 0, courierCost = 0, cogs = 0, delivered = 0, returned = 0;
    for (const o of d.orders) {
      if (o.deliveredAt && U.day(o.deliveredAt) === k) { delivered++; sales += o.total; courierCost += +o.courierCharge || 0; cogs += cogsOf(o); }
      if (o.returnedAt && U.day(o.returnedAt) === k) { returned++; returnCost += +o.returnCharge || 0; if (o.deliveredAt) { refunds += o.total; cogs -= cogsOf(o); } }
    }
    return { day: k, chats: new Set(ms.filter(m => m.role === 'customer').map(m => m.convId)).size, customerMsgs: ms.filter(m => m.role === 'customer').length, aiReplies: ms.filter(m => m.role === 'ai').length, teamReplies: ms.filter(m => m.role === 'agent').length, handovers: ms.filter(m => m.role === 'system' && m.text.startsWith('🙋')).length, orders: placed.length, aiOrders: placed.filter(o => o.createdBy === 'ai').length, teamOrders: placed.filter(o => o.createdBy !== 'ai').length, delivered, returned, sales, refunds, revenue: sales - refunds, returnCost, courierCost, cogs, net: sales - refunds - courierCost - returnCost - cogs };
  };
  const reasons = {}; d.orders.filter(o => ['cancelled', 'returned'].includes(o.status)).forEach(o => { const k = (o.status === 'returned' ? 'রিটার্ন: ' : 'বাতিল: ') + (o.returnReason || o.reason || 'কারণ নেই'); reasons[k] = (reasons[k] || 0) + 1; });
  const sum = (f, p) => d.orders.filter(f).reduce((a, o) => a + (p ? p(o) : o.total), 0);
  const totals = {
    pipeline: sum(o => ['pending', 'processing', 'shipped'].includes(o.status)), pipelineCount: d.orders.filter(o => ['pending', 'processing', 'shipped'].includes(o.status)).length,
    receivable: sum(o => o.status === 'delivered' && !o.paid), cashIn: sum(o => o.status === 'delivered' && o.paid),
    returnLoss: sum(o => o.status === 'returned', o => (+o.returnCharge || 0) + (o.deliveredAt ? (+o.courierCharge || 0) : 0)),
  };
  res.json({ days: days.map(row), reasons, totals, openLeads: d.leads.filter(l => !['won', 'lost'].includes(l.stage)).length, lostLeads: d.leads.filter(l => l.stage === 'lost').length, lowStock: d.products.filter(p => O.totalStock(p) <= 3).map(p => ({ code: p.code, name: p.name, stock: O.totalStock(p) })), comments: d.comments.slice(-20).reverse() });
});

// ---------- AI সহকারী ও ডেস্ক ----------
const H = m => m.role === 'customer' ? 'Customer: ' + m.text : m.role === 'ai' ? 'AI: ' + m.text : m.role === 'agent' ? 'Team: ' + m.text : m.meta && m.meta.ctx ? '[context] ' + m.text : '';
router.post('/ai/assist', needAny('inbox'), w(async (req, res) => {
  const c = conv(req.body.convId, req), u = E.custOf(c), st = O.statsFor(u);
  const history = D().messages.filter(m => m.convId === c.id && m.role !== 'draft').slice(-60).map(H).filter(Boolean).join('\n');
  const orders = st.list.map(o => `#${o.no} ${o.status} ${U.money(o.total)} ${o.items.map(i => i.name).join(',')}${o.returnReason ? ' (return: ' + o.returnReason + ')' : ''}`).join('; ') || 'none';
  res.json({ text: await AI.assist(req.body.mode, { history, orders, customer: `${u.name} ${u.phone} ${u.address}`, question: str(req.body.question, 300) }) });
}));
router.post('/desk/test', need('desk'), w(async (req, res) => { const p = await E.testPlan(str(req.body.message, 500), str(req.body.rules, 5000) || D().settings.rulesDraft); res.json({ plan: p, demo: !AI.hasAI() }); }));
router.post('/desk/live', need('desk'), w(async (req, res) => { const s = D().settings; s.rulesPrev = s.rulesLive; s.rulesLive = s.rulesDraft; S.save(); res.json({ ok: true }); }));
router.post('/desk/revert', need('desk'), w(async (req, res) => { const s = D().settings; if (!s.rulesPrev) bad('আগের কোনো ভার্সন নেই'); [s.rulesLive, s.rulesPrev] = [s.rulesPrev, s.rulesLive]; s.rulesDraft = s.rulesLive; S.save(); res.json({ ok: true }); }));

// ---------- সেটিংস ----------
router.get('/settings', (req, res) => res.json(D().settings));
router.put('/settings', w(async (req, res) => {
  const s = D().settings, b = req.body, keys = Object.keys(b);
  if (keys.some(k => k !== 'rulesDraft') && !A.can(req.user, 'settings')) bad('সেটিংস বদলানোর অনুমতি নেই', 403);
  if (b.rulesDraft !== undefined && !A.can(req.user, 'desk')) bad('এজেন্ট ডেস্কের অনুমতি নেই', 403);
  ['businessName', 'deliveryDays', 'reviewLink', 'rulesDraft'].forEach(k => { if (b[k] !== undefined) s[k] = str(b[k], k === 'rulesDraft' ? 5000 : 200); });
  ['deliveryInside', 'deliveryOutside', 'handoverMinutes', 'followupHours', 'returnCharge', 'courierChargeInside', 'courierChargeOutside'].forEach(k => { if (b[k] !== undefined) s[k] = Math.max(0, +b[k] || 0); });
  ['aiLive', 'followupEnabled', 'commentReplyEnabled'].forEach(k => { if (b[k] !== undefined) s[k] = !!b[k]; });
  if (b.commentMode !== undefined) s.commentMode = b.commentMode === 'all' ? 'all' : 'intent';
  S.save(); res.json(s);
}));
router.get('/meta/check', need('settings'), w(async (req, res) => {
  const out = { page: null, error: '', needed: CH.NEEDED, publicOk: CH.publicOk() };
  if (!process.env.PAGE_ACCESS_TOKEN) out.error = 'PAGE_ACCESS_TOKEN .env-এ নেই';
  else { try { out.page = await CH.pageSubs(); } catch (e) { out.error = CH.errMsg(e); } }
  res.json(out);
}));
router.post('/meta/subscribe', need('settings'), w(async (req, res) => {
  try { await CH.subscribePage(); } catch (e) { return res.json({ ok: false, error: CH.errMsg(e) }); }
  res.json({ ok: true, page: await CH.pageSubs().catch(() => null) });
}));
// ডেটা ব্যাকআপ/রিস্টোর (Render ফ্রি প্ল্যানে ডিপ্লয়ে ফাইল মুছে যায়, তাই নিয়মিত ব্যাকআপ নিন)
router.get('/backup', A.ownerOnly, w(async (req, res) => {
  const d = { ...D(), sessions: {} }, files = {};
  try { for (const f of fs.readdirSync(U.UP)) if (/^[\w.-]+$/.test(f)) files[f] = fs.readFileSync(path.join(U.UP, f)).toString('base64'); } catch {}
  res.set({ 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="shop-agent-backup-${U.day(Date.now())}.json"` });
  res.send(JSON.stringify({ version: 2, at: Date.now(), data: d, files }));
}));
router.post('/restore', A.ownerOnly, w(async (req, res) => {
  const { data, files } = req.body || {}; if (!data || !Array.isArray(data.users) || !Array.isArray(data.orders)) bad('এটা সঠিক ব্যাকআপ ফাইল না');
  const d = D();
  for (const k of ['settings', 'users', 'products', 'customers', 'conversations', 'messages', 'orders', 'leads', 'notifications', 'offers', 'comments', 'counters']) if (data[k] !== undefined) d[k] = data[k];
  S.migrate(); d.sessions = {};
  let n = 0; for (const [name, b64] of Object.entries(files || {})) if (/^[\w.-]+$/.test(name)) { fs.writeFileSync(path.join(U.UP, name), Buffer.from(b64, 'base64')); n++; }
  S.save(); res.json({ ok: true, files: n });
}));

// ---------- টিম ----------
router.get('/users', (req, res) => res.json(D().users.map(A.pub)));
const permsIn = b => ({ preset: S.PRESETS[b.preset] ? b.preset : undefined, perms: Array.isArray(b.perms) ? b.perms : undefined, restrictChats: !!b.restrictChats });
router.post('/users', need('team'), w(async (req, res) => {
  const p = permsIn(req.body);
  res.json(A.pub(A.addUser({ name: req.body.name, email: req.body.email, password: req.body.password, role: 'teammate', preset: p.preset, perms: p.perms, restrictChats: p.restrictChats })));
}));
router.patch('/users/:id', need('team'), w(async (req, res) => {
  const u = D().users.find(x => x.id === req.params.id) || bad('নেই', 404), b = req.body;
  if (u.role === 'owner' && req.user.role !== 'owner') bad('মালিকের অ্যাকাউন্ট বদলানো যায় না', 403);
  if (b.name) u.name = str(b.name, 60);
  if (u.role !== 'owner') {
    if (S.PRESETS[b.preset]) { u.preset = b.preset; u.perms = S.PRESETS[b.preset].slice(); }
    if (Array.isArray(b.perms)) { u.perms = b.perms.filter(x => S.PERMS.includes(x)); u.preset = 'custom'; }
    if (b.restrictChats !== undefined) u.restrictChats = !!b.restrictChats;
  }
  if (b.password) { if (String(b.password).length < 6) bad('পাসওয়ার্ড ৬+ অক্ষর'); Object.assign(u, A.hash(b.password)); }
  S.save(); res.json(A.pub(u));
}));
router.delete('/users/:id', need('team'), w(async (req, res) => {
  const t = D().users.find(u => u.id === req.params.id); if (!t) bad('নেই', 404);
  if (req.params.id === req.user.id) bad('নিজেকে মুছা যাবে না'); if (t.role === 'owner') bad('মালিককে সরানো যায় না');
  const d = D(); d.users = d.users.filter(u => u.id !== req.params.id); d.conversations.forEach(c => { if (c.assignedTo === req.params.id) c.assignedTo = null; }); S.save(); res.json({ ok: true });
}));
// কোন টিমমেট কী কাজ করছে: কার সাথে কথা, কত মেসেজ, কী অর্ডার
router.get('/users/:id/activity', need('team'), w(async (req, res) => {
  const d = D(), u = d.users.find(x => x.id === req.params.id) || bad('নেই', 404);
  const mine = m => m.role === 'agent' && (m.meta.byId === u.id || (!m.meta.byId && m.meta.by === u.name));
  const msgs = d.messages.filter(mine), byConv = {};
  msgs.forEach(m => { const x = byConv[m.convId] || (byConv[m.convId] = { convId: m.convId, count: 0, lastAt: 0 }); x.count++; x.lastAt = Math.max(x.lastAt, m.at); });
  const chatRow = (c, extra = {}) => { const cu = E.custOf(c); return { convId: c.id, name: nameOf(cu), avatar: cu.avatar || '', platform: c.platform, mode: c.mode, assigned: c.assignedTo === u.id, lastAt: c.lastAt, lastText: c.lastText, ...extra }; };
  const handled = Object.values(byConv).map(x => { const c = d.conversations.find(y => y.id === x.convId); return c ? chatRow(c, { count: x.count, lastReply: x.lastAt }) : null; }).filter(Boolean);
  const assigned = d.conversations.filter(c => c.assignedTo === u.id).filter(c => !byConv[c.id]).map(c => chatRow(c, { count: 0, lastReply: 0 }));
  const orders = d.orders.filter(o => o.createdById === u.id || (!o.createdById && o.createdBy === u.name));
  const daily = []; for (let i = 6; i >= 0; i--) { const k = U.day(Date.now() - i * 864e5); daily.push({ day: k, messages: msgs.filter(m => U.day(m.at) === k).length }); }
  res.json({ user: A.pub(u), stats: { assigned: d.conversations.filter(c => c.assignedTo === u.id).length, chats: handled.length, messages: msgs.length, orders: orders.length, ordersValue: orders.filter(o => !['cancelled', 'returned'].includes(o.status)).reduce((a, o) => a + o.total, 0) },
    chats: [...handled, ...assigned].sort((a, b) => Math.max(b.lastReply, b.lastAt) - Math.max(a.lastReply, a.lastAt)).slice(0, 40),
    recent: msgs.slice(-25).reverse().map(m => { const c = d.conversations.find(y => y.id === m.convId); return { at: m.at, type: m.type, text: m.text, convId: m.convId, name: c ? nameOf(E.custOf(c)) : '' }; }),
    orders: orders.slice(-15).reverse().map(o => ({ id: o.id, no: o.no, status: o.status, total: o.total, name: o.name, at: o.createdAt })), daily });
}));
router.get('/notifications', (req, res) => { const l = D().notifications.filter(n => n.userId === req.user.id).slice(-40).reverse(); res.json({ list: l, unread: l.filter(n => !n.read).length }); });
router.post('/notifications/read', (req, res) => { D().notifications.forEach(n => { if (n.userId === req.user.id) n.read = true; }); S.save(); res.json({ ok: true }); });

// ---------- ওয়েব সিমুলেটর ----------
router.post('/sim/send', needAny('inbox'), w(async (req, res) => {
  const { sid, name, text, postback, image } = req.body; if (!sid) bad('sid নেই');
  const ev = { platform: 'web', externalId: String(sid).slice(0, 40), name: str(name, 60) || 'টেস্ট কাস্টমার', text: str(text, 2000) };
  if (postback) ev.postback = str(postback, 200);
  const f = image && U.parseDataUrl(image); if (f) ev.media = { kind: 'image', buf: f.buf, mime: f.mime };
  await E.enqueue(ev); res.json({ ok: true });
}));
router.get('/sim/messages', needAny('inbox'), (req, res) => {
  const u = D().customers.find(c => c.platform === 'web' && c.externalId === String(req.query.sid)); if (!u) return res.json([]);
  const c = D().conversations.find(x => x.customerId === u.id); if (!c) return res.json([]);
  res.json(D().messages.filter(m => m.convId === c.id && m.role !== 'draft' && m.role !== 'system').map(m => ({ id: m.id, role: m.role, type: m.type, text: m.text, mediaUrl: m.mediaUrl, payload: m.meta && m.meta.payload })));
});
module.exports = router;
