const router = require('express').Router();
const S = require('../lib/store'), U = require('../lib/util'), A = require('../lib/auth'), E = require('../lib/engine'), O = require('../lib/orders'), AI = require('../lib/ai'), Courier = require('../lib/courier');
const D = S.D;
const w = fn => (req, res) => Promise.resolve(fn(req, res)).catch(e => { console.error(e); res.status(e.status || 500).json({ error: e.message }); });
const bad = (m, status = 400) => { const e = new Error(m); e.status = status; throw e; };
const conv = id => D().conversations.find(c => c.id === id) || bad('চ্যাট পাওয়া যায়নি', 404);
const cust = id => D().customers.find(c => c.id === id) || bad('কাস্টমার পাওয়া যায়নি', 404);
const order = id => D().orders.find(o => o.id === id) || bad('অর্ডার পাওয়া যায়নি', 404);
const str = (v, n = 500) => String(v == null ? '' : v).trim().slice(0, n);
const pick = (o, keys) => Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]));

// ---------- SSE ----------
router.get('/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.write('retry: 3000\n\n');
  const on = ev => { if (ev.type === 'notify' && !ev.data.userIds.includes(req.user.id)) return; res.write(`event: ${ev.type}\ndata: ${JSON.stringify(ev.data)}\n\n`); };
  E.bus.on('e', on);
  const ka = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => { E.bus.off('e', on); clearInterval(ka); });
});

router.get('/me', (req, res) => res.json({ user: A.pub(req.user), settings: { aiLive: D().settings.aiLive, hasAI: AI.hasAI(), courier: Courier.mode(), publicUrl: process.env.PUBLIC_URL || '' } }));

// ---------- ইনবক্স ----------
const view = c => { const u = E.custOf(c); return { id: c.id, name: u.name || u.externalId, platform: c.platform, mode: c.mode, assignedTo: c.assignedTo, unread: c.unread || 0, lastText: c.lastText, lastAt: c.lastAt, handoverReason: c.handoverReason, phone: u.phone, hasDraft: D().messages.some(m => m.convId === c.id && m.role === 'draft') }; };
router.get('/conversations', (req, res) => {
  const { q = '', filter = 'all', platform = '' } = req.query, d = D();
  let list = d.conversations.slice();
  if (platform) list = list.filter(c => c.platform === platform);
  if (filter === 'human') list = list.filter(c => c.mode === 'human');
  if (filter === 'mine') list = list.filter(c => c.assignedTo === req.user.id);
  if (filter === 'unassigned') list = list.filter(c => c.mode === 'human' && !c.assignedTo);
  if (filter === 'unread') list = list.filter(c => c.unread > 0);
  if (q.trim()) {
    const s = q.trim().toLowerCase(), digits = U.bn(q).replace(/\D/g, '');
    const hit = new Set(d.messages.filter(m => (m.text || '').toLowerCase().includes(s)).map(m => m.convId));
    list = list.filter(c => {
      const u = E.custOf(c);
      return (u.name || '').toLowerCase().includes(s) || (digits.length >= 3 && U.normPhone(u.phone).includes(digits)) || hit.has(c.id)
        || d.orders.some(o => o.convId === c.id && (String(o.no) === s.replace('#', '') || U.normPhone(o.phone).includes(digits) && digits.length >= 3));
    });
  }
  res.json(list.sort((a, b) => b.lastAt - a.lastAt).slice(0, 200).map(view));
});
router.get('/conversations/:id', w(async (req, res) => {
  const c = conv(req.params.id), u = E.custOf(c), d = D();
  c.unread = 0; S.save();
  const st = O.statsFor(u);
  res.json({
    conv: { ...view(c), draft: c.draft, humanUntil: c.humanUntil },
    customer: u, messages: d.messages.filter(m => m.convId === c.id).slice(-300),
    stats: { total: st.total, delivered: st.delivered, returned: st.returned, cancelled: st.cancelled },
    orders: st.list.slice().reverse().map(o => ({ id: o.id, no: o.no, status: o.status, total: o.total, at: o.createdAt })),
    lead: d.leads.filter(l => l.customerId === u.id).pop() || null,
    related: u.phone ? d.customers.filter(x => x.id !== u.id && x.phone && U.normPhone(x.phone) === U.normPhone(u.phone)).map(x => ({ id: x.id, platform: x.platform, name: x.name })) : [],
  });
}));
router.post('/conversations/:id/send', w(async (req, res) => {
  const text = str(req.body.text, 2000); if (!text) bad('মেসেজ লিখুন');
  await E.agentSend(conv(req.params.id), req.user, text); res.json({ ok: true });
}));
router.post('/conversations/:id/mode', w(async (req, res) => {
  const c = conv(req.params.id);
  if (req.body.mode === 'ai') await E.backToAI(c); else E.claim(c, req.user, +req.body.minutes || 0);
  S.save(); res.json({ ok: true });
}));
router.post('/conversations/:id/assign', w(async (req, res) => {
  const u = req.body.userId ? D().users.find(x => x.id === req.body.userId) || bad('ইউজার নেই') : null;
  E.assign(conv(req.params.id), u, req.user); S.save(); res.json({ ok: true });
}));
router.post('/conversations/:id/drafts/:mid/send', w(async (req, res) => {
  const c = conv(req.params.id), d = D(), i = d.messages.findIndex(m => m.id === req.params.mid && m.role === 'draft');
  if (i < 0) bad('ড্রাফট নেই', 404);
  const m = d.messages[i]; d.messages.splice(i, 1);
  if (req.body.text) m.meta.plan.reply = str(req.body.text, 2000);
  await E.executePlan(c, E.custOf(c), m.meta.plan, m.meta.text); res.json({ ok: true });
}));
router.post('/conversations/:id/drafts/:mid/discard', w(async (req, res) => {
  const d = D(); d.messages = d.messages.filter(m => !(m.id === req.params.mid && m.role === 'draft')); S.save(); res.json({ ok: true });
}));

