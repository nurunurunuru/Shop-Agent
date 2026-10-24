// Messenger / Instagram / WhatsApp পাঠানো ও মিডিয়া নামানো। 'web' হলো টেস্ট সিমুলেটর (কিছু পাঠায় না)।
const axios = require('axios');
const G = () => `${process.env.GRAPH_BASE || 'https://graph.facebook.com'}/${process.env.GRAPH_VERSION || 'v25.0'}`;
const absUrl = u => !u ? '' : /^https?:/.test(u) ? u : (process.env.PUBLIC_URL || '').replace(/\/$/, '') + u;
const publicOk = () => /^https:\/\//.test(process.env.PUBLIC_URL || '');
const tok = p => (p === 'instagram' && process.env.IG_ACCESS_TOKEN) ? process.env.IG_ACCESS_TOKEN : process.env.PAGE_ACCESS_TOKEN;
const t20 = s => String(s || '').slice(0, 20);
const fb = (c, body) => axios.post(`${G()}/me/messages`, { recipient: { id: c.externalId }, messaging_type: 'RESPONSE', ...body }, { params: { access_token: tok(c.platform) } }).then(r => r.data);
const wa = (body, pid) => axios.post(`${G()}/${pid || process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, { messaging_product: 'whatsapp', ...body }, { headers: { Authorization: 'Bearer ' + process.env.WHATSAPP_TOKEN } }).then(r => r.data);
const pb = b => ({ type: 'postback', title: t20(b.title), payload: b.payload });
const waBtns = bs => bs.slice(0, 3).map(b => ({ type: 'reply', reply: { id: b.payload, title: t20(b.title) } }));

async function deliver(c, p) {
  if (c.platform === 'web') return;
  if (c.platform === 'whatsapp') {
    const to = c.externalId, wa_ = b => wa(b, c.waPhoneId); // কাস্টমার যে নম্বরে লিখেছে সেই নম্বর থেকেই উত্তর
    if (p.type === 'text') return wa_({ to, type: 'text', text: { body: p.text } });
    if (p.type === 'image') {
      if (!publicOk()) return p.caption ? wa_({ to, type: 'text', text: { body: p.caption } }) : null;
      return wa_({ to, type: 'image', image: { link: absUrl(p.url), caption: p.caption || undefined } });
    }
    if (p.type === 'buttons') return wa_({ to, type: 'interactive', interactive: { type: 'button', body: { text: p.text.slice(0, 1000) }, action: { buttons: waBtns(p.buttons) } } });
    if (p.type === 'cards') {
      for (const it of p.items.slice(0, 10)) {
        const interactive = { type: 'button', body: { text: `${it.title}\n${it.subtitle}`.slice(0, 1000) }, action: { buttons: waBtns(it.buttons) } };
        if (it.image && publicOk()) interactive.header = { type: 'image', image: { link: absUrl(it.image) } };
        await wa_({ to, type: 'interactive', interactive });
      }
      return;
    }
    return;
  }
  // messenger / instagram
  if (p.type === 'text') return fb(c, { message: { text: p.text.slice(0, 1999) } });
  if (p.type === 'image') {
    if (!publicOk()) return p.caption ? fb(c, { message: { text: p.caption } }) : null;
    return fb(c, { message: { attachment: { type: 'image', payload: { url: absUrl(p.url), is_reusable: true } } } });
  }
  if (p.type === 'buttons') return fb(c, { message: { attachment: { type: 'template', payload: { template_type: 'button', text: p.text.slice(0, 639), buttons: p.buttons.slice(0, 3).map(pb) } } } });
  if (p.type === 'cards') {
    const elements = p.items.slice(0, 10).map(it => ({ title: it.title.slice(0, 80), subtitle: it.subtitle.slice(0, 80), ...(it.image && publicOk() ? { image_url: absUrl(it.image) } : {}), buttons: it.buttons.slice(0, 3).map(pb) }));
    return fb(c, { message: { attachment: { type: 'template', payload: { template_type: 'generic', elements } } } });
  }
}

async function typing(c, on) {
  try {
    if (c.platform === 'messenger' || c.platform === 'instagram') await fb(c, { sender_action: on ? 'typing_on' : 'typing_off' });
  } catch {}
}
async function markSeen(c, lastMsgId) {
  try {
    if (c.platform === 'messenger' || c.platform === 'instagram') await fb(c, { sender_action: 'mark_seen' });
    else if (c.platform === 'whatsapp' && lastMsgId) await wa({ status: 'read', message_id: lastMsgId }, c.waPhoneId);
  } catch {}
}
async function profile(platform, id) {
  try {
    const f = platform === 'instagram' ? 'name,username' : 'first_name,last_name';
    const d = (await axios.get(`${G()}/${id}`, { params: { fields: f, access_token: tok(platform) } })).data;
    return d.name || [d.first_name, d.last_name].filter(Boolean).join(' ') || d.username || null;
  } catch { return null; }
}
async function fetchMedia(platform, ref) {
  if (platform === 'whatsapp') {
    const h = { Authorization: 'Bearer ' + process.env.WHATSAPP_TOKEN };
    const m = (await axios.get(`${G()}/${ref}`, { headers: h })).data;
    const r = await axios.get(m.url, { headers: h, responseType: 'arraybuffer' });
    return { buf: Buffer.from(r.data), mime: m.mime_type || r.headers['content-type'] };
  }
  const r = await axios.get(ref, { responseType: 'arraybuffer' });
  return { buf: Buffer.from(r.data), mime: r.headers['content-type'] };
}
async function replyComment(platform, commentId, message) {
  const url = platform === 'instagram' ? `${G()}/${commentId}/replies` : `${G()}/${commentId}/comments`;
  return axios.post(url, { message }, { params: { access_token: tok(platform) } }).then(r => r.data);
}
async function privateReply(platform, commentId, text) {
  return axios.post(`${G()}/me/messages`, { recipient: { comment_id: commentId }, message: { text } }, { params: { access_token: tok(platform) } }).then(r => r.data);
}

module.exports = { deliver, typing, markSeen, profile, fetchMedia, replyComment, privateReply, publicOk };
