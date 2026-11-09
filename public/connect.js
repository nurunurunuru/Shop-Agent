// ===== 🔗 কানেক্ট: Facebook পেজ / Instagram / WhatsApp / কুরিয়ার — নিজে নিজে, বাটন চেপে =====
let CFG = null, WA_SESSION = null;

function loadFB(cfg) {
  return new Promise((resolve, reject) => {
    if (window.FB) return resolve();
    window.fbAsyncInit = () => { FB.init({ appId: cfg.appId, cookie: true, xfbml: false, version: cfg.graphVersion }); resolve(); };
    const s = document.createElement('script'); s.async = true; s.src = 'https://connect.facebook.net/en_US/sdk.js';
    s.onerror = () => reject(new Error('Facebook SDK লোড হয়নি (ইন্টারনেট বা অ্যাড-ব্লকার দেখুন)'));
    document.head.appendChild(s);
  });
}
// Meta-র WhatsApp সেটআপ শেষে এই ইভেন্টে নম্বর ও অ্যাকাউন্টের আইডি দেয়
window.addEventListener('message', ev => {
  let host = ''; try { host = new URL(ev.origin).hostname; } catch { return; }
  if (host !== 'facebook.com' && !host.endsWith('.facebook.com')) return;
  try { const d = JSON.parse(ev.data); if (d && d.type === 'WA_EMBEDDED_SIGNUP') WA_SESSION = { event: d.event, ...(d.data || {}) }; } catch {}
});

const when = t => t ? new Date(t).toLocaleDateString('bn-BD', { day: 'numeric', month: 'short' }) : '';
const warnHttps = () => (location.protocol !== 'https:' && !/^(localhost|127\.)/.test(location.hostname)) ? `<div class="note" style="background:#fde8e8">⚠ Facebook লগইন শুধু https সাইটে চলে। এই সাইটটা https-এ খুলুন।</div>` : (location.protocol !== 'https:' ? `<div class="note" style="background:#fde8e8">⚠ localhost-এ Facebook লগইন চলে না — Render বা ngrok-এর https লিংক দিয়ে খুলুন।</div>` : '');

