// ===== সাধারণ =====
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => '৳' + Number(n || 0).toLocaleString('en-US');
const api = async (p, o = {}) => {
  const r = await fetch('/api' + p, { method: o.method || (o.body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json' }, body: o.body ? JSON.stringify(o.body) : undefined });
  if (r.status === 401) { location = '/login.html'; throw new Error('login'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
};
const toast = m => alert(m);
const guard = fn => async (...a) => { try { return await fn(...a); } catch (e) { if (e.message !== 'login') toast('⚠ ' + e.message); } };
const PL = { messenger: ['Messenger', '#0a84ff'], instagram: ['Instagram', '#d6249f'], whatsapp: ['WhatsApp', '#25a244'], web: ['টেস্ট', '#777'] };
const plb = p => `<span class="pill" style="background:${(PL[p] || ['', '#777'])[1]}">${(PL[p] || [p])[0]}</span>`;
const ST = { pending: 'পেন্ডিং', processing: 'প্রসেসিং', shipped: 'শিপড', delivered: 'ডেলিভারড', cancelled: 'বাতিল', returned: 'রিটার্ন' };
const STC = { pending: 'pend', processing: 'proc', shipped: 'ship', delivered: 'deli', cancelled: 'canc', returned: 'retu' };
const stb = s => `<span class="pill ${STC[s]}">${ST[s] || s}</span>`;
const fdt = t => t ? new Date(t).toLocaleString('bn-BD', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
const ago = t => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'এইমাত্র' : m < 60 ? m + ' মি' : m < 1440 ? Math.round(m / 60) + ' ঘ' : Math.round(m / 1440) + ' দিন'; };
const dtl = t => { if (!t) return ''; const d = new Date(t - new Date().getTimezoneOffset() * 6e4); return d.toISOString().slice(0, 16); };
const debounce = (f, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };

let ME, SET = {}, USERS = [], tab = 'inbox', unread = 0;
const F = { filter: 'all', platform: '', q: '', cur: null, orderQ: '', orderSt: '', ordOpen: null };
const TABS = [['inbox', '💬 ইনবক্স'], ['orders', '🧾 অর্ডার'], ['leads', '📞 লিড'], ['products', '🛍 প্রোডাক্ট'], ['reports', '📊 রিপোর্ট'], ['desk', '🎓 এজেন্ট ডেস্ক'], ['team', '👥 টিম', 1], ['settings', '⚙ সেটিংস', 1]];

async function boot() {
  const me = await api('/me'); ME = me.user; SET = me.settings; USERS = await api('/users');
  drawTop(); go(location.hash.slice(1) || 'inbox'); bell(); sse();
}
function drawTop() {
  $('#top').innerHTML = `<span class="brand">🤖 Shop Agent</span>` + TABS.filter(t => !t[2] || ME.role === 'owner').map(t => `<button class="tabb ${tab === t[0] ? 'on' : ''}" data-a="tab" data-t="${t[0]}">${t[1]}</button>`).join('')
    + `<a href="/simulator.html" target="_blank" class="tabb" style="text-decoration:none">🧪 সিমুলেটর</a><span class="sp"></span>`
    + `<span class="small mut" title="${SET.hasAI ? 'Gemini চালু' : 'Gemini key নেই: ডেমো মোড'}">${SET.hasAI ? '🟢 AI' : '🟠 ডেমো'}</span> <span class="chip">${SET.aiLive ? '🔴 লাইভ' : '🧪 প্র্যাক্টিস'}</span>`
    + `<button class="bell" data-a="bell">🔔${unread ? `<b>${unread}</b>` : ''}</button><span class="small">${esc(ME.name)}</span><button class="sec sm" data-a="logout">বের হন</button>`;
}
function go(t) { tab = t; location.hash = t; drawTop(); ({ inbox: viewInbox, orders: viewOrders, leads: viewLeads, products: viewProducts, reports: viewReports, desk: viewDesk, team: viewTeam, settings: viewSettings }[t] || viewInbox)(); }

// ===== রিয়েল-টাইম =====
function sse() {
  const es = new EventSource('/api/events');
  const rl = debounce(() => { if (tab === 'inbox') { loadList(); if (F.cur) loadConv(true); } }, 250);
  es.addEventListener('msg', rl); es.addEventListener('conv', rl);
  es.addEventListener('order', debounce(() => { if (tab === 'orders') loadOrders(); }, 300));
  es.addEventListener('notify', e => {
    const d = JSON.parse(e.data); bell();
    if (window.Notification && Notification.permission === 'granted') { const n = new Notification('Shop Agent', { body: d.text }); n.onclick = () => { window.focus(); if (d.convId) openConv(d.convId); }; }
  });
}
async function bell() { const r = await api('/notifications'); unread = r.unread; window._notes = r.list; drawTop(); }
function showBell() {
  if (window.Notification && Notification.permission === 'default') Notification.requestPermission();
  const b = $('#bubble');
  if (b.innerHTML) { b.innerHTML = ''; return; }
  b.innerHTML = `<div class="bubble"><div class="row"><b class="grow">নোটিফিকেশন</b><button class="sec sm" data-a="readAll">সব পড়া হয়েছে</button></div>` + ((window._notes || []).map(n => `<div class="ni ${n.read ? '' : 'un'}" data-a="openNote" data-c="${n.convId || ''}">${esc(n.text)}<div class="small mut">${ago(n.at)} আগে</div></div>`).join('') || '<p class="mut">কিছু নেই</p>') + '</div>';
}

// ===== ইনবক্স =====
function viewInbox() {
  $('#main').innerHTML = `<div class="inbox ${F.cur ? 'st' : ''}" id="ib">
  <div class="lst"><div class="lh"><input id="q" placeholder="🔍 নাম, ফোন, অর্ডার নং বা চ্যাটের কথা…" value="${esc(F.q)}">
   <div class="row">${[['all', 'সব'], ['unread', 'অপঠিত'], ['human', '🙋 মানুষ'], ['mine', 'আমার'], ['unassigned', 'কেউ নেয়নি']].map(f => `<span class="chip ${F.filter === f[0] ? 'on' : ''}" data-a="filt" data-v="${f[0]}" style="cursor:pointer">${f[1]}</span>`).join('')}</div>
   <div class="row">${[['', 'সব প্ল্যাটফর্ম'], ['messenger', 'Messenger'], ['instagram', 'Instagram'], ['whatsapp', 'WhatsApp'], ['web', 'টেস্ট']].map(f => `<span class="chip ${F.platform === f[0] ? 'on' : ''}" data-a="plat" data-v="${f[0]}" style="cursor:pointer">${f[1]}</span>`).join('')}</div></div>
   <div class="convs" id="convs"></div></div>
  <div class="thr"><div id="thread" class="mut" style="padding:30px">একটা চ্যাট বেছে নিন</div></div><div class="side" id="side"></div></div>`;
  $('#q').oninput = debounce(e => { F.q = e.target.value; loadList(); }, 250);
  loadList(); if (F.cur) loadConv();
}
const loadList = guard(async () => {
  const l = await api(`/conversations?q=${encodeURIComponent(F.q)}&filter=${F.filter}&platform=${F.platform}`);
  const box = $('#convs'); if (!box) return;
  box.innerHTML = l.map(c => `<div class="ci ${F.cur === c.id ? 'on' : ''}" data-a="open" data-c="${c.id}"><div class="av">${esc((c.name || '?')[0])}</div><div class="t"><div class="n">${esc(c.name)} ${plb(c.platform)}${c.unread ? `<span class="ub">${c.unread}</span>` : ''}</div>
   <div class="l">${c.mode === 'human' ? '🙋 ' + (c.assignedTo ? esc((USERS.find(u => u.id === c.assignedTo) || {}).name || '') : 'কেউ নেয়নি') + ' · ' : ''}${c.hasDraft ? '📝 ড্রাফট · ' : ''}${esc(c.lastText)}</div></div><div class="small mut">${ago(c.lastAt)}</div></div>`).join('') || '<p class="mut" style="padding:14px">কোনো চ্যাট নেই</p>';
});
function openConv(id) { if (tab !== 'inbox') { F.cur = id; return go('inbox'); } F.cur = id; $('#ib').classList.add('st'); loadList(); loadConv(); }
function msgHTML(m) {
  if (m.role === 'system') return `<div class="sys">${esc(m.text)}</div>`;
  if (m.role === 'draft') { const a = m.meta.plan; return `<div class="msg draft"><div class="lbl">📝 AI ড্রাফট (কাস্টমারকে পাঠানো হয়নি)${a && a.action !== 'none' ? ' · অ্যাকশন: ' + a.action : ''}${a && a.product_codes.length ? ' · ' + a.product_codes.join(',') : ''}${a && a.handover_reason ? ' · কারণ: ' + esc(a.handover_reason) : ''}</div><textarea id="dr-${m.id}">${esc(m.text)}</textarea><div class="row"><button class="ok sm" data-a="drSend" data-m="${m.id}">✅ পাঠান</button><button class="bad sm" data-a="drDel" data-m="${m.id}">বাদ দিন</button></div></div>`; }
  const cu = m.role === 'customer', p = m.meta && m.meta.payload; let b = '';
  if (m.type === 'image') b = `<img class="pic" src="${esc(m.mediaUrl)}">${m.text ? `<div>${esc(m.text)}</div>` : ''}${m.meta.desc ? `<div class="hint">🔍 ${esc(m.meta.desc)}</div>` : ''}`;
  else if (m.type === 'audio') b = `<audio controls src="${esc(m.mediaUrl)}"></audio>${m.text ? `<div class="hint">🎤 ${esc(m.text)}</div>` : ''}`;
  else if (m.type === 'cards') b = '<div class="cards">' + ((p && p.items) || []).map(i => `<div class="cardm">${i.image ? `<img src="${esc(i.image)}">` : ''}<b>${esc(i.title)}</b><div class="small">${esc(i.subtitle)}</div><div>${i.buttons.map(x => `<span class="chip">${esc(x.title)}</span>`).join(' ')}</div></div>`).join('') + '</div>';
  else b = esc(m.text).replace(/\n/g, '<br>') + (p && p.buttons ? '<div style="margin-top:6px">' + p.buttons.map(x => `<span class="chip" style="color:#1d2030">${esc(x.title)}</span>`).join(' ') + '</div>' : '');
  const who = cu ? '' : m.role === 'ai' ? '🤖 AI' : '👤 ' + esc((m.meta && m.meta.by) || 'টিম');
  return `<div class="msg ${cu ? '' : m.role === 'ai' ? 'me' : 'agent'}">${who ? `<div class="lbl">${who} · ${fdt(m.at)}</div>` : `<div class="lbl">${fdt(m.at)}</div>`}${b}${m.meta && m.meta.error ? `<div class="err">⚠ পাঠানো যায়নি: ${esc(m.meta.error)}</div>` : ''}</div>`;
}
const loadConv = guard(async (soft) => {
  if (!F.cur) return;
  const d = await api('/conversations/' + F.cur), c = d.conv, u = d.customer;
  if (!$('#thread')) return;
  const keep = $('#cmp') ? $('#cmp').value : '';
  const atEnd = !$('#msgs') || $('#msgs').scrollHeight - $('#msgs').scrollTop - $('#msgs').clientHeight < 80;
  const drafts = {}; document.querySelectorAll('[id^="dr-"]').forEach(t => drafts[t.id] = t.value);
  $('#thread').className = ''; $('#thread').style = '';
  $('#thread').innerHTML = `<div class="th"><div class="row"><button class="sec sm back" data-a="backList">←</button><b class="grow">${esc(u.name || u.externalId)} ${plb(c.platform)} ${c.mode === 'human' ? '<span class="pill" style="background:#d98a00">🙋 মানুষ' + (c.assignedTo ? ': ' + esc((USERS.find(x => x.id === c.assignedTo) || {}).name || '') : ' (কেউ নেয়নি)') + '</span>' : '<span class="pill" style="background:#12a150">🤖 AI চালাচ্ছে</span>'}</b></div>
   ${c.handoverReason ? `<div class="small" style="color:#9a6700">⚠ ${esc(c.handoverReason)}</div>` : ''}
   <div class="row" style="margin-top:6px">${c.mode === 'ai' ? `<select id="mins" style="width:auto"><option value="30">৩০ মিনিট</option><option value="60" selected>১ ঘণ্টা</option><option value="240">৪ ঘণ্টা</option><option value="0">যতক্ষণ না ফেরত দিই</option></select><button class="sm" data-a="claim">🙋 আমি নিচ্ছি</button>` : `<button class="sm ok" data-a="toAI">🤖 AI-কে ফেরত দিন</button>${c.assignedTo !== ME.id ? '<button class="sm" data-a="claim">আমি নিচ্ছি</button>' : ''}`}
   <select id="asg" style="width:auto"><option value="">➡ অ্যাসাইন করুন…</option>${USERS.map(x => `<option value="${x.id}" ${c.assignedTo === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div></div>
   <div class="msgs" id="msgs">${d.messages.map(msgHTML).join('')}</div>
   <div class="comp"><textarea id="cmp" placeholder="কাস্টমারকে মেসেজ লিখুন (Enter = পাঠান)…"></textarea><button data-a="send">পাঠান</button></div>`;
  $('#cmp').value = keep; Object.entries(drafts).forEach(([k, v]) => { const t = $('#' + k); if (t) t.value = v; });
  $('#cmp').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); act.send(); } };
  $('#asg').onchange = guard(async e => { await api(`/conversations/${F.cur}/assign`, { body: { userId: e.target.value || null } }); loadConv(); });
  if (atEnd || !soft) $('#msgs').scrollTop = 1e9;
  if (!soft || !$('#side').innerHTML) drawSide(d);
  loadList();
});
function drawSide(d) {
  const u = d.customer, s = d.stats, l = d.lead;
  $('#side').innerHTML = `<div class="card"><h2>👤 কাস্টমার</h2>
  <div class="row"><span class="chip">🧾 ${s.total} অর্ডার</span><span class="chip" style="background:#e1f7ea">✅ ${s.delivered}</span><span class="chip" style="background:#fde8e8">↩ ${s.returned}</span><span class="chip" style="background:#fde8e8">✖ ${s.cancelled}</span></div>
  ${d.related.length ? `<div class="small mut">একই ফোন: ${d.related.map(r => esc(r.name || r.platform) + ' (' + r.platform + ')').join(', ')}</div>` : ''}
  <label>নাম</label><input id="pn" value="${esc(u.name)}"><label>ফোন</label><input id="pp" value="${esc(u.phone)}"><label>ঠিকানা</label><textarea id="pa">${esc(u.address)}</textarea>
  <div class="g2"><div><label>সম্বোধন</label><select id="ph"><option value="">—</option><option value="sir" ${u.honorific === 'sir' ? 'selected' : ''}>স্যার</option><option value="madam" ${u.honorific === 'madam' ? 'selected' : ''}>ম্যাম</option></select></div><div><label>ট্যাগ (কমা দিয়ে)</label><input id="pt" value="${esc((u.tags || []).join(', '))}"></div></div>
  <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="ptest" style="width:auto" ${u.tester ? 'checked' : ''}> টেস্ট কাস্টমার (প্র্যাক্টিস মোডেও AI সরাসরি উত্তর দেবে)</label>
  <button class="sm" data-a="saveCust" data-c="${u.id}" style="margin-top:6px">সেভ</button></div>
  <div class="card"><h2>🧾 অর্ডার</h2>${d.orders.map(o => `<div class="row small" style="margin-bottom:4px;cursor:pointer" data-a="gotoOrder" data-q="${o.no}">#${o.no} ${stb(o.status)} ${money(o.total)} <span class="mut">${ago(o.at)}</span></div>`).join('') || '<span class="mut small">নেই</span>'}
  <button class="sec sm" data-a="manualOrder" style="margin-top:6px">➕ টিম থেকে অর্ডার নিন</button><div id="mo"></div></div>
  <div class="card"><h2>📞 লিড / ফলো-আপ</h2>${l ? `<div class="small">${esc(l.interest || '')}</div><div class="g2"><div><label>অবস্থা</label><select id="ls">${[['new', 'নতুন'], ['interested', 'আগ্রহী'], ['follow_up', 'ফলো-আপ'], ['won', 'অর্ডার হয়েছে'], ['lost', 'হারিয়েছি']].map(x => `<option value="${x[0]}" ${l.stage === x[0] ? 'selected' : ''}>${x[1]}</option>`).join('')}</select></div><div><label>ফলো-আপের সময়</label><input type="datetime-local" id="lf" value="${dtl(l.followUpAt)}"></div></div><button class="sm" data-a="saveLead" data-l="${l.id}" style="margin-top:6px">সেভ</button>
  ${(l.callNotes || []).map(n => `<div class="note">${esc(n.text)} <b>[${esc(n.result)}]</b><div class="mut">${esc(n.by)} · ${fdt(n.at)}</div></div>`).join('')}
  <div class="row" style="margin-top:6px"><input class="grow" id="ln" placeholder="কলের ফল লিখুন"><select id="lr" style="width:auto"><option value="ordered">অর্ডার দেবে</option><option value="no_answer">ধরেনি</option><option value="thinking">ভাবছে</option><option value="not_interested">চায় না</option></select><button class="sm" data-a="callNote" data-l="${l.id}">যোগ</button></div>` : `<button class="sec sm" data-a="mkLead" data-c="${u.id}">লিড বানান</button>`}</div>
  <div class="card"><h2>📝 টিমের নোট</h2>${(u.notes || []).map(n => `<div class="note">${esc(n.text)}<div class="mut">${esc(n.by)} · ${fdt(n.at)}</div></div>`).join('')}<div class="row" style="margin-top:6px"><input class="grow" id="nt" placeholder="নোট (যেমন: বাসা চেনা কঠিন)"><button class="sm" data-a="addNote" data-c="${u.id}">যোগ</button></div></div>
  <div class="card"><h2>✨ AI সহকারী</h2><div class="row"><button class="sec sm" data-a="assist" data-m="summary">📄 সারাংশ</button><button class="sec sm" data-a="assist" data-m="draft">✍ রিপ্লাই ড্রাফট</button></div>
  <div class="row" style="margin-top:6px"><input class="grow" id="aq" placeholder="এই কাস্টমার নিয়ে প্রশ্ন করুন…"><button class="sm" data-a="assist" data-m="ask">জিজ্ঞেস</button></div><div id="ao" class="note" style="display:none;background:#f3f0ff;white-space:pre-wrap"></div><button class="sec sm" id="ause" style="display:none;margin-top:6px" data-a="useDraft">কম্পোজারে বসান</button></div>`;
}

// ===== অর্ডার =====
const NEXT = { pending: ['processing', 'shipped', 'cancelled'], processing: ['shipped', 'cancelled'], shipped: ['delivered', 'returned', 'cancelled'], delivered: ['returned'], cancelled: [], returned: [] };
function viewOrders() {
  $('#main').innerHTML = `<div class="card"><div class="row"><input id="oq" class="grow" placeholder="🔍 অর্ডার নং, নাম, ফোন, ঠিকানা…" value="${esc(F.orderQ)}"><button class="sec" data-a="ordRefresh">⟳</button></div><div class="row" id="ost" style="margin-top:8px"></div></div><div class="cols" style="grid-template-columns:1.4fr 1fr"><div class="card" id="olist"></div><div id="odetail"></div></div>`;
  $('#oq').oninput = debounce(e => { F.orderQ = e.target.value; loadOrders(); }, 250); loadOrders();
}
const loadOrders = guard(async () => {
  const r = await api(`/orders?status=${F.orderSt}&q=${encodeURIComponent(F.orderQ)}`);
  if (!$('#olist')) return;
  const all = Object.values(r.counts).reduce((a, b) => a + b, 0);
  $('#ost').innerHTML = `<span class="chip ${!F.orderSt ? 'on' : ''}" data-a="ordSt" data-v="" style="cursor:pointer">সব ${all}</span>` + Object.keys(ST).map(s => `<span class="chip ${F.orderSt === s ? 'on' : ''}" data-a="ordSt" data-v="${s}" style="cursor:pointer">${ST[s]} ${r.counts[s] || 0}</span>`).join('');
  window._orders = r.orders;
  $('#olist').innerHTML = `<table><tr><th>#</th><th>কাস্টমার</th><th>প্রোডাক্ট</th><th>মোট</th><th>অবস্থা</th></tr>` + r.orders.map(o => `<tr class="click" data-a="ordOpen" data-o="${o.id}"><td>#${o.no}</td><td>${esc(o.name)}<div class="small mut">${esc(o.phone)}</div></td><td class="small">${esc(o.items.map(i => i.name + (i.size ? ' (' + i.size + ')' : '') + ' ×' + i.qty).join(', '))}</td><td>${money(o.total)}${o.paid ? '<div class="small" style="color:#12a150">💵 পেয়েছি</div>' : ''}</td><td>${stb(o.status)}<div class="small mut">${ago(o.createdAt)}</div></td></tr>`).join('') + `</table>` + (r.orders.length ? '' : '<p class="mut">কোনো অর্ডার নেই</p>');
  if (F.ordOpen) drawOrder(r.orders.find(o => o.id === F.ordOpen));
});
function drawOrder(o) {
  const box = $('#odetail'); if (!box || !o) return;
  const nx = NEXT[o.status] || [];
  box.innerHTML = `<div class="card"><h2>অর্ডার #${o.no} ${stb(o.status)}</h2>
  <div class="small">${o.items.map(i => `${esc(i.name)}${i.size ? ' (' + esc(i.size) + ')' : ''} × ${i.qty} = ${money(i.price * i.qty)}`).join('<br>')}</div>
  <div class="small" style="margin-top:6px">সাবটোটাল ${money(o.subtotal)} + ডেলিভারি ${money(o.delivery)} = <b>${money(o.total)}</b> (${o.payment})</div>
  <h3>ডেলিভারি</h3><div class="small">👤 ${esc(o.name)}<br>📞 ${esc(o.phone)}<br>📍 ${esc(o.address)}</div>
  <div class="row" style="margin-top:6px"><button class="sm ${o.paid ? 'ok' : 'sec'}" data-a="ordPaid" data-o="${o.id}" data-v="${o.paid ? '' : '1'}">${o.paid ? '💵 টাকা পেয়েছি ✓ (বাতিল করুন)' : '💵 ক্যাশ হাতে এসেছে'}</button>${o.convId ? `<button class="sec sm" data-a="open" data-c="${o.convId}">💬 চ্যাট</button>` : ''}</div>
  ${o.courier ? `<h3>কুরিয়ার</h3><div class="small">${esc(o.courier.provider)} · ${esc(o.courier.trackingCode)} · ${esc(o.courier.status)} ${o.courier.url ? `<a href="${esc(o.courier.url)}" target="_blank">ট্র্যাক</a>` : ''}</div>` : ['pending', 'processing'].includes(o.status) ? `<button class="sm" style="margin-top:6px" data-a="ordCourier" data-o="${o.id}">🚚 কুরিয়ারে বুক করুন (১ ক্লিক)</button>` : ''}
  ${nx.length ? `<h3>অবস্থা বদলান</h3><div class="row">${nx.map(s => `<button class="sm ${['cancelled', 'returned'].includes(s) ? 'bad' : 'sec'}" data-a="ordStatus" data-o="${o.id}" data-s="${s}">${ST[s]}</button>`).join('')}</div><input id="orr" placeholder="বাতিল/রিটার্নের কারণ (এ দুটোতে বাধ্যতামূলক)" style="margin-top:6px">` : ''}
  ${o.reason ? `<div class="small" style="color:#d93a3a;margin-top:6px">কারণ: ${esc(o.reason)}</div>` : ''}${o.rating ? `<div class="small">রিভিউ: ${esc(o.rating)}</div>` : ''}
  <h3>নোট</h3>${(o.notes || []).map(n => `<div class="note">${esc(n.text)}<div class="mut">${esc(n.by)}</div></div>`).join('')}<div class="row"><input class="grow" id="onn" placeholder="নোট"><button class="sm" data-a="ordNote" data-o="${o.id}">যোগ</button></div>
  <h3>ইতিহাস</h3>${o.history.map(h => `<div class="small mut">${fdt(h.at)} · ${ST[h.status] || h.status} · ${esc(h.by)}${h.note ? ' · ' + esc(h.note) : ''}</div>`).join('')}</div>`;
}

// ===== লিড =====
const viewLeads = guard(async () => {
  const l = await api('/leads'), now = Date.now();
  $('#main').innerHTML = `<div class="card"><h2>📞 লিড ও ফলো-আপ</h2><p class="mut small">আগ্রহী কিন্তু অর্ডার না করা কাস্টমার এখানে জমা হয়। আজকের ফলো-আপ সবার ওপরে।</p></div>` + (l.map(x => {
    const due = x.followUpAt && x.followUpAt < now + 864e5 && !['won', 'lost'].includes(x.stage);
    return `<div class="card" style="${due ? 'border-color:#d98a00' : ''}"><div class="row"><b class="grow">${esc(x.name || '—')} ${plb(x.platform)}</b><span class="chip">${{ new: 'নতুন', interested: 'আগ্রহী', follow_up: 'ফলো-আপ', won: '✅ অর্ডার হয়েছে', lost: '❌ হারিয়েছি' }[x.stage]}</span></div>
    <div class="small">📞 ${esc(x.phone || '—')} · ${esc(x.interest || '')}</div>${x.followUpAt ? `<div class="small" style="color:${due ? '#d98a00' : '#6b7186'}">⏰ ফলো-আপ: ${fdt(x.followUpAt)}</div>` : ''}
    ${(x.callNotes || []).slice(-2).map(n => `<div class="note">${esc(n.text)} [${esc(n.result)}] <span class="mut">${esc(n.by)}</span></div>`).join('')}
    <div class="row" style="margin-top:6px"><button class="sec sm" data-a="open" data-c="${x.convId}">💬 চ্যাট</button><select data-l="${x.id}" class="lst2" style="width:auto"><option value="">অবস্থা বদলান…</option><option value="interested">আগ্রহী</option><option value="follow_up">ফলো-আপ</option><option value="won">অর্ডার হয়েছে</option><option value="lost">হারিয়েছি</option></select></div></div>`;
  }).join('') || '<p class="mut">কোনো লিড নেই</p>');
  document.querySelectorAll('.lst2').forEach(s => s.onchange = guard(async e => { if (e.target.value) { await api('/leads/' + e.target.dataset.l, { method: 'PATCH', body: { stage: e.target.value } }); viewLeads(); } }));
});

// ===== প্রোডাক্ট =====
const viewProducts = guard(async () => {
  const ps = await api('/products'); window._prods = ps;
  $('#main').innerHTML = `<div class="row" style="margin-bottom:10px"><button data-a="pNew">➕ নতুন প্রোডাক্ট</button><span class="mut small">স্টক ৩ বা কম হলে লাল দেখাবে। ছবির প্রথমটা AI ছবি মেলাতে ও কার্ডে ব্যবহার করে।</span></div><div id="pform"></div>
  <div class="card"><table><tr><th></th><th>কোড</th><th>নাম</th><th>দাম</th><th>স্টক</th><th></th></tr>${ps.map(p => `<tr><td>${p.images[0] ? `<img class="thumb" src="${esc(p.images[0])}">` : ''}</td><td>${esc(p.code)}</td><td>${esc(p.name)}<div class="small mut">${esc(p.category)}${p.active === false ? ' · 🚫 বন্ধ' : ''}</div></td><td>${money(p.price)}</td><td style="color:${p.totalStock <= 3 ? '#d93a3a' : 'inherit'}"><b>${p.totalStock}</b>${p.variants.length ? `<div class="small mut">${p.variants.map(v => esc(v.label) + ':' + v.stock).join(' ')}</div>` : ''}</td><td><button class="sec sm" data-a="pEdit" data-p="${p.id}">এডিট</button> <button class="bad sm" data-a="pDel" data-p="${p.id}">মুছুন</button></td></tr>`).join('')}</table>${ps.length ? '' : '<p class="mut">প্রথম প্রোডাক্ট যোগ করুন, না হলে AI কিছু দেখাতে পারবে না।</p>'}</div>`;
});
function pForm(p) {
  p = p || { images: [], variants: [], active: true }; window._pimgs = (p.images || []).slice();
  $('#pform').innerHTML = `<div class="card"><h2>${p.id ? 'প্রোডাক্ট এডিট' : 'নতুন প্রোডাক্ট'}</h2><div class="g2"><div><label>কোড (ফাঁকা রাখলে অটো)</label><input id="pc" value="${esc(p.code || '')}"></div><div><label>নাম *</label><input id="pnm" value="${esc(p.name || '')}"></div>
  <div><label>দাম (৳) *</label><input id="ppr" type="number" value="${p.price ?? ''}"></div><div><label>ক্যাটাগরি</label><input id="pcat" value="${esc(p.category || '')}"></div></div>
  <label>বিবরণ (AI এটা দেখে উত্তর দেয়: কাপড়, মাপ, ফিচার)</label><textarea id="pds">${esc(p.description || '')}</textarea>
  <div class="g2"><div><label>সাইজ ও স্টক (প্রতি লাইনে একটা: <code>M:5</code>)। সাইজ না থাকলে ফাঁকা রাখুন</label><textarea id="pv">${(p.variants || []).map(v => v.label + ':' + v.stock).join('\n')}</textarea></div><div><label>সাইজ না থাকলে মোট স্টক</label><input id="pst" type="number" value="${p.stock || 0}"><label>কীওয়ার্ড (কমা দিয়ে)</label><input id="pk" value="${esc(p.keywords || '')}"><label>ফেসবুক/ইনস্টা পোস্ট ID (কমা দিয়ে, কমেন্ট থেকে প্রোডাক্ট চেনার জন্য)</label><input id="ppo" value="${esc((p.postIds || []).join(', '))}"></div></div>
  <label>ছবি</label><div id="pim" class="row"></div><div class="row" style="margin-top:6px"><input type="file" id="pfile" accept="image/*" multiple style="width:auto"><input id="purl" class="grow" placeholder="অথবা ছবির লিংক"><button class="sec sm" data-a="pAddUrl">লিংক যোগ</button></div>
  <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="pact" style="width:auto" ${p.active !== false ? 'checked' : ''}> সক্রিয় (AI দেখাবে)</label><div class="row" style="margin-top:8px"><button data-a="pSave" data-p="${p.id || ''}">সেভ</button><button class="sec" data-a="pCancel">বাতিল</button></div></div>`;
  drawImgs(); $('#pfile').onchange = guard(async e => { for (const f of e.target.files) { const d = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); }); window._pimgs.push((await api('/upload', { body: { dataUrl: d } })).url); } drawImgs(); });
}
function drawImgs() { $('#pim').innerHTML = window._pimgs.map((u, i) => `<div style="position:relative"><img class="thumb" src="${esc(u)}"><span data-a="pImgDel" data-i="${i}" style="position:absolute;top:-6px;right:-6px;background:#d93a3a;color:#fff;border-radius:50%;width:18px;height:18px;text-align:center;cursor:pointer;font-size:12px">×</span></div>`).join('') || '<span class="mut small">ছবি নেই</span>'; }

// ===== রিপোর্ট =====
const viewReports = guard(async () => {
  const a = await api('/analytics'), t = a.days[0], y = a.days[1];
  const card = (l, v, o) => `<div class="stat"><span class="mut small">${l}</span><b>${v}</b><span class="small mut">গতকাল ${o}</span></div>`;
  $('#main').innerHTML = `<div class="g3">${card('আজকের কথোপকথন', t.chats, y.chats)}${card('কাস্টমারের মেসেজ', t.customerMsgs, y.customerMsgs)}${card('AI-র উত্তর', t.aiReplies, y.aiReplies)}${card('টিমের উত্তর', t.teamReplies, y.teamReplies)}${card('মানুষ ডাকা হয়েছে', t.handovers, y.handovers)}${card('অর্ডার', t.orders, y.orders)}${card('AI-র নেওয়া অর্ডার', t.aiOrders, y.aiOrders)}${card('টিমের নেওয়া অর্ডার', t.teamOrders, y.teamOrders)}${card('বিক্রি', money(t.revenue), money(y.revenue))}</div>
  <div class="card" style="margin-top:12px"><h2>গত ৭ দিন</h2><table><tr><th>দিন</th><th>চ্যাট</th><th>AI উত্তর</th><th>টিম উত্তর</th><th>হ্যান্ডওভার</th><th>অর্ডার (AI/টিম)</th><th>বিক্রি</th></tr>${a.days.map(d => `<tr><td>${d.day}</td><td>${d.chats}</td><td>${d.aiReplies}</td><td>${d.teamReplies}</td><td>${d.handovers}</td><td>${d.orders} (${d.aiOrders}/${d.teamOrders})</td><td>${money(d.revenue)}</td></tr>`).join('')}</table></div>
  <div class="cols"><div class="card"><h2>কেন অর্ডার হারাচ্ছি (বাতিল/রিটার্নের কারণ)</h2>${Object.entries(a.reasons).map(([k, v]) => `<div class="row"><span class="grow">${esc(k)}</span><b>${v}</b></div>`).join('') || '<span class="mut">এখনো কিছু নেই</span>'}<div class="small mut" style="margin-top:8px">খোলা লিড: ${a.openLeads} · হারানো লিড: ${a.lostLeads}</div></div>
  <div class="card"><h2>⚠ স্টক কম</h2>${a.lowStock.map(p => `<div class="row"><span class="grow">${esc(p.code)} · ${esc(p.name)}</span><b style="color:#d93a3a">${p.stock}</b></div>`).join('') || '<span class="mut">সব ঠিক আছে</span>'}</div></div>`;
});

// ===== এজেন্ট ডেস্ক =====
const viewDesk = guard(async () => {
  SET = { ...SET, ...(await api('/settings')) };
  $('#main').innerHTML = `<div class="cols"><div class="card"><h2>🎓 AI-কে শেখান</h2><p class="mut small">নিজের ভাষায় নিয়ম লিখুন (কেমন সুরে কথা বলবে, কী করবে না, ছাড়ের নীতি)। <b>ড্রাফট</b> বদলে টেস্ট করুন; পছন্দ হলে এক ক্লিকে <b>লাইভ</b>। পছন্দ না হলে আগের অবস্থায় ফেরা যায়।</p>
  <label>ড্রাফট নিয়ম</label><textarea id="rd" style="min-height:220px">${esc(SET.rulesDraft)}</textarea>
  <div class="row" style="margin-top:8px"><button class="sec" data-a="deskSave">💾 ড্রাফট সেভ</button>${ME.role === 'owner' ? '<button class="ok" data-a="deskLive">🚀 লাইভ করুন</button><button class="bad" data-a="deskRevert">↩ আগের ভার্সনে ফিরুন</button>' : '<span class="mut small">লাইভ করতে মালিক লাগবে</span>'}</div>
  <h3>এখন লাইভ যা চলছে</h3><div class="note" style="white-space:pre-wrap;background:#f4f5f8">${esc(SET.rulesLive)}</div></div>
  <div class="card"><h2>🧪 টেস্ট করুন (কাস্টমারকে কিছু যায় না)</h2>${SET.hasAI ? '' : '<div class="note">Gemini key নেই, তাই এটা ডেমো ব্রেইন। আসল উত্তর দেখতে .env-এ GEMINI_API_KEY দিন।</div>'}
  <div class="row"><input id="tm" class="grow" placeholder="কাস্টমার কী লিখবে? যেমন: ভাইয়া পাঞ্জাবির দাম কত?"><button data-a="deskTest">টেস্ট</button></div><div id="tr" style="margin-top:10px"></div></div></div>`;
});

// ===== টিম ও সেটিংস =====
const viewTeam = guard(async () => {
  USERS = await api('/users');
  $('#main').innerHTML = `<div class="cols"><div class="card"><h2>👥 টিম</h2>${USERS.map(u => `<div class="row" style="margin-bottom:6px"><b class="grow">${esc(u.name)} <span class="mut small">${esc(u.email)} · ${u.role === 'owner' ? 'মালিক' : 'টিমমেট'}</span></b>${u.id !== ME.id ? `<button class="bad sm" data-a="uDel" data-u="${u.id}">সরান</button>` : ''}</div>`).join('')}</div>
  <div class="card"><h2>➕ টিমমেট যোগ করুন</h2><p class="mut small">যত খুশি যোগ করুন। চ্যাট assign করলে তিনি নোটিফিকেশন পাবেন।</p><label>নাম</label><input id="un"><label>ইমেইল</label><input id="ue" type="email"><label>পাসওয়ার্ড (৬+)</label><input id="up" type="text"><button style="margin-top:8px" data-a="uAdd">যোগ করুন</button></div></div>`;
});
const viewSettings = guard(async () => {
  const s = await api('/settings');
  const ck = (id, v, l) => `<label style="display:flex;gap:6px;align-items:center;color:var(--tx)"><input type="checkbox" id="${id}" style="width:auto" ${v ? 'checked' : ''}> ${l}</label>`;
  $('#main').innerHTML = `<div class="card" style="max-width:720px"><h2>⚙ সেটিংস</h2>
  <label>ব্যবসার নাম</label><input id="sb" value="${esc(s.businessName)}">
  <div class="g2"><div><label>ডেলিভারি চার্জ: ঢাকার ভেতরে (৳)</label><input id="si" type="number" value="${s.deliveryInside}"></div><div><label>ঢাকার বাইরে (৳)</label><input id="so" type="number" value="${s.deliveryOutside}"></div></div>
  <label>ডেলিভারি সময় (গ্রাহককে যা বলা হবে)</label><input id="sd" value="${esc(s.deliveryDays)}"><label>রিভিউ লিংক (ভালো রেটিং দিলে পাঠানো হবে)</label><input id="sr" value="${esc(s.reviewLink)}">
  <label>মানুষ চ্যাট নিলে কতক্ষণ পর নিজে AI-তে ফিরবে (মিনিট, ০ = ফিরবে না)</label><input id="sh" type="number" value="${s.handoverMinutes}">
  <h3>চালু/বন্ধ</h3>${ck('sl', s.aiLive, '🔴 <b>AI লাইভ</b>: সব কাস্টমারকে সরাসরি উত্তর দেবে। বন্ধ থাকলে (প্র্যাক্টিস মোড) শুধু ড্রাফট বানাবে; আপনি দেখে পাঠাবেন। "টেস্ট কাস্টমার" চিহ্নিত চ্যাটে সবসময় সরাসরি উত্তর যায়।')}
  ${ck('sf', s.followupEnabled, '⏰ ফলো-আপ ইঞ্জিন: দাম দেখে চুপ হয়ে যাওয়া কাস্টমারকে একবার ভদ্রভাবে মনে করানো (২৩ ঘণ্টার ভেতরে)')}<label>কত ঘণ্টা চুপ থাকলে মনে করাবে</label><input id="sfh" type="number" value="${s.followupHours}">
  ${ck('sc', s.commentReplyEnabled, '💬 পোস্টের কমেন্টে উত্তর + ইনবক্সে মেসেজ (Meta-র অনুমতি লাগে)')}<button style="margin-top:10px" data-a="saveSettings">সেভ</button></div>`;
});

// ===== অ্যাকশন =====
const refreshSide = () => api('/conversations/' + F.cur).then(drawSide);
const act = {
  tab: (_, el) => go(el.dataset.t), bell: showBell, logout: async () => { await api('/auth/logout', { method: 'POST', body: {} }); location = '/login.html'; },
  readAll: guard(async () => { await api('/notifications/read', { method: 'POST', body: {} }); await bell(); $('#bubble').innerHTML = ''; }),
  openNote: (_, el) => { $('#bubble').innerHTML = ''; if (el.dataset.c) openConv(el.dataset.c); },
  filt: (_, el) => { F.filter = el.dataset.v; viewInbox(); }, plat: (_, el) => { F.platform = el.dataset.v; viewInbox(); },
  open: (_, el) => { if (tab !== 'inbox') { F.cur = el.dataset.c; go('inbox'); } else openConv(el.dataset.c); },
  backList: () => { F.cur = null; $('#ib').classList.remove('st'); },
  claim: guard(async () => { await api(`/conversations/${F.cur}/mode`, { body: { mode: 'human', minutes: $('#mins') ? $('#mins').value : 60 } }); loadConv(); }),
  toAI: guard(async () => { await api(`/conversations/${F.cur}/mode`, { body: { mode: 'ai' } }); loadConv(); }),
  send: guard(async () => { const t = $('#cmp').value.trim(); if (!t) return; $('#cmp').value = ''; await api(`/conversations/${F.cur}/send`, { body: { text: t } }); loadConv(); }),
  drSend: guard(async (_, el) => { await api(`/conversations/${F.cur}/drafts/${el.dataset.m}/send`, { body: { text: $('#dr-' + el.dataset.m).value } }); loadConv(); }),
  drDel: guard(async (_, el) => { await api(`/conversations/${F.cur}/drafts/${el.dataset.m}/discard`, { body: {} }); loadConv(); }),
  saveCust: guard(async (_, el) => { await api('/customers/' + el.dataset.c, { method: 'PATCH', body: { name: $('#pn').value, phone: $('#pp').value, address: $('#pa').value, honorific: $('#ph').value, tags: $('#pt').value, tester: $('#ptest').checked } }); toast('সেভ হয়েছে'); loadConv(); loadList(); }),
  addNote: guard(async (_, el) => { if (!$('#nt').value.trim()) return; await api(`/customers/${el.dataset.c}/notes`, { body: { text: $('#nt').value } }); refreshSide(); }),
  mkLead: guard(async (_, el) => { await api('/leads', { body: { customerId: el.dataset.c, interest: 'ম্যানুয়াল লিড' } }); refreshSide(); }),
  saveLead: guard(async (_, el) => { await api('/leads/' + el.dataset.l, { method: 'PATCH', body: { stage: $('#ls').value, followUpAt: $('#lf').value ? new Date($('#lf').value).getTime() : null } }); toast('সেভ হয়েছে'); refreshSide(); }),
  callNote: guard(async (_, el) => { if (!$('#ln').value.trim()) return; await api(`/leads/${el.dataset.l}/call`, { body: { text: $('#ln').value, result: $('#lr').value } }); refreshSide(); }),
  gotoOrder: (_, el) => { F.orderQ = el.dataset.q; F.orderSt = ''; go('orders'); },
  assist: guard(async (_, el) => { const o = $('#ao'); o.style.display = 'block'; o.textContent = '⏳ ভাবছি…'; const r = await api('/ai/assist', { body: { convId: F.cur, mode: el.dataset.m, question: $('#aq').value } }); o.textContent = r.text; $('#ause').style.display = el.dataset.m === 'draft' ? 'inline-block' : 'none'; }),
  useDraft: () => { $('#cmp').value = $('#ao').textContent; $('#cmp').focus(); },
  manualOrder: guard(async () => {
    const ps = await api('/products'), d = await api('/conversations/' + F.cur), u = d.customer;
    $('#mo').innerHTML = `<div class="note" style="background:#f4f5f8"><label>প্রোডাক্ট</label><select id="mp">${ps.filter(p => p.totalStock > 0).map(p => `<option value="${p.code}">${esc(p.code)} · ${esc(p.name)} (${p.totalStock})</option>`).join('')}</select><div class="g2"><div><label>সাইজ</label><input id="ms" placeholder="যেমন M"></div><div><label>পরিমাণ</label><input id="mq" type="number" value="1"></div></div><label>নাম</label><input id="mn" value="${esc(u.name)}"><label>ফোন</label><input id="mph" value="${esc(u.phone)}"><label>ঠিকানা</label><textarea id="ma">${esc(u.address)}</textarea><button class="sm" data-a="moSave" style="margin-top:6px">অর্ডার তৈরি + চ্যাটে বিল পাঠান</button></div>`;
  }),
  moSave: guard(async () => { await api('/orders/manual', { body: { convId: F.cur, code: $('#mp').value, size: $('#ms').value, qty: $('#mq').value, name: $('#mn').value, phone: $('#mph').value, address: $('#ma').value } }); toast('অর্ডার হয়েছে ✅'); loadConv(); }),
  // অর্ডার
  ordRefresh: () => loadOrders(), ordSt: (_, el) => { F.orderSt = el.dataset.v; loadOrders(); }, ordOpen: (_, el) => { F.ordOpen = el.dataset.o; drawOrder((window._orders || []).find(o => o.id === F.ordOpen)); },
  ordStatus: guard(async (_, el) => { await api(`/orders/${el.dataset.o}/status`, { method: 'PATCH', body: { status: el.dataset.s, reason: $('#orr') ? $('#orr').value : '' } }); loadOrders(); }),
  ordPaid: guard(async (_, el) => { await api(`/orders/${el.dataset.o}/paid`, { body: { paid: !!el.dataset.v } }); loadOrders(); }),
  ordNote: guard(async (_, el) => { if (!$('#onn').value.trim()) return; await api(`/orders/${el.dataset.o}/note`, { body: { text: $('#onn').value } }); loadOrders(); }),
  ordCourier: guard(async (_, el) => { if (!confirm('কুরিয়ারে বুক করব? কাস্টমারকে ট্র্যাকিং চলে যাবে।')) return; await api(`/orders/${el.dataset.o}/courier`, { body: {} }); loadOrders(); }),
  // প্রোডাক্ট
  pNew: () => pForm(), pCancel: () => { $('#pform').innerHTML = ''; }, pEdit: (_, el) => { pForm(window._prods.find(p => p.id === el.dataset.p)); scrollTo(0, 0); },
  pDel: guard(async (_, el) => { if (confirm('মুছে ফেলবেন?')) { await api('/products/' + el.dataset.p, { method: 'DELETE' }); viewProducts(); } }),
  pAddUrl: () => { const v = $('#purl').value.trim(); if (v) { window._pimgs.push(v); $('#purl').value = ''; drawImgs(); } },
  pImgDel: (_, el) => { window._pimgs.splice(+el.dataset.i, 1); drawImgs(); },
  pSave: guard(async (_, el) => {
    const variants = $('#pv').value.split('\n').map(l => l.trim()).filter(Boolean).map(l => { const i = l.lastIndexOf(':'); return i < 0 ? { label: l, stock: 0 } : { label: l.slice(0, i).trim(), stock: +l.slice(i + 1) || 0 }; });
    const body = { code: $('#pc').value, name: $('#pnm').value, price: $('#ppr').value, category: $('#pcat').value, description: $('#pds').value, variants, stock: $('#pst').value, keywords: $('#pk').value, postIds: $('#ppo').value, images: window._pimgs, active: $('#pact').checked };
    await api(el.dataset.p ? '/products/' + el.dataset.p : '/products', { method: el.dataset.p ? 'PUT' : 'POST', body }); viewProducts();
  }),
  // ডেস্ক
  deskSave: guard(async () => { await api('/settings', { method: 'PUT', body: { rulesDraft: $('#rd').value } }); toast('ড্রাফট সেভ হয়েছে'); }),
  deskLive: guard(async () => { await api('/settings', { method: 'PUT', body: { rulesDraft: $('#rd').value } }); if (!confirm('এই নিয়ম এখন থেকে সব কাস্টমারের সাথে চলবে। লাইভ করব?')) return; await api('/desk/live', { body: {} }); toast('🚀 লাইভ হয়েছে'); viewDesk(); }),
  deskRevert: guard(async () => { if (!confirm('আগের ভার্সনে ফিরব?')) return; await api('/desk/revert', { body: {} }); viewDesk(); }),
  deskTest: guard(async () => { const m = $('#tm').value.trim(); if (!m) return; $('#tr').textContent = '⏳'; const r = (await api('/desk/test', { body: { message: m, rules: $('#rd').value } })).plan; $('#tr').innerHTML = `<div class="note" style="background:#f3f0ff;white-space:pre-wrap"><b>AI-র উত্তর:</b>\n${esc(r.reply || '(কোনো টেক্সট নেই)')}</div><div class="small mut" style="margin-top:6px">অ্যাকশন: <b>${esc(r.action)}</b>${r.product_codes.length ? ' · প্রোডাক্ট: ' + esc(r.product_codes.join(', ')) : ''}${r.handover_reason ? ' · হ্যান্ডওভার কারণ: ' + esc(r.handover_reason) : ''}${r.intent ? ' · উদ্দেশ্য: ' + esc(r.intent) : ''}</div>`; }),
  // টিম/সেটিংস
  uAdd: guard(async () => { await api('/users', { body: { name: $('#un').value, email: $('#ue').value, password: $('#up').value } }); viewTeam(); }),
  uDel: guard(async (_, el) => { if (confirm('সরাবেন?')) { await api('/users/' + el.dataset.u, { method: 'DELETE' }); viewTeam(); } }),
  saveSettings: guard(async () => { SET = { ...SET, ...(await api('/settings', { method: 'PUT', body: { businessName: $('#sb').value, deliveryInside: $('#si').value, deliveryOutside: $('#so').value, deliveryDays: $('#sd').value, reviewLink: $('#sr').value, handoverMinutes: $('#sh').value, aiLive: $('#sl').checked, followupEnabled: $('#sf').checked, followupHours: $('#sfh').value, commentReplyEnabled: $('#sc').checked } })) }; drawTop(); toast('সেভ হয়েছে ✅'); }),
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]'); if (!el) { if (!e.target.closest('.bubble') && !e.target.closest('.bell')) $('#bubble').innerHTML = ''; return; }
  const f = act[el.dataset.a]; if (f) f(el.dataset, el);
});
boot().catch(e => { if (e.message !== 'login') $('#main').textContent = 'ত্রুটি: ' + e.message; });
