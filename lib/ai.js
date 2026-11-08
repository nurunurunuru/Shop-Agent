// Gemini দিয়ে বুদ্ধি। GEMINI_API_KEY না থাকলে সরল "ডেমো ব্রেইন" চলে (শুধু ফ্লো টেস্টের জন্য)।
const axios = require('axios');
const U = require('./util'), O = require('./orders');

const key = () => process.env.GEMINI_API_KEY;
const model = () => process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const base = () => process.env.GEMINI_BASE || 'https://generativelanguage.googleapis.com';
const hasAI = () => !!key();

const models = () => [...new Set([model(), ...(process.env.GEMINI_FALLBACK_MODELS || 'gemini-3.5-flash-lite').split(',').map(x => x.trim()).filter(Boolean)])];
const sleep = ms => new Promise(r => setTimeout(r, ms));
// ব্যস্ত (429/5xx) হলে ৩ বার চেষ্টা, তারপর ব্যাকআপ মডেল। মডেল বন্ধ (404) বা key ভুল হলে সরাসরি পরেরটায়।
async function gem({ system, parts, json, temp = 0.7 }) {
  const body = { contents: [{ role: 'user', parts }], generationConfig: { temperature: temp, ...(json ? { responseMimeType: 'application/json' } : {}) } };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  let last;
  for (const m of models()) {
    for (let a = 1; a <= 3; a++) {
      try {
        const r = await axios.post(`${base()}/v1beta/models/${m}:generateContent`, body, { headers: { 'x-goog-api-key': key(), 'content-type': 'application/json' }, timeout: 60000 });
        if (m !== model()) console.log(`[AI] ব্যাকআপ মডেল চলেছে: ${m}`);
        return (r.data?.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
      } catch (e) {
        last = e; const st = e.response?.status;
        console.error(`[AI] ${m} (${a}/3) ব্যর্থ: ${st || ''} ${(e.response?.data?.error?.message || e.message).slice(0, 90)}`);
        if (![429, 500, 502, 503, 504].includes(st) && st) break;
        await sleep(500 * a);
      }
    }
  }
  throw last;
}
function parseJSON(t) {
  t = String(t || '').replace(/```json|```/g, '').trim();
  try { return JSON.parse(t); } catch {}
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch {} }
  return null;
}
const ACT = ['none', 'show_products', 'start_order', 'confirm_order', 'cancel_order', 'handover'];
function norm(j) {
  j = j || {};
  return {
    reply: String(j.reply || '').trim(), action: ACT.includes(j.action) ? j.action : 'none',
    product_codes: Array.isArray(j.product_codes) ? j.product_codes.map(String) : [],
    handover_reason: String(j.handover_reason || ''), customer: j.customer || {}, order_fields: j.order_fields || {},
    lead_interest: String(j.lead_interest || ''), intent: String(j.intent || 'other'),
    honorific: ['sir', 'madam'].includes(j.honorific) ? j.honorific : '', return_reason: String(j.return_reason || '').slice(0, 200),
  };
}
const inl = (buf, mime) => ({ inlineData: { mimeType: String(mime || 'image/jpeg').split(';')[0].replace('video/mp4', 'audio/mp4'), data: buf.toString('base64') } });

