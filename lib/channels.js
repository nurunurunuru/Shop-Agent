// Messenger / Instagram / WhatsApp পাঠানো, মিডিয়া নামানো, প্রোফাইল, কমেন্ট। 'web' হলো টেস্ট সিমুলেটর।
const axios = require('axios');
const U = require('./util'), S = require('./store');
const G = () => `${process.env.GRAPH_BASE || 'https://graph.facebook.com'}/${process.env.GRAPH_VERSION || 'v25.0'}`;
const absUrl = u => !u ? '' : /^https?:/.test(u) ? u : (process.env.PUBLIC_URL || '').replace(/\/$/, '') + u;
const publicOk = () => /^https:\/\//.test(process.env.PUBLIC_URL || '');
// ---- কোন দোকানের কোন পেজ/নম্বরের টোকেন ----
// প্রতিটা দোকানের নিজের কানেক্ট-করা টোকেন থাকে (ড্যাশবোর্ডের "কানেক্ট" ট্যাব থেকে)। শুধু আগের এক-দোকানের সেটআপে .env-এর টোকেন চলে।
const isLegacy = () => S.wsId() && S.wsId() === S.reg().legacy;
const envTok = p => (p === 'instagram' && process.env.IG_ACCESS_TOKEN) ? process.env.IG_ACCESS_TOKEN : (process.env.PAGE_ACCESS_TOKEN || '');
function pageConn(platform, channelId) {
  const pages = (S.D().channels || {}).pages || [];
  if (channelId) { const hit = pages.find(x => x.pageId === channelId || (platform === 'instagram' && x.igId === channelId)); if (hit) return hit; }
  return pages[0] || null;
}
function tok(platform, channelId) {
  if (!channelId && isLegacy() && envTok(platform)) return envTok(platform);
  const p = pageConn(platform, channelId);
  if (p) return p.token;
  if (isLegacy() && envTok(platform)) return envTok(platform);
  throw new Error('এই দোকানে ' + (platform === 'instagram' ? 'Instagram' : 'Facebook পেজ') + ' কানেক্ট করা নেই (কানেক্ট ট্যাব দেখুন)');
}
const waConn = pid => ((S.D().channels || {}).whatsapp || []).find(x => x.phoneId === pid) || null;
function waAuth(pid) {
  const c = pid ? waConn(pid) : null;
  if (c) return { id: c.phoneId, token: c.token };
  if (isLegacy() && process.env.WHATSAPP_TOKEN) return { id: pid || process.env.WHATSAPP_PHONE_NUMBER_ID, token: process.env.WHATSAPP_TOKEN };
  const first = ((S.D().channels || {}).whatsapp || [])[0];
  if (!pid && first) return { id: first.phoneId, token: first.token };
  throw new Error('এই দোকানে WhatsApp কানেক্ট করা নেই (কানেক্ট ট্যাব দেখুন)');
}
const t20 = s => String(s || '').slice(0, 20);
const errMsg = e => e.response?.data?.error?.message || e.response?.data?.message || e.message;
// opts.humanAgent: ২৪ ঘণ্টা পেরিয়ে গেলে টিমের নিজের হাতে লেখা মেসেজ ৭ দিন পর্যন্ত (Meta-র Human Agent নিয়ম)
const fb = (c, body, opts = {}) => { const t = tok(c.platform, c.channelId); return axios.post(`${G()}/me/messages`, { recipient: { id: c.externalId }, ...(opts.humanAgent ? { messaging_type: 'MESSAGE_TAG', tag: 'HUMAN_AGENT' } : { messaging_type: 'RESPONSE' }), ...body }, { params: { access_token: t }, timeout: 30000 }).then(r => r.data); }
const wa = (body, pid) => { const a = waAuth(pid); return axios.post(`${G()}/${a.id}/messages`, { messaging_product: 'whatsapp', ...body }, { headers: { Authorization: 'Bearer ' + a.token }, timeout: 30000 }).then(r => r.data); };
const pb = b => ({ type: 'postback', title: t20(b.title), payload: b.payload });
const waBtns = bs => bs.slice(0, 3).map(b => ({ type: 'reply', reply: { id: b.payload, title: t20(b.title) } }));
// ক্যারোসেল (Messenger/Instagram generic template)
const carousel = items => ({ attachment: { type: 'template', payload: { template_type: 'generic', elements: items.slice(0, 10).map(it => ({ title: it.title.slice(0, 80), subtitle: it.subtitle.slice(0, 80), ...(it.image && publicOk() ? { image_url: absUrl(it.image) } : {}), buttons: it.buttons.slice(0, 3).map(pb) })) } } });

