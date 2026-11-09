// Meta-র একটাই webhook (আপনার Meta App-এ একবার বসানো)। প্রতিটা ইভেন্ট page id / Instagram id / WhatsApp number id দেখে
// ঠিক দোকানে পাঠানো হয়। X-Hub-Signature-256 মিলিয়ে নকল রিকোয়েস্ট ফেরানো হয় (META_APP_SECRET থাকলে)।
const router = require('express').Router();
const crypto = require('crypto');
const E = require('../lib/engine'), S = require('../lib/store');

const seen = new Set();
const dup = id => { if (!id) return false; if (seen.has(id)) return true; seen.add(id); if (seen.size > 5000) seen.delete(seen.values().next().value); return false; };

const sigOk = req => {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return true; // সিক্রেট না দিলে যাচাই বন্ধ (শুধু টেস্টে)
  const got = String(req.headers['x-hub-signature-256'] || '').replace(/^sha256=/, '');
  if (!req.rawBody || !got) return false;
  const want = crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');
  const a = Buffer.from(got), b = Buffer.from(want);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

router.get('/', (req, res) => {
  if (req.query['hub.mode'] === 'subscribe' && process.env.VERIFY_TOKEN && req.query['hub.verify_token'] === process.env.VERIFY_TOKEN) return res.status(200).send(req.query['hub.challenge']);
  res.sendStatus(403);
});
router.post('/', (req, res) => {
  if (!sigOk(req)) { console.error('webhook: signature মেলেনি, ফেরত দেওয়া হলো'); return res.sendStatus(403); }
  res.sendStatus(200);
  try { parse(req.body || {}); } catch (e) { console.error('webhook parse:', e); }
});

// ইভেন্ট → দোকান
function inShop(key, fn) {
  const ws = S.routeFor(key);
  if (!ws || !S.peek(ws)) { console.log('[webhook] এই আইডি কোনো দোকানে কানেক্ট নেই: ' + key); return; }
  try { S.run(ws, fn); } catch (e) { console.error('webhook (' + key + '):', e); }
}

function parse(b) {
  if (b.object === 'page' || b.object === 'instagram') {
    const platform = b.object === 'instagram' ? 'instagram' : 'messenger';
    for (const en of b.entry || []) inShop((platform === 'instagram' ? 'ig:' : 'fb:') + en.id, () => {
      const channelId = String(en.id);
      for (const ev of en.messaging || []) {
        const id = ev.sender && ev.sender.id;
        if (!id || id === en.id || (ev.message && ev.message.is_echo)) continue;
        if (ev.postback) {
          if (dup(ev.postback.mid || `${ev.timestamp}${id}${ev.postback.payload}`)) continue;
          E.enqueue({ platform, channelId, externalId: id, postback: ev.postback.payload, text: ev.postback.title }); continue;
        }
        const m = ev.message; if (!m || dup(m.mid)) continue;
        if (m.quick_reply && m.quick_reply.payload) { E.enqueue({ platform, channelId, externalId: id, postback: m.quick_reply.payload, text: m.text }); continue; }
        const att = (m.attachments || []).find(a => ['image', 'audio'].includes(a.type) && a.payload && a.payload.url);
        if (!m.text && !att) continue;
        E.enqueue({ platform, channelId, externalId: id, text: m.text || '', msgId: m.mid, media: att ? { kind: att.type, url: att.payload.url } : null });
      }
      for (const ch of en.changes || []) {
        const v = ch.value || {};
        if (platform === 'messenger' && ch.field === 'feed' && v.item === 'comment' && v.verb === 'add') {
          if (!v.from || v.from.id === en.id || (v.parent_id && v.parent_id !== v.post_id) || dup('c' + v.comment_id)) continue;
          E.handleComment({ platform, channelId, commentId: v.comment_id, postId: v.post_id, text: v.message || '', fromName: v.from.name }).catch(e => console.error(e));
        }
        if (platform === 'instagram' && ch.field === 'comments') {
          if (!v.from || v.from.id === en.id || v.parent_id || dup('c' + v.id)) continue;
          E.handleComment({ platform, channelId, commentId: v.id, postId: v.media && v.media.id, text: v.text || '', fromName: v.from.username }).catch(e => console.error(e));
        }
      }
    });
  } else if (b.object === 'whatsapp_business_account') {
    for (const en of b.entry || []) for (const ch of en.changes || []) {
      const v = ch.value || {}, phoneId = v.metadata && v.metadata.phone_number_id;
      if (!phoneId) continue;
      inShop('wa:' + phoneId, () => {
        const name = v.contacts && v.contacts[0] && v.contacts[0].profile && v.contacts[0].profile.name;
        for (const m of v.messages || []) {
          if (dup(m.id)) continue;
          const base = { platform: 'whatsapp', waPhoneId: phoneId, externalId: m.from, phone: m.from.replace(/^88/, ''), name, msgId: m.id };
          if (m.type === 'text') E.enqueue({ ...base, text: m.text.body });
          else if (m.type === 'image') E.enqueue({ ...base, text: (m.image.caption || ''), media: { kind: 'image', id: m.image.id } });
          else if (m.type === 'audio') E.enqueue({ ...base, media: { kind: 'audio', id: m.audio.id } });
          else if (m.type === 'interactive') { const r = m.interactive.button_reply || m.interactive.list_reply; if (r) E.enqueue({ ...base, postback: r.id, text: r.title }); }
          else if (m.type === 'button') E.enqueue({ ...base, postback: m.button.payload, text: m.button.text });
        }
      });
    }
  }
}
module.exports = router;