function systemPrompt(ctx) {
  const s = ctx.settings;
  return `You are the AI sales agent of the online shop "${s.businessName}", chatting with real customers on Messenger / Instagram / WhatsApp. Behave exactly like a polite, warm, professional human salesman.

STYLE
- Reply in the customer's language. If they write Bangla in English letters (Banglish), reply in proper Bangla script. If they write English, reply in English.
- If the customer says Salam, answer "ওয়ালাইকুম আসসালাম". Use the honorific: customer.honorific is "${ctx.customer.honorific || 'unknown'}". If "sir" use "স্যার", if "madam" use "ম্যাম". If unknown, guess from the name only when obvious (set the "honorific" field), otherwise stay neutral and politely ask once in a natural way.
- Every reply must be neat: 2-6 short lines, no walls of text, at most 1-2 emojis. Gently persuade (benefit, availability, delivery) but never pressure and never lie.
- Always end with a clear friendly next step.

FACTS
- Use ONLY the catalog below for price, stock, size, colour and delivery. NEVER invent a price, offer or detail. If something is not in the catalog, say you will check, and use action "handover".
- If a product or size is out of stock say so politely and suggest in-stock alternatives from the catalog.
- Delivery: inside Dhaka ${U.money(s.deliveryInside)}, outside Dhaka ${U.money(s.deliveryOutside)}, time ${s.deliveryDays}. Payment: cash on delivery.
- If the customer is angry, complains, asks refund / exchange / damaged item / special discount / anything you cannot answer from the facts, use action "handover" with a short Bangla "handover_reason".
- For parcel tracking questions use the customer's ORDERS section below.
- RETURNED ORDERS: if ORDERS shows a returned order with no reason noted, ask warmly and without blame why it was returned (size, quality, delay, changed mind), put the answer in "return_reason", apologise if it was our fault, and gently offer a better option from the catalog (another size, similar product). Never argue.
- RETURNING CUSTOMERS (past orders in CUSTOMER line): greet them like a valued repeat customer, never re-ask details you already know, and if a size is known from past orders do not ask it again.

OWNER'S RULES
${ctx.rules}

CATALOG (code | name | price | category | sizes & stock | description)
${ctx.catalogText || '(empty)'}

ACTIONS (field "action")
- "show_products": customer wants to see/browse something (or an image matched). Put up to 5 codes in "product_codes". The system shows picture cards with price and buttons, so your "reply" is only a short intro. If the request is vague ("কী কী আছে?") do NOT dump products: ask ONE short clarifying question with 2-4 options (action "none").
- "start_order": customer clearly wants to buy a specific product (put its code in product_codes[0]). Keep "reply" very short; the system collects size/name/phone/address itself, so never ask for those yourself.
- "confirm_order": ONLY when an order draft is complete, the summary was shown and the customer clearly says yes/confirm.
- "cancel_order": customer drops the draft order.
- "handover": a human must take over.
- "none": normal answer.
While an order draft is active, extract anything the customer gives (size, name, phone, address, qty) into "order_fields" and do not ask for missing details yourself.
Also fill "customer" (name/phone/address) whenever the customer states them, and "lead_interest" (short text of what they want) when they show buying interest.

OUTPUT: return ONLY one JSON object:
{"reply":"","action":"none","product_codes":[],"handover_reason":"","customer":{"name":"","phone":"","address":""},"order_fields":{"size":"","name":"","phone":"","address":"","qty":0},"lead_interest":"","return_reason":"","intent":"greeting|browse|price|size|order|complaint|tracking|other","honorific":""}`;
}
function userBlock(ctx) {
  const c = ctx.customer;
  return `NOW: ${new Date().toLocaleString('en-GB')}
CUSTOMER: name=${c.name || '-'} phone=${c.phone || '-'} honorific=${c.honorific || '-'} usual_size=${c.lastSize || '-'} platform=${ctx.platform}; past orders: ${ctx.stats}
ORDERS: ${ctx.ordersText || 'none'}
ORDER DRAFT: ${ctx.draftText || 'none'}
${ctx.imageMatch ? 'IMAGE SENT BY CUSTOMER: ' + ctx.imageMatch + '\n' : ''}
CONVERSATION SO FAR:
${ctx.history || '(first message)'}

CUSTOMER'S NEW MESSAGE: ${ctx.text || '(no text)'}`;
}
async function brain(ctx) {
  if (!hasAI()) return fallback(ctx);
  try {
    const t = await gem({ system: systemPrompt(ctx), parts: [{ text: userBlock(ctx) }], json: true, temp: 0.6 });
    const j = parseJSON(t);
    return j ? norm(j) : norm({ reply: t });
  } catch (e) {
    console.error('AI error:', e.response?.data?.error?.message || e.message);
    return { ...norm({}), action: 'handover', handover_reason: 'AI কাজ করছে না (' + (e.response?.data?.error?.message || e.message).slice(0, 80) + ')', ai_failed: true };
  }
}
// ---- কী ছাড়া ডেমো ----
function fallback(ctx) {
  const t = (ctx.text || '').toLowerCase();
  const words = t.split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 2);
  const hits = ctx.products.filter(p => words.some(w => `${p.name} ${p.category} ${p.keywords || ''} ${p.code}`.toLowerCase().includes(w)));
  if (/আসসালামু|assalam|salam|সালাম/.test(t)) return norm({ reply: 'ওয়ালাইকুম আসসালাম! 😊 কী ধরনের প্রোডাক্ট খুঁজছেন?' });
  if (hits.length) return norm({ reply: 'এই প্রোডাক্টগুলো আছে, দেখে নিন 👇', action: 'show_products', product_codes: hits.slice(0, 5).map(p => p.code), intent: 'browse', lead_interest: ctx.text });
  if (ctx.imageMatch) return norm({ reply: 'ছবিটা পেয়েছি। আমাদের টিম দেখে জানাচ্ছে।', action: 'handover', handover_reason: 'ছবি (ডেমো মোড, AI key নেই)' });
  if (/refund|return|ফেরত|অভিযোগ|complain/.test(t)) return norm({ reply: 'আমাদের টিমের একজন এখনই আপনার সাথে কথা বলবেন।', action: 'handover', handover_reason: 'অভিযোগ/রিটার্ন' });
  return norm({ reply: '(ডেমো মোড: Gemini key নেই) আপনি কী খুঁজছেন লিখুন, যেমন প্রোডাক্টের নাম।' });
}