const viewConnect = guard(async () => {
  CFG = await api('/connect/config');
  const st = await api('/connect/status');
  if (CFG.ready) loadFB(CFG).catch(() => {}); // আগেই লোড, যাতে বাটন চাপলেই পপআপ খোলে
  const dot = ok => ok ? '<span class="chip" style="background:#e1f7ea">✅ চালু</span>' : '<span class="chip" style="background:#fde8e8">⚠ সমস্যা</span>';
  const pages = st.pages.map(p => `<div class="card" style="margin:8px 0;padding:10px"><div class="row"><span class="grow"><b>📘 ${esc(p.name)}</b>${p.igUsername ? `<br><span class="small">📸 Instagram: <b>@${esc(p.igUsername)}</b></span>` : '<br><span class="small mut">Instagram যুক্ত নেই (Business/Creator অ্যাকাউন্ট পেজের সাথে যুক্ত করলে আসবে)</span>'}<br><span class="small mut">${when(p.connectedAt)} থেকে কানেক্টেড</span></span>${dot(!p.subscribeError)}</div>
    ${p.subscribeError ? `<div class="note" style="background:#fde8e8">Meta বলছে: ${esc(p.subscribeError)}</div>` : ''}
    <div class="row" style="margin-top:6px"><button class="sec sm" data-a="pageCheck" data-id="${esc(p.pageId)}">🔍 পরীক্ষা</button><button class="sec sm" data-a="pageResub" data-id="${esc(p.pageId)}">🔄 আবার সাবস্ক্রাইব</button><button class="bad sm" data-a="pageDisc" data-id="${esc(p.pageId)}">✖ ডিসকানেক্ট</button></div><div class="small" id="pc-${esc(p.pageId)}"></div></div>`).join('');
  const was = st.whatsapp.map(x => `<div class="card" style="margin:8px 0;padding:10px"><div class="row"><span class="grow"><b>💬 ${esc(x.number || x.phoneId)}</b>${x.name ? `<br><span class="small">${esc(x.name)}</span>` : ''}<br><span class="small mut">${when(x.connectedAt)} থেকে কানেক্টেড</span></span>${dot(true)}</div>
    ${x.registerError ? `<div class="note">ℹ নম্বর রেজিস্টারে Meta বলছে: ${esc(x.registerError)} (নম্বর আগে থেকে রেজিস্টার থাকলে এটা স্বাভাবিক)</div>` : ''}
    <div class="row" style="margin-top:6px"><button class="bad sm" data-a="waDisc" data-id="${esc(x.phoneId)}">✖ ডিসকানেক্ট</button></div></div>`).join('');
  const lg = st.legacy ? `<div class="note">ℹ এই অ্যাকাউন্টে আগের সেটআপের (সার্ভারের .env ফাইলের) ${[st.legacy.page && 'Facebook পেজ', st.legacy.instagram && 'Instagram', st.legacy.whatsapp && 'WhatsApp'].filter(Boolean).join(', ') || 'কিছু না'} এখনো চালু আছে। চাইলে নিচের বাটনে নতুন করে কানেক্ট করতে পারেন।</div>` : '';
  const c = st.courier;
  $('#main').innerHTML = `<div class="cols"><div>
  <div class="card"><h2>🔗 আপনার পেজ কানেক্ট করুন</h2>
   <p class="mut small">বাটন চাপুন → Facebook-এ লগইন করুন → যে পেজ/Instagram-এ AI কাজ করবে সেগুলো টিক দিন। ব্যস! কোনো টোকেন, ডেভেলপার অ্যাপ বা রিভিউ লাগবে না।</p>
   ${CFG.ready ? '' : `<div class="note" style="background:#fde8e8">⚠ এই সাইটের অ্যাডমিন এখনো Meta App সেট করেননি (সার্ভারে META_APP_ID ও META_APP_SECRET দরকার)। তাই কানেক্ট বাটন কাজ করবে না।</div>`}${warnHttps()}${lg}
   <h3>📘 Facebook পেজ + 📸 Instagram</h3>
   <button data-a="connectFb" ${CFG.ready ? '' : 'disabled'}>Facebook দিয়ে কানেক্ট করুন</button><div id="fbOut" style="margin-top:6px"></div>
   ${pages || '<p class="mut small" style="margin-top:8px">এখনো কোনো পেজ কানেক্ট করা নেই।</p>'}
   <p class="mut small">💡 Instagram কানেক্ট করতে: Instagram অ্যাকাউন্ট <b>Business বা Creator</b> হতে হবে এবং Facebook পেজের সাথে যুক্ত থাকতে হবে। লগইনের সময় Instagram-ও টিক দিন।</p>
   <h3 style="margin-top:16px">💬 WhatsApp</h3>
   <button data-a="connectWa" ${CFG.ready && CFG.waConfigId ? '' : 'disabled'}>WhatsApp কানেক্ট করুন</button>${CFG.ready && !CFG.waConfigId ? '<span class="small mut"> (অ্যাডমিন META_WA_CONFIG_ID সেট করলে চালু হবে)</span>' : ''}<div id="waOut" style="margin-top:6px"></div>
   ${was || '<p class="mut small" style="margin-top:8px">এখনো কোনো WhatsApp নম্বর কানেক্ট করা নেই।</p>'}
   <p class="mut small">💡 WhatsApp-এ নতুন বা আলাদা একটা নম্বর দেওয়াই ভালো; সেটআপের সময় Meta নম্বরে একটা কোড পাঠিয়ে যাচাই করবে।</p>
  </div></div>
  <div><div class="card"><h2>🚚 কুরিয়ার (Steadfast)</h2><p class="mut small">আপনার নিজের Steadfast অ্যাকাউন্টের key দিন, তাহলে অর্ডার আপনার অ্যাকাউন্টেই বুক হবে। না দিলে টেস্ট (mock) মোডে থাকবে।</p>
   ${c.viaEnv ? '<div class="note">ℹ এখন সার্ভারের .env-এর key চলছে। এখানে দিলে সেটাই চলবে।</div>' : ''}
   <label>মোড</label><select id="cmode"><option value="mock" ${c.mode !== 'steadfast' ? 'selected' : ''}>টেস্ট (mock) — আসল বুকিং হবে না</option><option value="steadfast" ${c.mode === 'steadfast' ? 'selected' : ''}>Steadfast (আসল বুকিং)</option></select>
   <label>API Key</label><input id="ckey" type="password" autocomplete="off" placeholder="${c.hasKeys ? '•••••• (সেভ করা আছে, বদলাতে চাইলে নতুনটা দিন)' : ''}">
   <label>Secret Key</label><input id="csec" type="password" autocomplete="off" placeholder="${c.hasKeys ? '•••••• (সেভ করা আছে)' : ''}">
   <button style="margin-top:8px" data-a="saveCourier">সেভ</button>
   ${c.webhookToken ? `<h3 style="margin-top:14px">Steadfast ওয়েবহুক (ডেলিভারি স্ট্যাটাস নিজে নিজে আপডেট)</h3><p class="mut small">Steadfast panel → Webhook settings-এ দিন:</p><label>Callback URL</label><input readonly onclick="this.select()" value="${esc(c.webhookUrl)}"><label>Auth Token</label><input readonly onclick="this.select()" value="${esc(c.webhookToken)}">` : ''}
  </div>
  <div class="card"><h2>✅ শেষে</h2><p class="small">কানেক্ট করার পর AI <b>প্র্যাক্টিস মোডে</b> থাকে (শুধু ড্রাফট বানায়, কাস্টমারকে নিজে উত্তর দেয় না)। উত্তর ঠিক আসছে দেখে <b>⚙ সেটিংস → AI লাইভ</b> চালু করুন।</p></div></div></div>`;
});