// ---------- কাস্টমার ----------
router.patch('/customers/:id', w(async (req, res) => {
  const u = cust(req.params.id), b = req.body;
  if (b.name !== undefined) u.name = str(b.name, 80);
  if (b.phone !== undefined) u.phone = U.normPhone(str(b.phone, 20));
  if (b.address !== undefined) u.address = str(b.address, 300);
  if (b.honorific !== undefined) u.honorific = ['sir', 'madam'].includes(b.honorific) ? b.honorific : '';
  if (b.tags !== undefined) u.tags = String(b.tags).split(',').map(x => x.trim()).filter(Boolean).slice(0, 10);
  if (b.tester !== undefined) u.tester = !!b.tester;
  S.save(); res.json(u);
}));
router.post('/customers/:id/notes', w(async (req, res) => {
  const u = cust(req.params.id), text = str(req.body.text, 1000); if (!text) bad('নোট লিখুন');
  u.notes.push({ id: U.id(), text, by: req.user.name, at: Date.now() }); S.save(); res.json(u);
}));

// ---------- প্রোডাক্ট ----------
function normProduct(b, old) {
  const d = D();
  let code = str(b.code, 20).toUpperCase().replace(/\s+/g, '');
  if (!code) { if (old) code = old.code; else do { code = 'P' + (++d.counters.product); } while (d.products.some(p => p.code === code)); }
  if (d.products.some(p => p.code === code && (!old || p.id !== old.id))) bad('এই কোড আগেই আছে: ' + code);
  const price = +b.price; if (!(price >= 0) || !str(b.name)) bad('নাম আর দাম দিন');
  const variants = (Array.isArray(b.variants) ? b.variants : []).map(v => ({ label: str(v.label, 30), stock: Math.max(0, +v.stock || 0) })).filter(v => v.label);
  return {
    id: old ? old.id : U.id(), code, name: str(b.name, 120), price, category: str(b.category, 40), description: str(b.description, 800),
    keywords: str(b.keywords, 200), images: (Array.isArray(b.images) ? b.images : []).map(x => str(x, 500)).filter(Boolean).slice(0, 6),
    variants, stock: variants.length ? 0 : Math.max(0, +b.stock || 0), postIds: String(b.postIds || '').split(',').map(x => x.trim()).filter(Boolean),
    active: b.active !== false, createdAt: old ? old.createdAt : Date.now(),
  };
}
router.get('/products', (req, res) => res.json(D().products.map(p => ({ ...p, totalStock: O.totalStock(p) }))));
router.post('/products', w(async (req, res) => { const p = normProduct(req.body); D().products.push(p); S.save(); res.json(p); }));
router.put('/products/:id', w(async (req, res) => {
  const d = D(), i = d.products.findIndex(p => p.id === req.params.id); if (i < 0) bad('নেই', 404);
  d.products[i] = normProduct(req.body, d.products[i]); S.save(); res.json(d.products[i]);
}));
router.delete('/products/:id', w(async (req, res) => { const d = D(); d.products = d.products.filter(p => p.id !== req.params.id); S.save(); res.json({ ok: true }); }));
router.post('/upload', w(async (req, res) => {
  const f = U.parseDataUrl(req.body.dataUrl); if (!f || !/^image\//.test(f.mime)) bad('শুধু ছবি আপলোড করা যাবে');
  res.json({ url: await U.uploadImage(f.buf, f.mime) });
}));

// ---------- অর্ডার ----------
const ov = o => ({ ...o, custName: (D().customers.find(c => c.id === o.customerId) || {}).name || o.name });
router.get('/orders', (req, res) => {
  const { status = '', q = '' } = req.query; let list = D().orders.slice();
  if (status) list = list.filter(o => o.status === status);
  if (q.trim()) { const s = q.trim().toLowerCase().replace('#', ''), dg = U.bn(q).replace(/\D/g, ''); list = list.filter(o => String(o.no) === s || (o.name || '').toLowerCase().includes(s) || (dg.length >= 3 && o.phone.includes(dg)) || (o.address || '').toLowerCase().includes(s)); }
  const counts = {}; D().orders.forEach(o => counts[o.status] = (counts[o.status] || 0) + 1);
  res.json({ counts, orders: list.sort((a, b) => b.createdAt - a.createdAt).slice(0, 300).map(ov) });
});
router.patch('/orders/:id/status', w(async (req, res) => {
  const o = order(req.params.id), st = str(req.body.status, 20), reason = str(req.body.reason, 200);
  if (['cancelled', 'returned'].includes(st) && !reason) bad('কারণ লিখুন');
  const r = O.setStatus(o, st, { by: req.user.name, reason }); if (r.error) bad(r.error);
  await E.notifyOrder(o, st).catch(e => console.error('notifyOrder', e.message)); res.json(ov(o));
}));
router.post('/orders/:id/paid', w(async (req, res) => { const o = order(req.params.id); o.paid = !!req.body.paid; o.history.push({ status: o.status, at: Date.now(), by: req.user.name, note: o.paid ? '💵 টাকা পেয়েছি' : 'টাকা পাওয়া বাতিল' }); S.save(); res.json(ov(o)); }));
router.post('/orders/:id/note', w(async (req, res) => { const o = order(req.params.id); o.notes.push({ text: str(req.body.text, 500), by: req.user.name, at: Date.now() }); S.save(); res.json(ov(o)); }));
router.post('/orders/:id/courier', w(async (req, res) => {
  const o = order(req.params.id);
  if (!['pending', 'processing'].includes(o.status)) bad('শুধু pending/processing অর্ডার বুক করা যায়');
  await Courier.book(o); O.setStatus(o, 'shipped', { by: req.user.name, reason: 'কুরিয়ার বুক' });
  await E.notifyOrder(o, 'shipped').catch(e => console.error(e.message)); res.json(ov(o));
}));
router.post('/orders/manual', w(async (req, res) => {
  const b = req.body, p = O.prod(str(b.code)) || bad('প্রোডাক্ট কোড ভুল');
  const c = b.convId ? conv(b.convId) : null, u = c ? E.custOf(c) : null;
  if (!U.phoneOk(b.phone) || !str(b.name) || str(b.address).length < 8) bad('নাম, সঠিক ফোন ও পুরো ঠিকানা দিন');
  if (O.needsSize(p) && !O.matchSize(p, b.size)) bad('সাইজ বাছুন');
  const r = O.place({ conv: c, cust: u, draft: { code: p.code, qty: +b.qty || 1, size: O.matchSize(p, b.size), name: str(b.name), phone: b.phone, address: str(b.address) }, by: req.user.name });
  if (r.error) bad('স্টক নেই');
  if (c) await E.sendInvoice(c, u, r.order).catch(e => console.error(e.message));
  E.emit('order', { id: r.order.id }); res.json(ov(r.order));
}));

// ---------- লিড ----------
const lv = l => { const u = D().customers.find(c => c.id === l.customerId) || {}; return { ...l, name: u.name, phone: u.phone, platform: u.platform }; };
router.get('/leads', (req, res) => res.json(D().leads.map(lv).sort((a, b) => (['won', 'lost'].includes(a.stage) - ['won', 'lost'].includes(b.stage)) || ((a.followUpAt || 9e15) - (b.followUpAt || 9e15)) || b.updatedAt - a.updatedAt)));
router.post('/leads', w(async (req, res) => { const u = cust(req.body.customerId), l = E.upsertLead(E.getConv(u), u, str(req.body.interest, 120), 'follow_up'); if (req.body.followUpAt) l.followUpAt = +req.body.followUpAt; S.save(); res.json(lv(l)); }));
router.patch('/leads/:id', w(async (req, res) => {
  const l = D().leads.find(x => x.id === req.params.id) || bad('নেই', 404), b = req.body;
  if (b.stage && ['new', 'interested', 'follow_up', 'won', 'lost'].includes(b.stage)) l.stage = b.stage;
  if (b.followUpAt !== undefined) l.followUpAt = b.followUpAt ? +b.followUpAt : null;
  if (b.interest !== undefined) l.interest = str(b.interest, 120);
  l.updatedAt = Date.now(); S.save(); res.json(lv(l));
}));
router.post('/leads/:id/call', w(async (req, res) => {
  const l = D().leads.find(x => x.id === req.params.id) || bad('নেই', 404);
  l.callNotes.push({ text: str(req.body.text, 500), result: str(req.body.result, 30), by: req.user.name, at: Date.now() }); l.updatedAt = Date.now(); S.save(); res.json(lv(l));
}));

// ---------- অ্যানালিটিক্স ----------
router.get('/analytics', (req, res) => {
  const d = D(), days = [];
  for (let i = 0; i < 7; i++) days.push(U.day(Date.now() - i * 864e5));
  const row = k => {
    const ms = d.messages.filter(m => U.day(m.at) === k), os = d.orders.filter(o => U.day(o.createdAt) === k), live = os.filter(o => !['cancelled'].includes(o.status));
    return { day: k, chats: new Set(ms.filter(m => m.role === 'customer').map(m => m.convId)).size, customerMsgs: ms.filter(m => m.role === 'customer').length, aiReplies: ms.filter(m => m.role === 'ai').length, teamReplies: ms.filter(m => m.role === 'agent').length, handovers: ms.filter(m => m.role === 'system' && m.text.startsWith('🙋')).length, orders: os.length, aiOrders: os.filter(o => o.createdBy === 'ai').length, teamOrders: os.filter(o => o.createdBy !== 'ai').length, revenue: live.reduce((a, o) => a + o.total, 0) };
  };
  const reasons = {}; d.orders.filter(o => ['cancelled', 'returned'].includes(o.status)).forEach(o => { const k = (o.status === 'returned' ? 'রিটার্ন: ' : 'বাতিল: ') + (o.reason || 'কারণ নেই'); reasons[k] = (reasons[k] || 0) + 1; });
  const noOrder = d.leads.filter(l => l.stage === 'lost').length;
  res.json({ days: days.map(row), reasons, openLeads: d.leads.filter(l => !['won', 'lost'].includes(l.stage)).length, lostLeads: noOrder, lowStock: d.products.filter(p => O.totalStock(p) <= 3).map(p => ({ code: p.code, name: p.name, stock: O.totalStock(p) })) });
});

// ---------- AI সহকারী ও ডেস্ক ----------
const H = m => m.role === 'customer' ? 'Customer: ' + m.text : m.role === 'ai' ? 'AI: ' + m.text : m.role === 'agent' ? 'Team: ' + m.text : m.meta && m.meta.ctx ? '[context] ' + m.text : '';
router.post('/ai/assist', w(async (req, res) => {
  const c = conv(req.body.convId), u = E.custOf(c), st = O.statsFor(u);
  const history = D().messages.filter(m => m.convId === c.id && m.role !== 'draft').slice(-60).map(H).filter(Boolean).join('\n');
  const orders = st.list.map(o => `#${o.no} ${o.status} ${U.money(o.total)} ${o.items.map(i => i.name).join(',')}`).join('; ') || 'none';
  res.json({ text: await AI.assist(req.body.mode, { history, orders, customer: `${u.name} ${u.phone} ${u.address}`, question: str(req.body.question, 300) }) });
}));
router.post('/desk/test', w(async (req, res) => { const p = await E.testPlan(str(req.body.message, 500), str(req.body.rules, 5000) || D().settings.rulesDraft); res.json({ plan: p, demo: !AI.hasAI() }); }));
router.post('/desk/live', A.ownerOnly, w(async (req, res) => { const s = D().settings; s.rulesPrev = s.rulesLive; s.rulesLive = s.rulesDraft; S.save(); res.json({ ok: true }); }));
router.post('/desk/revert', A.ownerOnly, w(async (req, res) => { const s = D().settings; if (!s.rulesPrev) bad('আগের কোনো ভার্সন নেই'); [s.rulesLive, s.rulesPrev] = [s.rulesPrev, s.rulesLive]; s.rulesDraft = s.rulesLive; S.save(); res.json({ ok: true }); }));

// ---------- সেটিংস, টিম, নোটিফিকেশন ----------
router.get('/settings', (req, res) => res.json(D().settings));
router.put('/settings', A.ownerOnly, w(async (req, res) => {
  const s = D().settings, b = req.body;
  ['businessName', 'deliveryDays', 'reviewLink', 'rulesDraft'].forEach(k => { if (b[k] !== undefined) s[k] = str(b[k], k === 'rulesDraft' ? 5000 : 200); });
  ['deliveryInside', 'deliveryOutside', 'handoverMinutes', 'followupHours'].forEach(k => { if (b[k] !== undefined) s[k] = Math.max(0, +b[k] || 0); });
  ['aiLive', 'followupEnabled', 'commentReplyEnabled'].forEach(k => { if (b[k] !== undefined) s[k] = !!b[k]; });
  S.save(); res.json(s);
}));
router.get('/users', (req, res) => res.json(D().users.map(A.pub)));
router.post('/users', A.ownerOnly, w(async (req, res) => { res.json(A.pub(A.addUser({ ...req.body, role: 'teammate' }))); }));
router.delete('/users/:id', A.ownerOnly, w(async (req, res) => {
  if (req.params.id === req.user.id) bad('নিজেকে মুছা যাবে না');
  const d = D(); d.users = d.users.filter(u => u.id !== req.params.id); d.conversations.forEach(c => { if (c.assignedTo === req.params.id) c.assignedTo = null; }); S.save(); res.json({ ok: true });
}));
router.get('/notifications', (req, res) => { const l = D().notifications.filter(n => n.userId === req.user.id).slice(-40).reverse(); res.json({ list: l, unread: l.filter(n => !n.read).length }); });
router.post('/notifications/read', (req, res) => { D().notifications.forEach(n => { if (n.userId === req.user.id) n.read = true; }); S.save(); res.json({ ok: true }); });

// ---------- ওয়েব সিমুলেটর (টেস্টের জন্য নকল কাস্টমার) ----------
router.post('/sim/send', w(async (req, res) => {
  const { sid, name, text, postback, image } = req.body; if (!sid) bad('sid নেই');
  const ev = { platform: 'web', externalId: String(sid).slice(0, 40), name: str(name, 60) || 'টেস্ট কাস্টমার', text: str(text, 2000) };
  if (postback) ev.postback = str(postback, 200);
  const f = image && U.parseDataUrl(image); if (f) ev.media = { kind: 'image', buf: f.buf, mime: f.mime };
  await E.enqueue(ev); res.json({ ok: true });
}));
router.get('/sim/messages', (req, res) => {
  const u = D().customers.find(c => c.platform === 'web' && c.externalId === String(req.query.sid)); if (!u) return res.json([]);
  const c = D().conversations.find(x => x.customerId === u.id); if (!c) return res.json([]);
  res.json(D().messages.filter(m => m.convId === c.id && m.role !== 'draft' && !(m.role === 'system')).map(m => ({ id: m.id, role: m.role, type: m.type, text: m.text, mediaUrl: m.mediaUrl, payload: m.meta && m.meta.payload })));
});
module.exports = router;