const toks = t => [...new Set(String(t || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 2))];
// লেখা (পোস্টের ক্যাপশন/ছবির বর্ণনা) মিলিয়ে সবচেয়ে কাছের প্রোডাক্ট
function matchProductsByText(products, text, limit = 3) {
  const tt = toks(text);
  return products.map(p => { const h = `${p.name} ${p.category} ${p.keywords || ''} ${p.code} ${p.description || ''}`.toLowerCase(); return { p, score: tt.filter(w => h.includes(w)).length }; })
    .filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, limit).map(x => x.p);
}
function shortlist(products, desc, max = 12) { // ক্যাটালগ বড় হলে ছবি মেলানোর আগে ছোট করা
  if (products.length <= max) return products;
  const first = matchProductsByText(products, desc, max);
  return [...first, ...products.filter(p => !first.includes(p))].slice(0, max);
}
async function commentIntent(text) {
  const rx = /দাম|প্রাইস|price|কত|dam|daam|koto|kto|rate|রেট|available|আছে|ache|stock|size|সাইজ|details|ডিটেইল|বিস্তারিত|inbox|ইনবক্স|order|অর্ডার|nibo|নিব|kinbo|কিনব|pp\b|pls|please|link|কালার|colour|color|delivery|ডেলিভারি/i;
  if (!hasAI()) return rx.test(text) ? 'price' : 'other';
  try {
    const j = parseJSON(await gem({ json: true, temp: 0, parts: [{ text: `Classify this social-media comment on a shop's product post (Bangla/English/Banglish). intent: "price" (asks price/availability/size/details/how to order), "interest" (wants it, e.g. "nibo", "chai"), "other" (compliment, emoji, tag a friend, chit-chat), "spam" (ads, links, abuse). Comment: "${String(text).slice(0, 300)}". JSON: {"intent":""}` }] }));
    return ['price', 'interest', 'other', 'spam'].includes(j && j.intent) ? j.intent : (rx.test(text) ? 'price' : 'other');
  } catch { return rx.test(text) ? 'price' : 'other'; }
}
async function describeImage(buf, mime) {
  if (!hasAI()) return { description: '' };
  try {
    const t = await gem({ parts: [inl(buf, mime), { text: 'Describe this image for an online shop assistant in Bangla, max 2 sentences (product type, colour, style). If a product code or text is visible, include it. JSON: {"description":"","visible_code":""}' }], json: true, temp: 0.2 });
    return parseJSON(t) || { description: '' };
  } catch (e) { console.error('describeImage', e.message); return { description: '' }; }
}
async function transcribe(buf, mime) {
  if (!hasAI()) return '';
  try { return (await gem({ parts: [inl(buf, mime), { text: 'Transcribe this voice message exactly as spoken. Use Bangla script for Bangla speech, English for English. Output only the transcript.' }], temp: 0 })).trim(); }
  catch (e) { console.error('transcribe', e.message); return ''; }
}
// কোড → হুবহু ছবি → দেখতে কেমন, এই ক্রমে মেলায়
async function matchImage(buf, mime, products) {
  if (!hasAI()) return null;
  const parts = [inl(buf, mime), { text: 'CUSTOMER IMAGE is above. Below are catalog products with their pictures.' }];
  let n = 0;
  for (const p of products) {
    const img = p.images[0] && p.images[0].startsWith('/uploads/') ? U.readUpload(p.images[0]) : null;
    if (!img || img.length > 600000 || n >= 12) continue;
    parts.push({ text: `Catalog product code=${p.code} name=${p.name}:` }, inl(img, 'image/jpeg')); n++;
  }
  parts.push({ text: 'Which catalog products look the same as the customer image? If a code is printed in the image, trust it first. Only include real matches, never guess. JSON: {"codes":[best first, max 3],"confidence":"high|medium|low","description":"short Bangla description of the customer image"}' });
  try { return parseJSON(await gem({ parts, json: true, temp: 0.1 })); } catch (e) { console.error('matchImage', e.message); return null; }
}
async function assist(mode, { history, question, orders, customer }) {
  if (!hasAI()) return '(AI key নেই, তাই সহকারী বন্ধ)';
  const ctx = `CUSTOMER: ${customer}\nORDERS: ${orders}\nCONVERSATION:\n${history}`;
  const task = {
    summary: 'Summarize this customer relationship in Bangla in 4-6 short lines: who they are, what they wanted, orders, any problem, current status, and the best next action for our team.',
    ask: 'Answer the team member\'s question about this customer in Bangla, using only the data above. Question: ' + question,
    draft: 'Write the best next reply from our team to the customer, in the customer\'s language, polite professional salesman tone, plain text only, no quotes, no explanation.',
  }[mode];
  try { return (await gem({ parts: [{ text: ctx + '\n\nTASK: ' + task }], temp: 0.5 })).trim(); } catch (e) { return 'AI ত্রুটি: ' + (e.response?.data?.error?.message || e.message); }
}
async function smallText(prompt, fallbackText) {
  if (!hasAI()) return fallbackText;
  try { return (await gem({ parts: [{ text: prompt }], temp: 0.7 })).trim() || fallbackText; } catch { return fallbackText; }
}
async function commentPlan({ settings, commenter, comment, products }) {
  const one = products.length === 1 ? products[0] : null;
  const priceLine = one ? `${one.name}: ${U.money(one.price)}` : '';
  const fb = {
    public_reply: `ধন্যবাদ ${commenter}! 😊 ${priceLine ? priceLine + '। ' : ''}বিস্তারিত ও ছবি ইনবক্সে পাঠিয়েছি, দেখে নিন।`,
    dm: `আসসালামু আলাইকুম ${commenter}! আমাদের পোস্টে আগ্রহ দেখানোর জন্য ধন্যবাদ 😊\n${products.length ? products.map(p => `🛍 ${p.name} — ${U.money(p.price)}`).join('\n') + '\n' : ''}অর্ডার করতে বা কিছু জানতে এখানেই লিখুন, আমরা সাহায্য করব।`,
  };
  if (!hasAI()) return fb;
  try {
    const j = parseJSON(await gem({ json: true, parts: [{ text: `You are the social media agent of "${settings.businessName}". A customer named "${commenter}" commented on our post: "${comment}". Products on that post: ${products.map(p => `${p.name} (${U.money(p.price)}, ${O.stockText(p)})`).join('; ') || 'unknown'}. Write in Bangla (or the comment's language), polite and professional: "public_reply" = ONE short friendly line using their name that answers their question with the real price/stock when known (only if the product is known) and says full details and pictures were sent to their inbox; "dm" = a warm 3-4 line inbox message naming the product(s) with price, delivery info (inside Dhaka ${U.money(settings.deliveryInside)}, outside ${U.money(settings.deliveryOutside)}, cash on delivery) and inviting them to reply here to order. Never invent facts or prices. JSON: {"public_reply":"","dm":""}` }] }));
    return j && j.public_reply && j.dm ? j : fb;
  } catch { return fb; }
}
module.exports = { hasAI, brain, commentIntent, matchProductsByText, shortlist, describeImage, transcribe, matchImage, assist, smallText, commentPlan };