Object.assign(act, {
  connectFb: (_, el) => { // FB.login অবশ্যই সরাসরি ক্লিকে ডাকতে হয় (নইলে পপআপ ব্লক হয়), তাই await নেই
    if (!window.FB) return toast('Facebook SDK এখনো লোড হচ্ছে — ২ সেকেন্ড পর আবার চাপুন');
    const out = $('#fbOut'); const opts = CFG.fbConfigId
      ? { config_id: CFG.fbConfigId, response_type: 'code', override_default_response_type: true }
      : { scope: (CFG.scopes || 'pages_show_list,pages_messaging,pages_manage_metadata,pages_read_engagement,pages_manage_engagement,instagram_basic,instagram_manage_messages,instagram_manage_comments,business_management').replace(/\s+/g, ''), return_scopes: true };
    FB.login(resp => guard(async () => {
      const a = resp && resp.authResponse; if (!a) { out.innerHTML = '<div class="note">লগইন সম্পূর্ণ হয়নি বা বাতিল করা হয়েছে।</div>'; return; }
      out.innerHTML = '<div class="note">⏳ পেজ কানেক্ট হচ্ছে…</div>';
      const r = await api('/connect/facebook', { body: a.code ? { code: a.code } : { accessToken: a.accessToken } }).catch(e => ({ ok: false, error: e.message }));
      if (!r.ok) { out.innerHTML = `<div class="note" style="background:#fde8e8">❌ ${esc(r.error)}</div>`; return; }
      viewConnect(); setTimeout(() => { $('#fbOut').innerHTML = `<div class="note" style="background:#e1f7ea">✅ কানেক্ট হয়েছে: ${r.connected.map(p => esc(p.name) + (p.igUsername ? ' + @' + esc(p.igUsername) : '')).join(', ')}</div>`; }, 400);
    })(), opts);
  },
  connectWa: () => {
    if (!window.FB) return toast('Facebook SDK এখনো লোড হচ্ছে — ২ সেকেন্ড পর আবার চাপুন');
    WA_SESSION = null; const out = $('#waOut');
    FB.login(resp => guard(async () => {
      const code = resp && resp.authResponse && resp.authResponse.code;
      if (!code) { out.innerHTML = '<div class="note">সেটআপ সম্পূর্ণ হয়নি বা বাতিল করা হয়েছে।</div>'; return; }
      out.innerHTML = '<div class="note">⏳ নম্বর কানেক্ট হচ্ছে…</div>';
      for (let i = 0; i < 20 && !(WA_SESSION && WA_SESSION.phone_number_id); i++) await new Promise(r => setTimeout(r, 500)); // Meta-র ইভেন্টের জন্য একটু অপেক্ষা
      if (!WA_SESSION || !WA_SESSION.phone_number_id) { out.innerHTML = '<div class="note" style="background:#fde8e8">❌ Meta নম্বরের তথ্য পাঠায়নি। সেটআপ শেষ পর্যন্ত (Finish চেপে) করে আবার চেষ্টা করুন।</div>'; return; }
      const r = await api('/connect/whatsapp', { body: { code, wabaId: WA_SESSION.waba_id, phoneId: WA_SESSION.phone_number_id } }).catch(e => ({ ok: false, error: e.message }));
      if (!r.ok) { out.innerHTML = `<div class="note" style="background:#fde8e8">❌ ${esc(r.error)}</div>`; return; }
      viewConnect(); setTimeout(() => { $('#waOut').innerHTML = `<div class="note" style="background:#e1f7ea">✅ WhatsApp কানেক্ট হয়েছে: ${esc(r.whatsapp.number)}</div>`; }, 400);
    })(), { config_id: CFG.waConfigId, response_type: 'code', override_default_response_type: true, extras: { setup: CFG.waSolutionId ? { solutionID: CFG.waSolutionId } : {}, featureType: '', sessionInfoVersion: '3' } });
  },
  pageCheck: guard(async (d) => { const o = document.getElementById('pc-' + d.id); o.textContent = '⏳'; const r = await api(`/connect/page/${d.id}/check`); o.innerHTML = r.ok ? (r.missing.length ? `⚠ সাবস্ক্রাইব নেই: <b>${esc(r.missing.join(', '))}</b> — "আবার সাবস্ক্রাইব" চাপুন` : `✅ সব ঠিক (${esc(r.fields.join(', '))})`) : `❌ ${esc(r.error)}`; }),
  pageResub: guard(async (d) => { const r = await api(`/connect/page/${d.id}/resubscribe`, { body: {} }); toast(r.ok ? '✅ সাবস্ক্রাইব হয়েছে' : '❌ ' + r.error); viewConnect(); }),
  pageDisc: guard(async (d) => { if (!confirm('এই পেজ (ও এর Instagram) ডিসকানেক্ট করবেন? AI আর এখানকার মেসেজ ধরবে না।')) return; await api('/connect/page/' + d.id, { method: 'DELETE' }); viewConnect(); }),
  waDisc: guard(async (d) => { if (!confirm('এই WhatsApp নম্বর ডিসকানেক্ট করবেন?')) return; await api('/connect/whatsapp/' + d.id, { method: 'DELETE' }); viewConnect(); }),
  saveCourier: guard(async () => { await api('/connect/courier', { method: 'PUT', body: { mode: $('#cmode').value, apiKey: $('#ckey').value, secretKey: $('#csec').value } }); toast('✅ সেভ হয়েছে'); viewConnect(); }),
});