async function deliver(c, p, opts = {}) {
  if (c.platform === 'web') return;
  if (c.platform === 'whatsapp') {
    const to = c.externalId, w = b => wa(b, c.waPhoneId); // কাস্টমার যে নম্বরে লিখেছে সেই নম্বর থেকেই উত্তর
    if (p.type === 'text') return w({ to, type: 'text', text: { body: p.text } });
    if (p.type === 'image') {
      if (!publicOk()) return p.caption ? w({ to, type: 'text', text: { body: p.caption } }) : null;
      return w({ to, type: 'image', image: { link: absUrl(p.url), caption: p.caption || undefined } });
    }
    if (p.type === 'video') return w({ to, type: 'video', video: { link: absUrl(p.url), caption: p.caption || undefined } });
    if (p.type === 'file') return w({ to, type: 'document', document: { link: absUrl(p.url), filename: p.name || 'file' } });
    if (p.type === 'buttons') return w({ to, type: 'interactive', interactive: { type: 'button', body: { text: p.text.slice(0, 1000) }, action: { buttons: waBtns(p.buttons) } } });
    if (p.type === 'cards') {
      for (const it of p.items.slice(0, 10)) {
        const interactive = { type: 'button', body: { text: `${it.title}\n${it.subtitle}`.slice(0, 1000) }, action: { buttons: waBtns(it.buttons) } };
        if (it.image && publicOk()) interactive.header = { type: 'image', image: { link: absUrl(it.image) } };
        await w({ to, type: 'interactive', interactive });
      }
    }
    return;
  }
  // messenger / instagram
  if (p.type === 'text') return fb(c, { message: { text: p.text.slice(0, 1999) } }, opts);
  if (['image', 'video', 'file'].includes(p.type)) {
    if (!publicOk()) throw new Error('PUBLIC_URL (https) সেট না থাকায় ফাইল/ছবি পাঠানো যাচ্ছে না');
    return fb(c, { message: { attachment: { type: p.type, payload: { url: absUrl(p.url), is_reusable: true } } } }, opts);
  }
  if (p.type === 'buttons') return fb(c, { message: { attachment: { type: 'template', payload: { template_type: 'button', text: p.text.slice(0, 639), buttons: p.buttons.slice(0, 3).map(pb) } } } }, opts);
  if (p.type === 'cards') return fb(c, { message: carousel(p.items) }, opts);
}

async function typing(c, on) { try { if (c.platform === 'messenger' || c.platform === 'instagram') await fb(c, { sender_action: on ? 'typing_on' : 'typing_off' }); } catch {} }
async function markSeen(c, lastMsgId) {
  try {
    if (c.platform === 'messenger' || c.platform === 'instagram') await fb(c, { sender_action: 'mark_seen' });
    else if (c.platform === 'whatsapp' && lastMsgId) await wa({ status: 'read', message_id: lastMsgId }, c.waPhoneId);
  } catch {}
}
// আসল নাম ও ছবি। Meta এটা দেয় শুধু "Business Asset User Profile Access" ফিচার চালু থাকলে, নইলে error ফেরত আসে।
async function profile(platform, id, channelId) {
  try {
    const fields = platform === 'instagram' ? 'name,username,profile_pic' : 'name,first_name,last_name,profile_pic';
    const d = (await axios.get(`${G()}/${id}`, { params: { fields, access_token: tok(platform, channelId) }, timeout: 15000 })).data;
    const name = d.name || [d.first_name, d.last_name].filter(Boolean).join(' ') || d.username || '';
    let pic = '';
    if (d.profile_pic) { try { const r = await axios.get(d.profile_pic, { responseType: 'arraybuffer', timeout: 15000 }); pic = await U.saveUpload(Buffer.from(r.data), r.headers['content-type'] || 'image/jpeg'); } catch {} }
    return { name, pic };
  } catch (e) { return { error: errMsg(e) }; }
}
async function fetchMedia(platform, ref, channelId) {
  if (platform === 'whatsapp') {
    const h = { Authorization: 'Bearer ' + waAuth(channelId).token };
    const m = (await axios.get(`${G()}/${ref}`, { headers: h })).data;
    const r = await axios.get(m.url, { headers: h, responseType: 'arraybuffer' });
    return { buf: Buffer.from(r.data), mime: m.mime_type || r.headers['content-type'] };
  }
  const r = await axios.get(ref, { responseType: 'arraybuffer' });
  return { buf: Buffer.from(r.data), mime: r.headers['content-type'] };
}
// ---- কমেন্ট ----
async function replyComment(platform, commentId, message, channelId) {
  const url = platform === 'instagram' ? `${G()}/${commentId}/replies` : `${G()}/${commentId}/comments`;
  return axios.post(url, { message }, { params: { access_token: tok(platform, channelId) }, timeout: 30000 }).then(r => r.data);
}
async function privateReply(platform, commentId, message, channelId) { // message = { text } অথবা ক্যারোসেল { attachment }
  return axios.post(`${G()}/me/messages`, { recipient: { comment_id: commentId }, message }, { params: { access_token: tok(platform, channelId) }, timeout: 30000 }).then(r => r.data);
}
async function postText(platform, postId, channelId) { // পোস্টের লেখা/ক্যাপশন (কোন প্রোডাক্টের পোস্ট বুঝতে)
  try {
    const f = platform === 'instagram' ? 'caption' : 'message,story';
    const d = (await axios.get(`${G()}/${postId}`, { params: { fields: f, access_token: tok(platform, channelId) }, timeout: 15000 })).data;
    return d.caption || d.message || d.story || '';
  } catch { return ''; }
}
// ---- Meta সাবস্ক্রিপশন পরীক্ষা/ঠিক করা (বাটন ও কমেন্ট কাজ না করার সবচেয়ে বড় কারণ) ----
const NEEDED = ['messages', 'messaging_postbacks', 'feed'];
const subTok = pageId => { const p = pageId ? ((S.D().channels || {}).pages || []).find(x => x.pageId === pageId) : null; return p ? p.token : tok('messenger', pageId); };
async function pageSubs(pageId) {
  const d = (await axios.get(`${G()}/me/subscribed_apps`, { params: { access_token: subTok(pageId) }, timeout: 15000 })).data;
  const fields = [...new Set((d.data || []).flatMap(a => a.subscribed_fields || []))];
  return { fields, missing: NEEDED.filter(f => !fields.includes(f)) };
}
async function subscribePage(pageId) {
  return axios.post(`${G()}/me/subscribed_apps`, null, { params: { subscribed_fields: NEEDED.join(','), access_token: subTok(pageId) }, timeout: 15000 }).then(r => r.data);
}
module.exports = { G, tok, pageConn, waConn, isLegacy, deliver, typing, markSeen, profile, fetchMedia, replyComment, privateReply, postText, carousel, pageSubs, subscribePage, publicOk, errMsg, NEEDED };
