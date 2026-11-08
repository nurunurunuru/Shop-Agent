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
// চ্যানেলের আইকন (যে চ্যানেল থেকে মেসেজ আসে সেটার)
const IC = {
  messenger: '<circle cx="12" cy="12" r="12" fill="#0a84ff"/><path d="M12 5.2c-3.7 0-6.6 2.7-6.6 6.2 0 2 .9 3.700 2.400 4.800V19l2.600-1.400c.5.1 1.100.2 1.600.2 3.700 0 6.600-2.700 6.600-6.200S15.700 5.200 12 5.200zm.7 8.300l-1.700-1.800-3.200 1.800 3.500-3.700 1.700 1.800 3.200-1.800-3.500 3.700z" fill="#fff"/>',
  instagram: '<defs><linearGradient id="ig" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#feda75"/><stop offset=".5" stop-color="#d62976"/><stop offset="1" stop-color="#4f5bd5"/></linearGradient></defs><rect width="24" height="24" rx="7" fill="url(#ig)"/><rect x="6" y="6" width="12" height="12" rx="4" fill="none" stroke="#fff" stroke-width="1.8"/><circle cx="12" cy="12" r="2.8" fill="none" stroke="#fff" stroke-width="1.8"/><circle cx="16.2" cy="7.8" r="1" fill="#fff"/>',
  whatsapp: '<circle cx="12" cy="12" r="12" fill="#25a244"/><path d="M12 5a7 7 0 0 0-6 10.500L5 19l3.600-1A7 7 0 1 0 12 5zm3.400 9.600c-.2.600-1 1-1.600 1.100-.4.100-1 .1-3.100-.8-2.600-1.200-4-3.900-4.100-4.100-.1-.2-.9-1.200-.9-2.300s.6-1.600.8-1.800c.2-.2.400-.3.600-.3h.4c.1 0 .3 0 .5.400.2.500.7 1.700.8 1.800.1.100.1.300 0 .5-.1.200-.2.300-.3.500l-.4.400c-.1.100-.3.300-.1.600.2.300.7 1.100 1.500 1.800 1 .900 1.800 1.200 2.100 1.300.3.100.4.100.6-.1.200-.2.700-.8.900-1.100.2-.3.400-.2.600-.1l1.700.8c.3.100.5.200.5.300.1.100.1.600-.1 1.200z" fill="#fff"/>',
  web: '<circle cx="12" cy="12" r="12" fill="#8a8fa3"/><path d="M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm0 1.500c.8 1 1.300 2.200 1.500 3.500h-3c.2-1.300.7-2.500 1.500-3.500zM7 11h2.400c0 .7 0 1.300.1 2H7.200A5.500 5.500 0 0 1 7 11zm.6 3.500H9.700c.2 1 .6 1.900 1.100 2.700a5.600 5.600 0 0 1-3.200-2.700zm9.800 0a5.600 5.600 0 0 1-3.200 2.700c.5-.8.900-1.700 1.100-2.700h2.100zM14.600 13c.1-.7.1-1.300.1-2H17c.1.600.1 1.300 0 2h-2.400z" fill="#fff"/>',
};
const plIcon = (p, s = 16) => `<svg class="pi" width="${s}" height="${s}" viewBox="0 0 24 24" title="${esc(p)}">${IC[p] || IC.web}</svg>`;
const avatar = (c, s = 40) => `<div class="avw" style="width:${s}px;height:${s}px">${c.avatar ? `<img class="av" style="width:${s}px;height:${s}px" src="${esc(c.avatar)}" alt="">` : `<div class="av ini" style="width:${s}px;height:${s}px;font-size:${Math.round(s * .42)}px">${esc((c.name || '?').replace(/^[+…\s]+/, '')[0] || '?')}</div>`}<span class="avb">${plIcon(c.platform, Math.max(14, Math.round(s * .4)))}</span></div>`;
const PRI = { high: ['🔥 হাই প্রায়োরিটি', 'pr-h'], normal: ['নরমাল', 'pr-n'], low: ['⬇ লো প্রায়োরিটি', 'pr-l'] };
const KIND = { new: '🆕 নতুন', old: '🔁 পুরোনো', regular: '⭐ রেগুলার' };
const tagsHTML = c => `<span class="tg ${PRI[c.priority][1]}" title="${esc(c.why || '')}">${PRI[c.priority][0]}</span><span class="tg k-${c.kind}">${KIND[c.kind]}</span>${(c.tags || []).map(t => `<span class="tg tg-c">#${esc(t)}</span>`).join('')}`;
const ST = { pending: 'পেন্ডিং', processing: 'প্রসেসিং', shipped: 'শিপড', delivered: 'ডেলিভারড', cancelled: 'বাতিল', returned: 'রিটার্ন' };
const STC = { pending: 'pend', processing: 'proc', shipped: 'ship', delivered: 'deli', cancelled: 'canc', returned: 'retu' };
const stb = s => `<span class="pill ${STC[s]}">${ST[s] || s}</span>`;
const fdt = t => t ? new Date(t).toLocaleString('bn-BD', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
const ago = t => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'এইমাত্র' : m < 60 ? m + ' মি' : m < 1440 ? Math.round(m / 60) + ' ঘ' : Math.round(m / 1440) + ' দিন'; };
const dtl = t => { if (!t) return ''; const d = new Date(t - new Date().getTimezoneOffset() * 6e4); return d.toISOString().slice(0, 16); };
const debounce = (f, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };
const readDU = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
// ছবি আপলোডের আগে ছোট করা (দ্রুত ও Messenger-এ নির্ভরযোগ্য; AI-র ছবি মেলানোর জন্যও দরকার)
async function prepFile(f) {
  if (!/^image\//.test(f.type) && f.size > 10 * 1024 * 1024) throw new Error(f.name + ' ১০MB-এর বেশি');
  const du = await readDU(f);
  if (!/^image\/(jpeg|png|webp)$/.test(f.type) || !window.HTMLCanvasElement) return du;
  return new Promise(res => { const im = new Image(); im.onload = () => { const k = Math.min(1, 1280 / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = Math.max(1, Math.round(im.width * k)); c.height = Math.max(1, Math.round(im.height * k)); try { c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', 0.85)); } catch { res(du); } }; im.onerror = () => res(du); im.src = du; });
}
const uploadFile = async f => api('/upload', { body: { dataUrl: await prepFile(f), name: f.name } });

let ME, SET = {}, USERS = [], tab = 'inbox', unread = 0;
const can = p => ME.role === 'owner' || (ME.perms || []).includes(p);
const F = { filter: 'all', platform: '', priority: '', kind: '', assignee: '', tag: '', purchased: false, q: '', cur: null, orderQ: '', orderSt: '', ordOpen: null, tUser: null };
const TABS = [['inbox', '💬 ইনবক্স', 'inbox'], ['orders', '🧾 অর্ডার', 'orders'], ['leads', '📞 লিড', 'leads'], ['offers', '🎁 অফার', 'leads'], ['products', '🛍 প্রোডাক্ট', 'products'], ['reports', '📊 রিপোর্ট ও হিসাব', 'reports'], ['desk', '🎓 এজেন্ট ডেস্ক', 'desk'], ['team', '👥 টিম', 'team'], ['settings', '⚙ সেটিংস', 'settings']];
const PERM_LABEL = { inbox: 'ইনবক্স/চ্যাট', orders: 'অর্ডার', leads: 'লিড ও অফার', products: 'প্রোডাক্ট', reports: 'রিপোর্ট ও হিসাব', desk: 'এজেন্ট ডেস্ক', team: 'টিম ম্যানেজ', settings: 'সেটিংস' };
const PRESET_LABEL = { full: 'ফুল অ্যাক্সেস', partial: 'আংশিক (চ্যাট+অর্ডার+লিড)', basic: 'বেসিক (শুধু চ্যাট)', custom: 'কাস্টম' };
const PRESETS = { full: Object.keys(PERM_LABEL), partial: ['inbox', 'orders', 'leads'], basic: ['inbox'] };

async function boot() {
  const me = await api('/me'); ME = me.user; SET = me.settings; USERS = await api('/users');
  drawTop(); const t = location.hash.slice(1); go(TABS.some(x => x[0] === t && can(x[2])) ? t : (TABS.find(x => can(x[2])) || TABS[0])[0]); bell(); sse();
}
function drawTop() {
  $('#top').innerHTML = `<span class="brand">🤖 ${esc(SET.businessName || 'Shop Agent')}</span>` + TABS.filter(t => can(t[2])).map(t => `<button class="tabb ${tab === t[0] ? 'on' : ''}" data-a="tab" data-t="${t[0]}">${t[1]}</button>`).join('')
    + `<a href="/simulator.html" target="_blank" class="tabb" style="text-decoration:none">🧪 সিমুলেটর</a><span class="sp"></span>`
    + `<span class="small mut" title="${SET.hasAI ? 'Gemini চালু' : 'Gemini key নেই: ডেমো মোড'}">${SET.hasAI ? '🟢 AI' : '🟠 ডেমো'}</span> <span class="chip">${SET.aiLive ? '🔴 লাইভ' : '🧪 প্র্যাক্টিস'}</span>`
    + `<button class="bell" data-a="bell">🔔${unread ? `<b>${unread}</b>` : ''}</button><span class="small">${esc(ME.name)}</span><button class="sec sm" data-a="logout">বের হন</button>`;
}
function go(t) {
  tab = t; location.hash = t; drawTop();
  ({ inbox: viewInbox, orders: viewOrders, leads: viewLeads, offers: viewOffers, products: viewProducts, reports: viewReports, desk: viewDesk, team: viewTeam, settings: viewSettings }[t] || viewInbox)();
}

// ===== রিয়েল-টাইম =====
function sse() {
  const es = new EventSource('/api/events');
  const rl = debounce(() => { if (tab === 'inbox') { loadList(); if (F.cur) loadConv(true); } }, 250);
  es.addEventListener('msg', rl); es.addEventListener('conv', rl);
  es.addEventListener('order', debounce(() => { if (tab === 'orders') loadOrders(); }, 300));
  es.addEventListener('notify', e => {
    const d = JSON.parse(e.data); bell();
    if (window.Notification && Notification.permission === 'granted') { const n = new Notification(SET.businessName || 'Shop Agent', { body: d.text }); n.onclick = () => { window.focus(); if (d.convId) openConv(d.convId); }; }
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
  const sel = (id, opts, cur) => `<select id="${id}" class="fs">${opts.map(o => `<option value="${esc(o[0])}" ${cur === o[0] ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select>`;
  $('#main').innerHTML = `<div class="inbox ${F.cur ? 'st' : ''}" id="ib">
  <div class="lst"><div class="lh"><input id="q" placeholder="🔍 নাম, ফোন, অর্ডার নং বা চ্যাটের কথা…" value="${esc(F.q)}">
   <div class="row">${[['all', 'সব'], ['unread', 'অপঠিত'], ['human', '🙋 মানুষ'], ['mine', 'আমার'], ['unassigned', 'কেউ নেয়নি']].map(f => `<span class="chip ${F.filter === f[0] ? 'on' : ''}" data-a="filt" data-v="${f[0]}" style="cursor:pointer">${f[1]}</span>`).join('')}</div>
   <div class="row">${sel('fpri', [['', 'সব প্রায়োরিটি'], ['high', '🔥 হাই'], ['normal', 'নরমাল'], ['low', '⬇ লো']], F.priority)}${sel('fkind', [['', 'সব ধরন'], ['new', '🆕 নতুন'], ['old', '🔁 পুরোনো'], ['regular', '⭐ রেগুলার']], F.kind)}</div>
   <div class="row">${sel('fasg', [['', 'সবার চ্যাট'], ['none', 'কারও না'], ...USERS.map(u => [u.id, '👤 ' + u.name])], F.assignee)}<select id="ftag" class="fs"><option value="">সব ট্যাগ</option></select></div>
   <div class="row"><label class="chkl"><input type="checkbox" id="fbuy" ${F.purchased ? 'checked' : ''}> ✅ শুধু যারা কিনেছেন</label></div>
   <div class="row">${[['', 'সব'], ['messenger', 'Messenger'], ['instagram', 'Instagram'], ['whatsapp', 'WhatsApp'], ['web', 'টেস্ট']].map(f => `<span class="chip ${F.platform === f[0] ? 'on' : ''}" data-a="plat" data-v="${f[0]}" style="cursor:pointer">${f[0] ? plIcon(f[0], 13) + ' ' : ''}${f[1]}</span>`).join('')}</div></div>
   <div class="convs" id="convs"></div></div>
  <div class="thr"><div id="thread" class="mut" style="padding:30px">একটা চ্যাট বেছে নিন</div></div><div class="side" id="side"></div></div>`;
  $('#q').oninput = debounce(e => { F.q = e.target.value; loadList(); }, 250);
  [['fpri', 'priority'], ['fkind', 'kind'], ['fasg', 'assignee'], ['ftag', 'tag']].forEach(([id, k]) => $('#' + id).onchange = e => { F[k] = e.target.value; loadList(); });
  $('#fbuy').onchange = e => { F.purchased = e.target.checked; loadList(); };
  loadList(); if (F.cur) loadConv();
}
const loadList = guard(async () => {
  const qs = `q=${encodeURIComponent(F.q)}&filter=${F.filter}&platform=${F.platform}&priority=${F.priority}&kind=${F.kind}&assignee=${F.assignee}&tag=${encodeURIComponent(F.tag)}${F.purchased ? '&purchased=1' : ''}`;
  const r = await api('/conversations?' + qs), box = $('#convs'); if (!box) return;
  const ft = $('#ftag'); if (ft) ft.innerHTML = '<option value="">সব ট্যাগ</option>' + r.tags.map(t => `<option value="${esc(t)}" ${F.tag === t ? 'selected' : ''}>#${esc(t)}</option>`).join('');
  box.innerHTML = r.list.map(c => `<div class="ci ${F.cur === c.id ? 'on' : ''}" data-a="open" data-c="${c.id}">${avatar(c, 42)}<div class="t"><div class="n"><span class="nm">${esc(c.name)}</span>${c.purchased ? '<span class="done" title="এর আগে কিনেছেন">✅</span>' : ''}${c.unread ? `<span class="ub">${c.unread}</span>` : ''}</div>
   <div class="tgs">${tagsHTML(c)}</div>
   <div class="l">${c.mode === 'human' ? '🙋 ' + (c.assignedTo ? esc((USERS.find(u => u.id === c.assignedTo) || {}).name || '') : 'কেউ নেয়নি') + ' · ' : ''}${c.hasDraft ? '📝 ড্রাফট · ' : ''}${esc(c.lastText)}</div></div><div class="small mut">${ago(c.lastAt)}</div></div>`).join('') || '<p class="mut" style="padding:14px">কোনো চ্যাট নেই</p>';
});
function openConv(id) { if (tab !== 'inbox') { F.cur = id; return go('inbox'); } F.cur = id; $('#ib').classList.add('st'); loadList(); loadConv(); }
function msgHTML(m) {
  if (m.role === 'system') return `<div class="sys">${esc(m.text)}</div>`;
  if (m.role === 'draft') { const a = m.meta.plan; return `<div class="msg draft"><div class="lbl">📝 AI ড্রাফট (কাস্টমারকে পাঠানো হয়নি)${a && a.action !== 'none' ? ' · অ্যাকশন: ' + a.action : ''}${a && a.product_codes.length ? ' · ' + a.product_codes.join(',') : ''}${a && a.handover_reason ? ' · কারণ: ' + esc(a.handover_reason) : ''}</div><textarea id="dr-${m.id}">${esc(m.text)}</textarea><div class="row"><button class="ok sm" data-a="drSend" data-m="${m.id}">✅ পাঠান</button><button class="bad sm" data-a="drDel" data-m="${m.id}">বাদ দিন</button></div></div>`; }
  const cu = m.role === 'customer', p = m.meta && m.meta.payload; let b = '';
  if (m.type === 'image') b = `<a href="${esc(m.mediaUrl)}" target="_blank"><img class="pic" src="${esc(m.mediaUrl)}"></a>${m.text ? `<div>${esc(m.text)}</div>` : ''}${m.meta.desc ? `<div class="hint">🔍 ${esc(m.meta.desc)}</div>` : ''}${m.meta.match ? `<div class="hint">🎯 ক্যাটালগে মিল: ${(m.meta.match.codes || []).map(esc).join(', ') || 'পাওয়া যায়নি'} (${esc(m.meta.match.confidence || '')})</div>` : ''}`;
  else if (m.type === 'video') b = `<video class="pic" controls src="${esc(m.mediaUrl)}"></video>`;
  else if (m.type === 'file') b = `<a class="fileb" href="${esc(m.mediaUrl)}" target="_blank">📎 ${esc(m.text || 'ফাইল')}</a>`;
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
  $('#thread').innerHTML = `<div class="th"><div class="row"><button class="sec sm back" data-a="backList">←</button>${avatar(c, 40)}<div class="grow"><b>${esc(c.name)}</b> ${plIcon(c.platform, 16)} ${c.mode === 'human' ? '<span class="pill" style="background:#d98a00">🙋 মানুষ' + (c.assignedTo ? ': ' + esc((USERS.find(x => x.id === c.assignedTo) || {}).name || '') : ' (কেউ নেয়নি)') + '</span>' : '<span class="pill" style="background:#12a150">🤖 AI চালাচ্ছে</span>'}
   <div class="tgs">${tagsHTML(c)}</div></div>
   <select id="prSel" class="fs" title="${esc(d.score.why || '')}" style="width:auto"><option value="">প্রায়োরিটি: অটো</option><option value="high" ${u.priority === 'high' ? 'selected' : ''}>🔥 হাই</option><option value="normal" ${u.priority === 'normal' ? 'selected' : ''}>নরমাল</option><option value="low" ${u.priority === 'low' ? 'selected' : ''}>⬇ লো</option></select></div>
   ${c.handoverReason ? `<div class="small" style="color:#9a6700">⚠ ${esc(c.handoverReason)}</div>` : ''}
   <div class="row" style="margin-top:6px">${c.mode === 'ai' ? `<select id="mins" style="width:auto"><option value="30">৩০ মিনিট</option><option value="60" selected>১ ঘণ্টা</option><option value="240">৪ ঘণ্টা</option><option value="0">যতক্ষণ না ফেরত দিই</option></select><button class="sm" data-a="claim">🙋 আমি নিচ্ছি</button>` : `<button class="sm ok" data-a="toAI">🤖 AI-কে ফেরত দিন</button>${c.assignedTo !== ME.id ? '<button class="sm" data-a="claim">আমি নিচ্ছি</button>' : ''}`}
   <select id="asg" style="width:auto"><option value="">➡ অ্যাসাইন করুন…</option>${USERS.map(x => `<option value="${x.id}" ${c.assignedTo === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div></div>
   <div class="msgs" id="msgs">${d.messages.map(msgHTML).join('')}</div>
   <div id="prodpanel" hidden></div>
   <div class="comp"><input type="file" id="fileIn" multiple hidden accept="image/*,video/mp4,.pdf,.doc,.docx,.xls,.xlsx,.txt"><button class="sec" data-a="attach" title="ছবি/ভিডিও/ফাইল পাঠান (পিসি বা মোবাইল থেকে)">📎</button><button class="sec" data-a="prodPanel" title="প্রোডাক্ট কার্ড পাঠান">🛍</button><textarea id="cmp" placeholder="কাস্টমারকে মেসেজ লিখুন (Enter = পাঠান)…"></textarea><button data-a="send">পাঠান</button></div>`;
  $('#cmp').value = keep; Object.entries(drafts).forEach(([k, v]) => { const t = $('#' + k); if (t) t.value = v; });
  $('#cmp').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); act.send(); } };
  $('#asg').onchange = guard(async e => { await api(`/conversations/${F.cur}/assign`, { body: { userId: e.target.value || null } }); loadConv(); });
  $('#prSel').onchange = guard(async e => { await api('/customers/' + u.id, { method: 'PATCH', body: { priority: e.target.value } }); loadConv(); loadList(); });
  $('#fileIn').onchange = guard(async e => {
    const files = [...e.target.files]; e.target.value = ''; if (!files.length) return;
    const up = []; for (const f of files) { const r = await uploadFile(f); up.push({ url: r.url, kind: r.kind === 'image' || r.kind === 'video' ? r.kind : 'file', name: r.name }); }
    await api(`/conversations/${F.cur}/attach`, { body: { files: up } }); loadConv();
  });
  if (atEnd || !soft) $('#msgs').scrollTop = 1e9;
  if (!soft || !$('#side').innerHTML) drawSide(d);
  loadList();
});
function drawSide(d) {
  const u = d.customer, s = d.stats, l = d.lead, c = d.conv;
  $('#side').innerHTML = `<div class="card"><div class="row">${avatar(c, 56)}<div class="grow"><h2 style="margin:0">${esc(u.displayName)}</h2><div class="tgs">${tagsHTML(c)}</div></div></div>
  ${d.score.why ? `<div class="small mut" style="margin-top:4px">কারণ: ${esc(d.score.why)}</div>` : ''}
  ${u.profileError ? `<div class="note" style="background:#fde8e8">⚠ Facebook থেকে আসল নাম/ছবি আনা যায়নি: ${esc(u.profileError)}<br><span class="small">Meta App-এ "Business Asset User Profile Access" ফিচার চালু/অনুমোদিত লাগে।</span></div>` : ''}
  ${(u.platform === 'messenger' || u.platform === 'instagram') ? `<button class="sec sm" data-a="refreshProfile" data-c="${u.id}" style="margin-top:6px">🔄 নাম ও ছবি আনুন</button>` : ''}
  <div class="row" style="margin-top:8px"><span class="chip">🧾 ${s.total} অর্ডার</span><span class="chip" style="background:#e1f7ea">✅ ${s.delivered}</span><span class="chip" style="background:#fde8e8">↩ ${s.returned}</span><span class="chip" style="background:#fde8e8">✖ ${s.cancelled}</span></div>
  ${d.related.length ? `<div class="small mut">একই ফোন: ${d.related.map(r => esc(r.name || r.platform) + ' (' + r.platform + ')').join(', ')}</div>` : ''}
  <label>নাম</label><input id="pn" value="${esc(u.name)}"><label>ফোন</label><input id="pp" value="${esc(u.phone)}"><label>ঠিকানা</label><textarea id="pa">${esc(u.address)}</textarea>
  <div class="g2"><div><label>সম্বোধন</label><select id="ph"><option value="">—</option><option value="sir" ${u.honorific === 'sir' ? 'selected' : ''}>স্যার</option><option value="madam" ${u.honorific === 'madam' ? 'selected' : ''}>ম্যাম</option></select></div><div><label>ট্যাগ (কমা দিয়ে)</label><input id="pt" value="${esc((u.tags || []).join(', '))}"></div></div>
  ${u.lastSize ? `<div class="small mut">সাধারণত নেন: সাইজ ${esc(u.lastSize)} (আর জিজ্ঞেস করা হয় না)</div>` : ''}
  <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="ptest" style="width:auto" ${u.tester ? 'checked' : ''}> টেস্ট কাস্টমার (প্র্যাক্টিস মোডেও AI সরাসরি উত্তর দেবে)</label>
  <button class="sm" data-a="saveCust" data-c="${u.id}" style="margin-top:6px">সেভ</button></div>
  <div class="card"><h2>🧾 অর্ডার</h2>${d.orders.map(o => `<div class="row small" style="margin-bottom:4px;cursor:pointer" data-a="gotoOrder" data-q="${o.no}">#${o.no} ${stb(o.status)} ${money(o.total)} <span class="mut">${ago(o.at)}</span></div>`).join('') || '<span class="mut small">নেই</span>'}
  ${can('orders') ? '<button class="sec sm" data-a="manualOrder" style="margin-top:6px">➕ টিম থেকে অর্ডার নিন</button><div id="mo"></div>' : ''}</div>
  ${can('leads') ? `<div class="card"><h2>📞 লিড / ফলো-আপ</h2>${l ? `<div class="small">${esc(l.interest || '')}</div><div class="g2"><div><label>অবস্থা</label><select id="ls">${[['new', 'নতুন'], ['interested', 'আগ্রহী'], ['follow_up', 'ফলো-আপ'], ['won', 'অর্ডার হয়েছে'], ['lost', 'হারিয়েছি']].map(x => `<option value="${x[0]}" ${l.stage === x[0] ? 'selected' : ''}>${x[1]}</option>`).join('')}</select></div><div><label>ফলো-আপের সময়</label><input type="datetime-local" id="lf" value="${dtl(l.followUpAt)}"></div></div><button class="sm" data-a="saveLead" data-l="${l.id}" style="margin-top:6px">সেভ</button>
  ${(l.callNotes || []).map(n => `<div class="note">${esc(n.text)} <b>[${esc(n.result)}]</b><div class="mut">${esc(n.by)} · ${fdt(n.at)}</div></div>`).join('')}
  <div class="row" style="margin-top:6px"><input class="grow" id="ln" placeholder="কলের ফল লিখুন"><select id="lr" style="width:auto"><option value="ordered">অর্ডার দেবে</option><option value="no_answer">ধরেনি</option><option value="thinking">ভাবছে</option><option value="not_interested">চায় না</option></select><button class="sm" data-a="callNote" data-l="${l.id}">যোগ</button></div>` : `<button class="sec sm" data-a="mkLead" data-c="${u.id}">লিড বানান</button>`}</div>` : ''}
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
function finBox(o) {
  const f = o.finance, lbl = { delivered: '✅ ডেলিভারড: আয় ধরা হয়েছে', refunded: '↩ ডেলিভারির পর ফেরত: আয় বাতিল, খরচ ক্ষতি', returned: '↩ না নিয়ে ফেরত: আয় নেই, রিটার্ন খরচ ক্ষতি', cancelled: '✖ বাতিল: হিসাবে ধরা হয় না', pipeline: '⏳ চলমান: ডেলিভারড হলে আয় ধরা হবে' }[f.state];
  const inp = (id, v) => `<input id="${id}" type="number" min="0" value="${v === undefined ? '' : v}" placeholder="0" style="width:90px;display:inline">`;
  return `<h3>💰 হিসাব</h3><div class="note" style="background:#f4f5f8"><div>${lbl}</div>
  ${f.state === 'pipeline' ? `<div class="small">সম্ভাব্য আয়: <b>${money(f.expected)}</b></div>` : `<div class="small">আয়: <b>${money(f.income)}</b> · পণ্যের ক্রয়মূল্য: −${money(f.cogs)} · কুরিয়ার খরচ: −${money(f.courierCost)} · রিটার্ন খরচ: −${money(f.returnCost)}</div><div style="margin-top:4px">নেট: <b style="color:${f.net < 0 ? '#d93a3a' : '#12a150'}">${f.net < 0 ? '−' : ''}${money(Math.abs(f.net))}</b>${f.receivable ? ` · <span style="color:#d98a00">পাওনা (টাকা আসেনি): ${money(f.receivable)}</span>` : ''}</div>`}
  <div class="row small" style="margin-top:6px">কুরিয়ার চার্জ ${inp('occ', o.courierCharge)} রিটার্ন চার্জ ${inp('orc', o.returnCharge)} <button class="sm" data-a="ordCharges" data-o="${o.id}">সেভ</button></div></div>`;
}
function drawOrder(o) {
  const box = $('#odetail'); if (!box || !o) return;
  const nx = NEXT[o.status] || [];
  box.innerHTML = `<div class="card"><h2>অর্ডার #${o.no} ${stb(o.status)}</h2>
  <div class="small">${o.items.map(i => `${esc(i.name)}${i.size ? ' (' + esc(i.size) + ')' : ''} × ${i.qty} = ${money(i.price * i.qty)}`).join('<br>')}</div>
  <div class="small" style="margin-top:6px">সাবটোটাল ${money(o.subtotal)} + ডেলিভারি ${money(o.delivery)} = <b>${money(o.total)}</b> (${o.payment})</div>
  <h3>ডেলিভারি</h3><div class="small">👤 ${esc(o.name)}<br>📞 ${esc(o.phone)}<br>📍 ${esc(o.address)}</div>
  <div class="row" style="margin-top:6px"><button class="sm ${o.paid ? 'ok' : 'sec'}" data-a="ordPaid" data-o="${o.id}" data-v="${o.paid ? '' : '1'}">${o.paid ? '💵 টাকা পেয়েছি ✓ (বাতিল করুন)' : '💵 ক্যাশ হাতে এসেছে'}</button>${o.convId ? `<button class="sec sm" data-a="open" data-c="${o.convId}">💬 চ্যাট</button>` : ''}</div>
  ${o.courier ? `<h3>কুরিয়ার</h3><div class="small">${esc(o.courier.provider)} · ${esc(o.courier.trackingCode)} · ${esc(o.courier.status)} ${o.courier.url ? `<a href="${esc(o.courier.url)}" target="_blank">ট্র্যাকিং পেজ</a>` : ''}</div>` : ['pending', 'processing'].includes(o.status) ? `<button class="sm" style="margin-top:6px" data-a="ordCourier" data-o="${o.id}">🚚 কুরিয়ারে বুক করুন (১ ক্লিক)</button>` : ''}
  ${nx.length ? `<h3>অবস্থা বদলান</h3><div class="row">${nx.map(s => `<button class="sm ${['cancelled', 'returned'].includes(s) ? 'bad' : 'sec'}" data-a="ordStatus" data-o="${o.id}" data-s="${s}">${ST[s]}</button>`).join('')}</div><input id="orr" placeholder="বাতিল/রিটার্নের কারণ (এ দুটোতে বাধ্যতামূলক)" style="margin-top:6px">` : ''}
  ${o.reason ? `<div class="small" style="color:#d93a3a;margin-top:6px">কারণ: ${esc(o.reason)}</div>` : ''}${o.returnReason ? `<div class="small" style="color:#d93a3a">কাস্টমারের বলা রিটার্নের কারণ: ${esc(o.returnReason)}</div>` : ''}${o.rating ? `<div class="small">রিভিউ: ${esc(o.rating)}</div>` : ''}
  ${finBox(o)}
  <h3>নোট</h3>${(o.notes || []).map(n => `<div class="note">${esc(n.text)}<div class="mut">${esc(n.by)}</div></div>`).join('')}<div class="row"><input class="grow" id="onn" placeholder="নোট"><button class="sm" data-a="ordNote" data-o="${o.id}">যোগ</button></div>
  <h3>ইতিহাস</h3>${o.history.map(h => `<div class="small mut">${fdt(h.at)} · ${ST[h.status] || h.status} · ${esc(h.by)}${h.note ? ' · ' + esc(h.note) : ''}</div>`).join('')}</div>`;
}

// ===== লিড =====
const viewLeads = guard(async () => {
  const l = await api('/leads'), now = Date.now();
  $('#main').innerHTML = `<div class="card"><h2>📞 লিড ও ফলো-আপ</h2><p class="mut small">আগ্রহী কিন্তু অর্ডার না করা কাস্টমার এখানে জমা হয়। আজকের ফলো-আপ সবার ওপরে।</p></div>` + (l.map(x => {
    const due = x.followUpAt && x.followUpAt < now + 864e5 && !['won', 'lost'].includes(x.stage);
    return `<div class="card" style="${due ? 'border-color:#d98a00' : ''}"><div class="row"><b class="grow">${esc(x.name || '—')} ${plIcon(x.platform, 15)}</b><span class="chip">${{ new: 'নতুন', interested: 'আগ্রহী', follow_up: 'ফলো-আপ', won: '✅ অর্ডার হয়েছে', lost: '❌ হারিয়েছি' }[x.stage]}</span></div>
    <div class="small">📞 ${esc(x.phone || '—')} · ${esc(x.interest || '')}</div>${x.followUpAt ? `<div class="small" style="color:${due ? '#d98a00' : '#6b7186'}">⏰ ফলো-আপ: ${fdt(x.followUpAt)}</div>` : ''}
    ${(x.callNotes || []).slice(-2).map(n => `<div class="note">${esc(n.text)} [${esc(n.result)}] <span class="mut">${esc(n.by)}</span></div>`).join('')}
    <div class="row" style="margin-top:6px">${can('inbox') ? `<button class="sec sm" data-a="open" data-c="${x.convId}">💬 চ্যাট</button>` : ''}<select data-l="${x.id}" class="lst2" style="width:auto"><option value="">অবস্থা বদলান…</option><option value="interested">আগ্রহী</option><option value="follow_up">ফলো-আপ</option><option value="won">অর্ডার হয়েছে</option><option value="lost">হারিয়েছি</option></select></div></div>`;
  }).join('') || '<p class="mut">কোনো লিড নেই</p>');
  document.querySelectorAll('.lst2').forEach(s => s.onchange = guard(async e => { if (e.target.value) { await api('/leads/' + e.target.dataset.l, { method: 'PATCH', body: { stage: e.target.value } }); viewLeads(); } }));
});

// ===== অফার =====
const viewOffers = guard(async () => {
  const [offers, prods] = await Promise.all([api('/offers'), api('/products')]);
  const AUD = { purchased: 'আগে কিনেছেন এমন কাস্টমার', regular: 'রেগুলার (২+ ডেলিভারড)', all: 'সবাই' };
  $('#main').innerHTML = `<div class="cols"><div class="card"><h2>🎁 নতুন অফার</h2><p class="mut small">অফারটা নিজে নিজে যায় ওই কাস্টমার পরের বার মেসেজ করলে (একজনকে একবারই)। "এখনই পাঠান" চাপলে শুধু যাদের শেষ মেসেজ গত ২৩ ঘণ্টার ভেতরে তাদের কাছে যায়, কারণ Meta অনুমতি ছাড়া ২৪ ঘণ্টা পরে বিজ্ঞাপন-মেসেজ পাঠাতে দেয় না।</p>
  <label>অফারের লেখা</label><textarea id="ot" placeholder="যেমন: আপনি আমাদের পুরোনো কাস্টমার, তাই এই সপ্তাহে যেকোনো পাঞ্জাবিতে ১০% ছাড় 🎉"></textarea>
  <label>কাদের জন্য</label><select id="oa">${Object.entries(AUD).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
  <label>সাথে প্রোডাক্ট কার্ড (ঐচ্ছিক)</label><div class="checks">${prods.filter(p => p.active !== false).map(p => `<label class="chkl"><input type="checkbox" class="ocode" value="${esc(p.code)}"> ${esc(p.code)} · ${esc(p.name)}</label>`).join('') || '<span class="mut small">আগে প্রোডাক্ট যোগ করুন</span>'}</div>
  <label>মেয়াদ (দিন, ০ = সীমাহীন)</label><input id="oe" type="number" min="0" value="7"><button style="margin-top:8px" data-a="offAdd">তৈরি করুন</button></div>
  <div class="card"><h2>অফারের তালিকা</h2>${offers.map(o => `<div class="note" style="background:#f4f5f8"><div>${esc(o.text)}</div><div class="small mut">${AUD[o.audience]} · ${o.sentCount} জনকে গেছে${o.exp ? ' · মেয়াদ ' + fdt(o.exp) : ''} · ${o.active ? '🟢 চালু' : '⚪ বন্ধ'}</div>
  <div class="row" style="margin-top:4px"><button class="sm" data-a="offSend" data-o="${o.id}">📤 এখনই পাঠান</button><button class="sec sm" data-a="offTog" data-o="${o.id}" data-v="${o.active ? '' : '1'}">${o.active ? 'বন্ধ করুন' : 'চালু করুন'}</button><button class="bad sm" data-a="offDel" data-o="${o.id}">মুছুন</button></div></div>`).join('') || '<p class="mut">কোনো অফার নেই</p>'}</div></div>`;
});

// ===== প্রোডাক্ট =====
const viewProducts = guard(async () => {
  const ps = await api('/products'); window._prods = ps;
  $('#main').innerHTML = `<div class="row" style="margin-bottom:10px"><button data-a="pNew">➕ নতুন প্রোডাক্ট</button><span class="mut small">স্টক ৩ বা কম হলে লাল। ছবির প্রথমটা AI ছবি মেলাতে ও কার্ডে ব্যবহার করে। ক্রয়মূল্য দিলে হিসাবে লাভ বের হয়।</span></div><div id="pform"></div>
  <div class="card"><table><tr><th></th><th>কোড</th><th>নাম</th><th>দাম / ক্রয়</th><th>স্টক</th><th></th></tr>${ps.map(p => `<tr><td>${p.images[0] ? `<img class="thumb" src="${esc(p.images[0])}">` : ''}</td><td>${esc(p.code)}</td><td>${esc(p.name)}<div class="small mut">${esc(p.category)}${p.active === false ? ' · 🚫 বন্ধ' : ''}</div></td><td>${money(p.price)}<div class="small mut">${p.cost ? 'ক্রয় ' + money(p.cost) : ''}</div></td><td style="color:${p.totalStock <= 3 ? '#d93a3a' : 'inherit'}"><b>${p.totalStock}</b>${p.variants.length ? `<div class="small mut">${p.variants.map(v => esc(v.label) + ':' + v.stock).join(' ')}</div>` : ''}</td><td><button class="sec sm" data-a="pEdit" data-p="${p.id}">এডিট</button> <button class="bad sm" data-a="pDel" data-p="${p.id}">মুছুন</button></td></tr>`).join('')}</table>${ps.length ? '' : '<p class="mut">প্রথম প্রোডাক্ট যোগ করুন, না হলে AI কিছু দেখাতে পারবে না।</p>'}</div>`;
});
function pForm(p) {
  p = p || { images: [], variants: [], active: true }; window._pimgs = (p.images || []).slice();
  $('#pform').innerHTML = `<div class="card"><h2>${p.id ? 'প্রোডাক্ট এডিট' : 'নতুন প্রোডাক্ট'}</h2><div class="g2"><div><label>কোড (ফাঁকা রাখলে অটো)</label><input id="pc" value="${esc(p.code || '')}"></div><div><label>নাম *</label><input id="pnm" value="${esc(p.name || '')}"></div>
  <div><label>বিক্রির দাম (৳) *</label><input id="ppr" type="number" value="${p.price ?? ''}"></div><div><label>ক্রয়মূল্য (৳, ঐচ্ছিক: লাভের হিসাবের জন্য)</label><input id="pcost" type="number" value="${p.cost || ''}"></div><div><label>ক্যাটাগরি</label><input id="pcat" value="${esc(p.category || '')}"></div></div>
  <label>বিবরণ (AI এটা দেখে উত্তর দেয়: কাপড়, মাপ, ফিচার)</label><textarea id="pds">${esc(p.description || '')}</textarea>
  <div class="g2"><div><label>সাইজ ও স্টক: প্রতি লাইনে একটা <code>M:5</code>। এক লাইনে <code>M, L, XL: 5</code> দিলেও আলাদা সাইজ হয় (প্রতিটায় ৫টা)। সাইজ না থাকলে ফাঁকা রাখুন</label><textarea id="pv">${(p.variants || []).map(v => v.label + ':' + v.stock).join('\n')}</textarea></div><div><label>সাইজ না থাকলে মোট স্টক</label><input id="pst" type="number" value="${p.stock || 0}"><label>কীওয়ার্ড (কমা দিয়ে)</label><input id="pk" value="${esc(p.keywords || '')}"><label>পোস্ট ID (ঐচ্ছিক। না দিলে কমেন্টে পোস্টের লেখা দেখে নিজে চিনবে)</label><input id="ppo" value="${esc((p.postIds || []).join(', '))}"></div></div>
  <label>ছবি (অটো ছোট করা হয়)</label><div id="pim" class="row"></div><div class="row" style="margin-top:6px"><input type="file" id="pfile" accept="image/*" multiple style="width:auto"><input id="purl" class="grow" placeholder="অথবা ছবির লিংক"><button class="sec sm" data-a="pAddUrl">লিংক যোগ</button></div>
  <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="pact" style="width:auto" ${p.active !== false ? 'checked' : ''}> সক্রিয় (AI দেখাবে)</label><div class="row" style="margin-top:8px"><button data-a="pSave" data-p="${p.id || ''}">সেভ</button><button class="sec" data-a="pCancel">বাতিল</button></div></div>`;
  drawImgs(); $('#pfile').onchange = guard(async e => { for (const f of e.target.files) window._pimgs.push((await uploadFile(f)).url); drawImgs(); });
}
function drawImgs() { $('#pim').innerHTML = window._pimgs.map((u, i) => `<div style="position:relative"><img class="thumb" src="${esc(u)}"><span data-a="pImgDel" data-i="${i}" style="position:absolute;top:-6px;right:-6px;background:#d93a3a;color:#fff;border-radius:50%;width:18px;height:18px;text-align:center;cursor:pointer;font-size:12px">×</span></div>`).join('') || '<span class="mut small">ছবি নেই</span>'; }

// ===== রিপোর্ট ও হিসাব =====
const viewReports = guard(async () => {
  const a = await api('/analytics'), t = a.days[0], y = a.days[1], T = a.totals;
  const card = (l, v, o, c) => `<div class="stat"><span class="mut small">${l}</span><b ${c ? `style="color:${c}"` : ''}>${v}</b>${o !== undefined ? `<span class="small mut">গতকাল ${o}</span>` : ''}</div>`;
  const sn = n => (n < 0 ? '−' : '') + money(Math.abs(n));
  $('#main').innerHTML = `<div class="g3">${card('আজকের কথোপকথন', t.chats, y.chats)}${card('AI-র উত্তর', t.aiReplies, y.aiReplies)}${card('টিমের উত্তর', t.teamReplies, y.teamReplies)}${card('মানুষ ডাকা হয়েছে', t.handovers, y.handovers)}${card('নতুন অর্ডার', t.orders, y.orders)}${card('AI / টিমের নেওয়া', t.aiOrders + ' / ' + t.teamOrders, y.aiOrders + ' / ' + y.teamOrders)}</div>
  <div class="card" style="margin-top:12px"><h2>💰 টাকার হিসাব</h2><p class="mut small">নিয়ম: <b>আয় ধরা হয় শুধু ডেলিভারড হলে</b>। না নিয়ে ফেরত এলে আয় নেই, উল্টে রিটার্ন খরচ ক্ষতি। ডেলিভারির পর ফেরত এলে আয় বাতিল হয় আর কুরিয়ার + রিটার্ন খরচ ক্ষতি। বাতিল অর্ডার হিসাবে নেই। কুরিয়ার/রিটার্ন চার্জ অর্ডারে বা ⚙ সেটিংসে (ডিফল্ট) দিন।</p>
  <div class="g3">${card('আজকের বিক্রি (ডেলিভারড)', money(t.revenue), money(y.revenue))}${card('আজকের নেট আয়', sn(t.net), sn(y.net), t.net < 0 ? '#d93a3a' : '#12a150')}${card('রিটার্ন খরচ (আজ)', money(t.returnCost), money(y.returnCost), t.returnCost ? '#d93a3a' : '')}${card('চলমান অর্ডারের মোট (ডেলিভারির অপেক্ষায়)', money(T.pipeline), a.totals.pipelineCount + ' টা')}${card('পাওনা (ডেলিভারড, টাকা আসেনি)', money(T.receivable), undefined, '#d98a00')}${card('ক্যাশ হাতে এসেছে', money(T.cashIn), undefined, '#12a150')}</div></div>
  <div class="card"><h2>গত ৭ দিন</h2><div style="overflow-x:auto"><table><tr><th>দিন</th><th>চ্যাট</th><th>AI</th><th>টিম</th><th>হ্যান্ডওভার</th><th>নতুন অর্ডার</th><th>ডেলিভারড</th><th>রিটার্ন</th><th>বিক্রি</th><th>ফেরত</th><th>খরচ</th><th>নেট</th></tr>${a.days.map(d => `<tr><td>${d.day}</td><td>${d.chats}</td><td>${d.aiReplies}</td><td>${d.teamReplies}</td><td>${d.handovers}</td><td>${d.orders}</td><td>${d.delivered}</td><td>${d.returned}</td><td>${money(d.sales)}</td><td>${d.refunds ? '−' + money(d.refunds) : '—'}</td><td class="small">কুরিয়ার ${money(d.courierCost)}<br>রিটার্ন ${money(d.returnCost)}<br>ক্রয় ${money(d.cogs)}</td><td><b style="color:${d.net < 0 ? '#d93a3a' : '#12a150'}">${sn(d.net)}</b></td></tr>`).join('')}</table></div></div>
  <div class="cols"><div class="card"><h2>কেন অর্ডার হারাচ্ছি (বাতিল/রিটার্নের কারণ)</h2>${Object.entries(a.reasons).map(([k, v]) => `<div class="row"><span class="grow">${esc(k)}</span><b>${v}</b></div>`).join('') || '<span class="mut">এখনো কিছু নেই</span>'}<div class="small mut" style="margin-top:8px">খোলা লিড: ${a.openLeads} · হারানো লিড: ${a.lostLeads}</div></div>
  <div class="card"><h2>⚠ স্টক কম</h2>${a.lowStock.map(p => `<div class="row"><span class="grow">${esc(p.code)} · ${esc(p.name)}</span><b style="color:#d93a3a">${p.stock}</b></div>`).join('') || '<span class="mut">সব ঠিক আছে</span>'}</div></div>
  <div class="card"><h2>💬 সাম্প্রতিক কমেন্ট (পোস্ট থেকে ইনবক্সে)</h2>${a.comments.map(c => `<div class="note" style="background:#f4f5f8">${plIcon(c.platform, 14)} <b>${esc(c.name)}</b>: ${esc(c.text)}<div class="small mut">উদ্দেশ্য: ${esc(c.intent || '—')}${c.products && c.products.length ? ' · প্রোডাক্ট: ' + esc(c.products.join(',')) + (c.mappedBy ? ' (' + esc(c.mappedBy) + ')' : '') : ''} · <b>${esc(c.status)}</b>${c.replyError ? '<br>⚠ কমেন্ট রিপ্লাই: ' + esc(c.replyError) : ''}${c.dmError ? '<br>⚠ ইনবক্স: ' + esc(c.dmError) : ''}</div></div>`).join('') || '<span class="mut">কোনো কমেন্ট আসেনি (⚙ সেটিংসে কমেন্ট রিপ্লাই চালু ও Meta-তে feed সাবস্ক্রাইব করুন)</span>'}</div>`;
});

// ===== এজেন্ট ডেস্ক =====
const viewDesk = guard(async () => {
  SET = { ...SET, ...(await api('/settings')) };
  $('#main').innerHTML = `<div class="cols"><div class="card"><h2>🎓 AI-কে শেখান</h2><p class="mut small">নিজের ভাষায় নিয়ম লিখুন (কেমন সুরে কথা বলবে, কী করবে না, ছাড়ের নীতি)। <b>ড্রাফট</b> বদলে টেস্ট করুন; পছন্দ হলে এক ক্লিকে <b>লাইভ</b>। পছন্দ না হলে আগের অবস্থায় ফেরা যায়।</p>
  <label>ড্রাফট নিয়ম</label><textarea id="rd" style="min-height:220px">${esc(SET.rulesDraft)}</textarea>
  <div class="row" style="margin-top:8px"><button class="sec" data-a="deskSave">💾 ড্রাফট সেভ</button><button class="ok" data-a="deskLive">🚀 লাইভ করুন</button><button class="bad" data-a="deskRevert">↩ আগের ভার্সনে ফিরুন</button></div>
  <h3>এখন লাইভ যা চলছে</h3><div class="note" style="white-space:pre-wrap;background:#f4f5f8">${esc(SET.rulesLive)}</div></div>
  <div class="card"><h2>🧪 টেস্ট করুন (কাস্টমারকে কিছু যায় না)</h2>${SET.hasAI ? '' : '<div class="note">Gemini key নেই, তাই এটা ডেমো ব্রেইন। আসল উত্তর দেখতে .env-এ GEMINI_API_KEY দিন।</div>'}
  <div class="row"><input id="tm" class="grow" placeholder="কাস্টমার কী লিখবে? যেমন: ভাইয়া পাঞ্জাবির দাম কত?"><button data-a="deskTest">টেস্ট</button></div><div id="tr" style="margin-top:10px"></div></div></div>`;
});

// ===== টিম =====
const permBoxes = (pre, perms) => Object.entries(PERM_LABEL).map(([k, v]) => `<label class="chkl"><input type="checkbox" class="${pre}perm" value="${k}" ${perms.includes(k) ? 'checked' : ''}> ${v}</label>`).join('');
const presetSel = (id, cur) => `<select id="${id}">${Object.entries(PRESET_LABEL).map(([k, v]) => `<option value="${k}" ${cur === k ? 'selected' : ''}>${v}</option>`).join('')}</select>`;
const bindPreset = (selId, pre) => { const s = $('#' + selId); if (s) s.onchange = () => { const list = PRESETS[s.value]; if (list) document.querySelectorAll('.' + pre + 'perm').forEach(c => { c.checked = list.includes(c.value); }); }; };
const viewTeam = guard(async () => {
  USERS = await api('/users');
  $('#main').innerHTML = `<div class="cols"><div><div class="card"><h2>👥 টিম</h2><p class="mut small">নামে ক্লিক করলে সে কার সাথে কথা বলছে, কত মেসেজ, কী অর্ডার নিয়েছে সব দেখা যায়।</p>
  ${USERS.map(u => `<div class="trow ${F.tUser === u.id ? 'on' : ''}" data-a="tAct" data-u="${u.id}"><div class="av ini" style="width:34px;height:34px;font-size:14px">${esc(u.name[0])}</div><div class="grow"><b>${esc(u.name)}</b> <span class="chip">${u.role === 'owner' ? 'মালিক' : PRESET_LABEL[u.preset] || u.preset}</span><div class="small mut">${esc(u.email)}${u.restrictChats ? ' · শুধু অ্যাসাইন করা চ্যাট' : ''}</div></div>${u.role !== 'owner' && u.id !== ME.id ? `<button class="bad sm" data-a="uDel" data-u="${u.id}">সরান</button>` : ''}</div>`).join('')}</div>
  <div class="card"><h2>➕ টিমমেট যোগ করুন</h2><label>নাম</label><input id="un"><label>ইমেইল</label><input id="ue" type="email"><label>পাসওয়ার্ড (৬+)</label><input id="up" type="text">
  <label>কাজের ধরন (অ্যাক্সেস)</label>${presetSel('utp', 'basic')}<div class="checks" style="margin-top:6px">${permBoxes('n', PRESETS.basic)}</div>
  <label class="chkl"><input type="checkbox" id="urc"> শুধু নিজের অ্যাসাইন করা চ্যাট দেখবে</label><button style="margin-top:8px" data-a="uAdd">যোগ করুন</button></div></div>
  <div id="tdetail" class="card mut">বাঁ দিকে কারও নামে ক্লিক করুন</div></div>`;
  bindPreset('utp', 'n'); if (F.tUser) loadActivity(F.tUser);
});
const loadActivity = guard(async id => {
  F.tUser = id; const a = await api(`/users/${id}/activity`), u = a.user, s = a.stats, box = $('#tdetail'); if (!box) return;
  document.querySelectorAll('.trow').forEach(r => r.classList.toggle('on', r.dataset.u === id));
  const mx = Math.max(1, ...a.daily.map(d => d.messages));
  box.className = 'card';
  box.innerHTML = `<h2>${esc(u.name)} <span class="chip">${u.role === 'owner' ? 'মালিক' : PRESET_LABEL[u.preset] || u.preset}</span></h2>
  <div class="g3"><div class="stat"><span class="mut small">এখন অ্যাসাইন করা চ্যাট</span><b>${s.assigned}</b></div><div class="stat"><span class="mut small">যত চ্যাটে উত্তর দিয়েছে</span><b>${s.chats}</b></div><div class="stat"><span class="mut small">মোট মেসেজ পাঠিয়েছে</span><b>${s.messages}</b></div><div class="stat"><span class="mut small">অর্ডার নিয়েছে</span><b>${s.orders}</b><span class="small mut">${money(s.ordersValue)}</span></div></div>
  <h3>গত ৭ দিনের মেসেজ</h3><div class="bars">${a.daily.map(d => `<div class="bar" title="${d.day}: ${d.messages}"><i style="height:${Math.round(d.messages / mx * 46) + 2}px"></i><span>${d.day.slice(8)}</span><b>${d.messages}</b></div>`).join('')}</div>
  <h3>কোন কাস্টমারের সাথে কাজ করছে</h3>${a.chats.map(c => `<div class="trow" data-a="open" data-c="${c.convId}">${avatar(c, 34)}<div class="grow"><b>${esc(c.name)}</b> ${c.assigned ? '<span class="chip">📌 অ্যাসাইন</span>' : ''} ${c.mode === 'human' ? '<span class="chip">🙋</span>' : ''}<div class="small mut">${c.count ? c.count + 'টা মেসেজ পাঠিয়েছে · ' : ''}${esc(c.lastText)}</div></div><div class="small mut">${ago(Math.max(c.lastReply, c.lastAt))}</div></div>`).join('') || '<p class="mut small">এখনো কোনো চ্যাট নেই</p>'}
  <h3>সাম্প্রতিক পাঠানো মেসেজ</h3>${a.recent.map(m => `<div class="note"><b>${esc(m.name)}</b>: ${m.type === 'image' ? '📷 ছবি' : m.type === 'file' ? '📎 ফাইল' : m.type === 'cards' ? '🛍 প্রোডাক্ট কার্ড' : esc(m.text)}<div class="mut small">${fdt(m.at)}</div></div>`).join('') || '<p class="mut small">নেই</p>'}
  <h3>নেওয়া অর্ডার</h3>${a.orders.map(o => `<div class="row small">#${o.no} ${esc(o.name)} ${stb(o.status)} ${money(o.total)}</div>`).join('') || '<p class="mut small">নেই</p>'}
  ${u.role !== 'owner' ? `<h3>অ্যাক্সেস বদলান</h3>${presetSel('etp', u.preset)}<div class="checks" style="margin-top:6px">${permBoxes('e', u.perms)}</div><label class="chkl"><input type="checkbox" id="erc" ${u.restrictChats ? 'checked' : ''}> শুধু নিজের অ্যাসাইন করা চ্যাট দেখবে</label><label>নতুন পাসওয়ার্ড (বদলাতে চাইলে)</label><input id="epw" type="text" placeholder="ফাঁকা = না বদলানো"><button style="margin-top:8px" data-a="tSave" data-u="${u.id}">সেভ</button>` : ''}`;
  bindPreset('etp', 'e');
});

// ===== সেটিংস =====
const viewSettings = guard(async () => {
  const s = await api('/settings');
  const ck = (id, v, l) => `<label style="display:flex;gap:6px;align-items:flex-start;color:var(--tx)"><input type="checkbox" id="${id}" style="width:auto;margin-top:3px" ${v ? 'checked' : ''}> <span>${l}</span></label>`;
  const num = (id, v, l) => `<div><label>${l}</label><input id="${id}" type="number" min="0" value="${v}"></div>`;
  $('#main').innerHTML = `<div class="cols"><div class="card"><h2>⚙ সেটিংস</h2>
  <label>ব্যবসার নাম (AI কাস্টমারকে এই নামে পরিচয় দেয়। "My Shop" থাকলে বদলে দিন!)</label><input id="sb" value="${esc(s.businessName)}">
  <div class="g2">${num('si', s.deliveryInside, 'ডেলিভারি চার্জ: ঢাকার ভেতরে (৳)')}${num('so', s.deliveryOutside, 'ঢাকার বাইরে (৳)')}</div>
  <label>ডেলিভারি সময় (গ্রাহককে যা বলা হবে)</label><input id="sd" value="${esc(s.deliveryDays)}"><label>রিভিউ লিংক (ভালো রেটিং দিলে পাঠানো হবে)</label><input id="sr" value="${esc(s.reviewLink)}">
  <label>মানুষ চ্যাট নিলে কতক্ষণ পর নিজে AI-তে ফিরবে (মিনিট, ০ = ফিরবে না)</label><input id="sh" type="number" value="${s.handoverMinutes}">
  <h3>হিসাবের ডিফল্ট (প্রতি অর্ডারে বদলানো যায়)</h3><div class="g3">${num('scin', s.courierChargeInside, 'কুরিয়ারকে দিতে হয়: ঢাকার ভেতরে')}${num('scout', s.courierChargeOutside, 'কুরিয়ারকে দিতে হয়: বাইরে')}${num('srt', s.returnCharge, 'প্রতি রিটার্নে খরচ')}</div>
  <h3>চালু/বন্ধ</h3>${ck('sl', s.aiLive, '🔴 <b>AI লাইভ</b>: সব কাস্টমারকে সরাসরি উত্তর দেবে। বন্ধ থাকলে (প্র্যাক্টিস মোড) শুধু ড্রাফট বানায়।')}
  ${ck('sf', s.followupEnabled, '⏰ ফলো-আপ ইঞ্জিন: দাম দেখে চুপ হয়ে যাওয়া কাস্টমারকে একবার ভদ্রভাবে মনে করানো (২৩ ঘণ্টার ভেতরে)')}<label>কত ঘণ্টা চুপ থাকলে মনে করাবে</label><input id="sfh" type="number" value="${s.followupHours}">
  ${ck('sc', s.commentReplyEnabled, '💬 পোস্টের কমেন্টে উত্তর + ইনবক্সে প্রোডাক্ট কার্ড')}<label>কোন কমেন্টে উত্তর দেবে</label><select id="scm"><option value="intent" ${s.commentMode !== 'all' ? 'selected' : ''}>শুধু দাম/অর্ডার/আগ্রহ জানতে চাইলে (প্রস্তাবিত)</option><option value="all" ${s.commentMode === 'all' ? 'selected' : ''}>সব কমেন্টে</option></select>
  <button style="margin-top:10px" data-a="saveSettings">সেভ</button></div>
  <div><div class="card"><h2>🩺 Meta সংযোগ পরীক্ষা</h2><p class="mut small">বাটন কাজ না করা বা কমেন্ট না আসার সবচেয়ে বড় কারণ Meta-তে ফিল্ড সাবস্ক্রাইব না থাকা। এখান থেকে দেখে এক ক্লিকে ঠিক করুন।</p><div class="row"><button data-a="metaCheck">🔍 পরীক্ষা করুন</button><button class="ok" data-a="metaFix">🔧 ঠিক করুন (সাবস্ক্রাইব)</button></div><div id="metaOut" style="margin-top:8px"></div></div>
  ${ME.role === 'owner' ? `<div class="card"><h2>💾 ডেটা ব্যাকআপ</h2><p class="mut small"><b>জরুরি:</b> Render-এর ফ্রি প্ল্যানে প্রতিটা ডিপ্লয়/রিস্টার্টে সব ডেটা (অর্ডার, চ্যাট, প্রোডাক্ট ও ছবি) মুছে যেতে পারে। ডিপ্লয়ের আগে ব্যাকআপ নিন, পরে রিস্টোর করুন। স্থায়ী সমাধান: ডিস্কসহ হোস্টিং।</p><div class="row"><button data-a="backup">⬇ ব্যাকআপ ডাউনলোড</button></div><label>রিস্টোর (ব্যাকআপ ফাইল বেছে নিন) ⚠ বর্তমান ডেটা বদলে যাবে</label><input type="file" id="rfile" accept=".json"><button class="bad" style="margin-top:6px" data-a="restore">⬆ রিস্টোর করুন</button></div>` : ''}</div></div>`;
});

// ===== অ্যাকশন =====
const refreshSide = () => api('/conversations/' + F.cur).then(drawSide);
const checkedPerms = pre => [...document.querySelectorAll('.' + pre + 'perm:checked')].map(c => c.value);
const permPayload = perms => { const k = Object.keys(PRESETS).find(p => PRESETS[p].length === perms.length && PRESETS[p].every(x => perms.includes(x))); return k ? { preset: k } : { perms }; };
const MISS = { messaging_postbacks: 'কার্ডের বাটন (বিস্তারিত/অর্ডার করুন) কাজ করবে না', feed: 'পোস্টের কমেন্ট আসবে না', messages: 'মেসেজই আসবে না' };
const renderMeta = r => r.error ? `<div class="note" style="background:#fde8e8">⚠ ${esc(r.error)}</div>` :
  `<div class="small">এখন সাবস্ক্রাইব করা: ${r.page.fields.map(f => `<span class="chip">${esc(f)}</span>`).join(' ') || '—'}</div>` +
  (r.page.missing.length ? `<div class="note" style="background:#fff3d6">❌ নেই: <b>${r.page.missing.map(esc).join(', ')}</b><br>${r.page.missing.map(m => '• ' + esc(m) + ': ' + (MISS[m] || '')).join('<br>')}<br><span class="small">"ঠিক করুন" চাপুন। না হলে Meta Developer → Webhooks-এ Page-এর জন্য ফিল্ডগুলো টিক দিন।</span></div>` : `<div class="note" style="background:#e1f7ea">✅ দরকারি সব ফিল্ড সাবস্ক্রাইব করা আছে</div>`) +
  (r.publicOk ? '' : `<div class="note" style="background:#fff3d6">⚠ PUBLIC_URL (https) .env-এ নেই, ছবি/ফাইল Meta-তে যাবে না</div>`);
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
  attach: () => $('#fileIn').click(),
  prodPanel: guard(async () => {
    const p = $('#prodpanel'); if (!p.hidden) { p.hidden = true; return; }
    const ps = (await api('/products')).filter(x => x.active !== false);
    p.innerHTML = `<div class="pp"><b>কাস্টমারকে পাঠানোর প্রোডাক্ট বাছুন (ছবি, দাম ও বাটনসহ কার্ড যাবে):</b><div class="checks">${ps.map(x => `<label class="chkl"><input type="checkbox" class="spc" value="${esc(x.code)}"> ${esc(x.code)} · ${esc(x.name)} (${money(x.price)})</label>`).join('') || '<span class="mut">প্রোডাক্ট নেই</span>'}</div><button class="sm" data-a="prodSend">🛍 পাঠান</button></div>`; p.hidden = false;
  }),
  prodSend: guard(async () => { const codes = [...document.querySelectorAll('.spc:checked')].map(c => c.value); if (!codes.length) return toast('প্রোডাক্ট বাছুন'); await api(`/conversations/${F.cur}/send-products`, { body: { codes } }); $('#prodpanel').hidden = true; loadConv(); }),
  drSend: guard(async (_, el) => { await api(`/conversations/${F.cur}/drafts/${el.dataset.m}/send`, { body: { text: $('#dr-' + el.dataset.m).value } }); loadConv(); }),
  drDel: guard(async (_, el) => { await api(`/conversations/${F.cur}/drafts/${el.dataset.m}/discard`, { body: {} }); loadConv(); }),
  saveCust: guard(async (_, el) => { await api('/customers/' + el.dataset.c, { method: 'PATCH', body: { name: $('#pn').value, phone: $('#pp').value, address: $('#pa').value, honorific: $('#ph').value, tags: $('#pt').value, tester: $('#ptest').checked } }); toast('সেভ হয়েছে'); loadConv(); loadList(); }),
  refreshProfile: guard(async (_, el) => { const r = await api(`/customers/${el.dataset.c}/refresh-profile`, { body: {} }); if (r.error) toast('Meta বলছে: ' + r.error); else toast('✅ নাম ও ছবি এসেছে: ' + r.name); loadConv(); loadList(); }),
  addNote: guard(async (_, el) => { if (!$('#nt').value.trim()) return; await api(`/customers/${el.dataset.c}/notes`, { body: { text: $('#nt').value } }); refreshSide(); }),
  mkLead: guard(async (_, el) => { await api('/leads', { body: { customerId: el.dataset.c, interest: 'ম্যানুয়াল লিড' } }); refreshSide(); }),
  saveLead: guard(async (_, el) => { await api('/leads/' + el.dataset.l, { method: 'PATCH', body: { stage: $('#ls').value, followUpAt: $('#lf').value ? new Date($('#lf').value).getTime() : null } }); toast('সেভ হয়েছে'); refreshSide(); }),
  callNote: guard(async (_, el) => { if (!$('#ln').value.trim()) return; await api(`/leads/${el.dataset.l}/call`, { body: { text: $('#ln').value, result: $('#lr').value } }); refreshSide(); }),
  gotoOrder: (_, el) => { F.orderQ = el.dataset.q; F.orderSt = ''; go('orders'); },
  assist: guard(async (_, el) => { const o = $('#ao'); o.style.display = 'block'; o.textContent = '⏳ ভাবছি…'; const r = await api('/ai/assist', { body: { convId: F.cur, mode: el.dataset.m, question: $('#aq').value } }); o.textContent = r.text; $('#ause').style.display = el.dataset.m === 'draft' ? 'inline-block' : 'none'; }),
  useDraft: () => { $('#cmp').value = $('#ao').textContent; $('#cmp').focus(); },
  manualOrder: guard(async () => {
    const ps = await api('/products'), d = await api('/conversations/' + F.cur), u = d.customer;
    $('#mo').innerHTML = `<div class="note" style="background:#f4f5f8"><label>প্রোডাক্ট</label><select id="mp">${ps.filter(p => p.totalStock > 0).map(p => `<option value="${p.code}">${esc(p.code)} · ${esc(p.name)} (${p.totalStock})</option>`).join('')}</select><div class="g2"><div><label>সাইজ</label><input id="ms" placeholder="যেমন M" value="${esc(u.lastSize || '')}"></div><div><label>পরিমাণ</label><input id="mq" type="number" value="1"></div></div><label>নাম</label><input id="mn" value="${esc(u.name)}"><label>ফোন</label><input id="mph" value="${esc(u.phone)}"><label>ঠিকানা</label><textarea id="ma">${esc(u.address)}</textarea><button class="sm" data-a="moSave" style="margin-top:6px">অর্ডার তৈরি + চ্যাটে বিল পাঠান</button></div>`;
  }),
  moSave: guard(async () => { await api('/orders/manual', { body: { convId: F.cur, code: $('#mp').value, size: $('#ms').value, qty: $('#mq').value, name: $('#mn').value, phone: $('#mph').value, address: $('#ma').value } }); toast('অর্ডার হয়েছে ✅'); loadConv(); }),
  // অর্ডার
  ordRefresh: () => loadOrders(), ordSt: (_, el) => { F.orderSt = el.dataset.v; loadOrders(); }, ordOpen: (_, el) => { F.ordOpen = el.dataset.o; drawOrder((window._orders || []).find(o => o.id === F.ordOpen)); },
  ordStatus: guard(async (_, el) => { await api(`/orders/${el.dataset.o}/status`, { method: 'PATCH', body: { status: el.dataset.s, reason: $('#orr') ? $('#orr').value : '' } }); loadOrders(); }),
  ordPaid: guard(async (_, el) => { await api(`/orders/${el.dataset.o}/paid`, { body: { paid: !!el.dataset.v } }); loadOrders(); }),
  ordNote: guard(async (_, el) => { if (!$('#onn').value.trim()) return; await api(`/orders/${el.dataset.o}/note`, { body: { text: $('#onn').value } }); loadOrders(); }),
  ordCharges: guard(async (_, el) => { await api(`/orders/${el.dataset.o}/charges`, { body: { courierCharge: $('#occ').value, returnCharge: $('#orc').value } }); loadOrders(); }),
  ordCourier: guard(async (_, el) => { if (!confirm('কুরিয়ারে বুক করব? কাস্টমারকে ট্র্যাকিং চলে যাবে।')) return; await api(`/orders/${el.dataset.o}/courier`, { body: {} }); loadOrders(); }),
  // অফার
  offAdd: guard(async () => { await api('/offers', { body: { text: $('#ot').value, audience: $('#oa').value, codes: [...document.querySelectorAll('.ocode:checked')].map(c => c.value), expDays: $('#oe').value } }); viewOffers(); }),
  offSend: guard(async (_, el) => { if (!confirm('যাদের শেষ মেসেজ গত ২৩ ঘণ্টার ভেতরে শুধু তাদের কাছে এখনই যাবে। পাঠাব?')) return; const r = await api(`/offers/${el.dataset.o}/send`, { body: {} }); toast(`✅ ${r.sent} জনকে গেছে।\n${r.outside} জন ২৩ ঘণ্টার বাইরে (তারা মেসেজ করলে অফার নিজে যাবে)।\n${r.done} জন আগেই পেয়েছেন।`); viewOffers(); }),
  offTog: guard(async (_, el) => { await api('/offers/' + el.dataset.o, { method: 'PATCH', body: { active: !!el.dataset.v } }); viewOffers(); }),
  offDel: guard(async (_, el) => { if (confirm('মুছবেন?')) { await api('/offers/' + el.dataset.o, { method: 'DELETE' }); viewOffers(); } }),
  // প্রোডাক্ট
  pNew: () => pForm(), pCancel: () => { $('#pform').innerHTML = ''; }, pEdit: (_, el) => { pForm(window._prods.find(p => p.id === el.dataset.p)); scrollTo(0, 0); },
  pDel: guard(async (_, el) => { if (confirm('মুছে ফেলবেন?')) { await api('/products/' + el.dataset.p, { method: 'DELETE' }); viewProducts(); } }),
  pAddUrl: () => { const v = $('#purl').value.trim(); if (v) { window._pimgs.push(v); $('#purl').value = ''; drawImgs(); } },
  pImgDel: (_, el) => { window._pimgs.splice(+el.dataset.i, 1); drawImgs(); },
  pSave: guard(async (_, el) => {
    const variants = $('#pv').value.split('\n').map(l => l.trim()).filter(Boolean).map(l => { const i = l.lastIndexOf(':'); return i < 0 ? { label: l, stock: 0 } : { label: l.slice(0, i).trim(), stock: +l.slice(i + 1) || 0 }; });
    const body = { code: $('#pc').value, name: $('#pnm').value, price: $('#ppr').value, cost: $('#pcost').value, category: $('#pcat').value, description: $('#pds').value, variants, stock: $('#pst').value, keywords: $('#pk').value, postIds: $('#ppo').value, images: window._pimgs, active: $('#pact').checked };
    await api(el.dataset.p ? '/products/' + el.dataset.p : '/products', { method: el.dataset.p ? 'PUT' : 'POST', body }); viewProducts();
  }),
  // ডেস্ক
  deskSave: guard(async () => { await api('/settings', { method: 'PUT', body: { rulesDraft: $('#rd').value } }); toast('ড্রাফট সেভ হয়েছে'); }),
  deskLive: guard(async () => { await api('/settings', { method: 'PUT', body: { rulesDraft: $('#rd').value } }); if (!confirm('এই নিয়ম এখন থেকে সব কাস্টমারের সাথে চলবে। লাইভ করব?')) return; await api('/desk/live', { body: {} }); toast('🚀 লাইভ হয়েছে'); viewDesk(); }),
  deskRevert: guard(async () => { if (!confirm('আগের ভার্সনে ফিরব?')) return; await api('/desk/revert', { body: {} }); viewDesk(); }),
  deskTest: guard(async () => { const m = $('#tm').value.trim(); if (!m) return; $('#tr').textContent = '⏳'; const r = (await api('/desk/test', { body: { message: m, rules: $('#rd').value } })).plan; $('#tr').innerHTML = `<div class="note" style="background:#f3f0ff;white-space:pre-wrap"><b>AI-র উত্তর:</b>\n${esc(r.reply || '(কোনো টেক্সট নেই)')}</div><div class="small mut" style="margin-top:6px">অ্যাকশন: <b>${esc(r.action)}</b>${r.product_codes.length ? ' · প্রোডাক্ট: ' + esc(r.product_codes.join(', ')) : ''}${r.handover_reason ? ' · হ্যান্ডওভার কারণ: ' + esc(r.handover_reason) : ''}${r.intent ? ' · উদ্দেশ্য: ' + esc(r.intent) : ''}</div>`; }),
  // টিম
  tAct: (d) => loadActivity(d.u),
  uAdd: guard(async () => { await api('/users', { body: { name: $('#un').value, email: $('#ue').value, password: $('#up').value, restrictChats: $('#urc').checked, ...permPayload(checkedPerms('n')) } }); viewTeam(); }),
  uDel: guard(async (_, el) => { if (confirm('সরাবেন?')) { await api('/users/' + el.dataset.u, { method: 'DELETE' }); F.tUser = null; viewTeam(); } }),
  tSave: guard(async (_, el) => { const b = { restrictChats: $('#erc').checked, ...permPayload(checkedPerms('e')) }; if ($('#epw').value) b.password = $('#epw').value; await api('/users/' + el.dataset.u, { method: 'PATCH', body: b }); toast('সেভ হয়েছে'); viewTeam(); }),
  // সেটিংস
  saveSettings: guard(async () => { SET = { ...SET, ...(await api('/settings', { method: 'PUT', body: { businessName: $('#sb').value, deliveryInside: $('#si').value, deliveryOutside: $('#so').value, deliveryDays: $('#sd').value, reviewLink: $('#sr').value, handoverMinutes: $('#sh').value, courierChargeInside: $('#scin').value, courierChargeOutside: $('#scout').value, returnCharge: $('#srt').value, aiLive: $('#sl').checked, followupEnabled: $('#sf').checked, followupHours: $('#sfh').value, commentReplyEnabled: $('#sc').checked, commentMode: $('#scm').value } })) }; drawTop(); toast('সেভ হয়েছে ✅'); }),
  metaCheck: guard(async () => { $('#metaOut').textContent = '⏳'; $('#metaOut').innerHTML = renderMeta(await api('/meta/check')); }),
  metaFix: guard(async () => { $('#metaOut').textContent = '⏳'; const r = await api('/meta/subscribe', { body: {} }); $('#metaOut').innerHTML = r.ok ? renderMeta({ page: r.page || { fields: [], missing: [] }, publicOk: true }) : `<div class="note" style="background:#fde8e8">⚠ Meta বলছে: ${esc(r.error)}<br><span class="small">App-এ pages_messaging ও pages_manage_metadata (বা feed) অনুমতি লাগতে পারে। Meta Developer → Webhooks থেকে হাতে টিক দিন।</span></div>`; }),
  backup: () => { location = '/api/backup'; },
  restore: guard(async () => { const f = $('#rfile').files[0]; if (!f) return toast('ব্যাকআপ ফাইল বাছুন'); if (!confirm('বর্তমান সব ডেটা এই ব্যাকআপ দিয়ে বদলে যাবে। নিশ্চিত?')) return; const j = JSON.parse(await f.text()); const r = await api('/restore', { body: j }); toast('✅ রিস্টোর হয়েছে (' + r.files + 'টা ফাইল)। আবার লগইন করুন।'); location = '/login.html'; }),
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]'); if (!el) { if (!e.target.closest('.bubble') && !e.target.closest('.bell')) $('#bubble').innerHTML = ''; return; }
  const f = act[el.dataset.a]; if (f) f(el.dataset, el);
});
boot().catch(e => { if (e.message !== 'login') $('#main').textContent = 'ত্রুটি: ' + e.message; });
