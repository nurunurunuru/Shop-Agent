const axios = require('axios');
const U = require('./util');
const O = require('./orders');

// =====================================================
// GEMINI CONFIG
// Primary: gemini-3.6-flash
// Backup:  gemini-3.5-flash-lite
// =====================================================

const key = () => process.env.GEMINI_API_KEY;

// "a, b ,c" -> ['a','b','c']
const list = (v, d) =>
  String(v || d || '').split(',').map(s => s.trim()).filter(Boolean);

// Several Gemini models can be listed (comma separated).
// Free quota is counted PER MODEL, so more models = more free requests.
const geminiModels = () => [...new Set([
  ...list(process.env.GEMINI_MODEL, 'gemini-3.6-flash'),
  ...list(process.env.GEMINI_FALLBACK_MODEL, 'gemini-3.5-flash-lite')
])];

const base = () =>
  (process.env.GEMINI_BASE ||
    'https://generativelanguage.googleapis.com').replace(/\/+$/, '');

// Free backup providers (OpenAI-compatible, TEXT ONLY).
// Each one is used only if its API key is set in the environment.
// Model names change over time: set *_MODEL in .env if a default stops working.
const EXTRA = [
  {
    id: 'groq', keyEnv: 'GROQ_API_KEY', modelEnv: 'GROQ_MODEL',
    defModel: 'llama-3.3-70b-versatile,llama-3.1-8b-instant',
    base: 'https://api.groq.com/openai/v1', jsonMode: true
  },
  {
    id: 'cerebras', keyEnv: 'CEREBRAS_API_KEY', modelEnv: 'CEREBRAS_MODEL',
    defModel: 'llama-3.3-70b',
    base: 'https://api.cerebras.ai/v1', jsonMode: false
  },
  {
    id: 'openrouter', keyEnv: 'OPENROUTER_API_KEY', modelEnv: 'OPENROUTER_MODEL',
    defModel: 'meta-llama/llama-3.3-70b-instruct:free',
    base: 'https://openrouter.ai/api/v1', jsonMode: false
  }
];

const hasAI = () =>
  Boolean(key()) || EXTRA.some(p => Boolean(process.env[p.keyEnv]));

// Retry settings
const MAX_RETRIES = 2;
const REQUEST_TIMEOUT = 30000;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// entry id -> time (ms) until which that model is skipped
const cooldown = {};

function errorMessage(e) {
  return (
    e?.response?.data?.error?.message ||
    e?.message ||
    'Unknown AI error'
  );
}

function statusCode(e) {
  return e?.response?.status || 0;
}

// Do not repeatedly retry invalid credentials or bad requests.
function isRetryable(e) {
  const status = statusCode(e);

  return (
    status === 408 ||
    status === 429 ||
    status >= 500 ||
    !status
  );
}

// "11h48m5.48s" / "42s" / "500ms"  ->  milliseconds (0 if unknown)
function parseDuration(str) {
  const m = String(str || '').trim().match(
    /^(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m(?!s))?(?:(\d+(?:\.\d+)?)s)?(?:(\d+(?:\.\d+)?)ms)?$/
  );
  if (!m) return 0;
  const [, h, mi, s, ms] = m;
  return Math.round(
    (Number(h || 0) * 3600 + Number(mi || 0) * 60 + Number(s || 0)) * 1000 +
    Number(ms || 0)
  );
}

// How long the provider says we must wait before retrying (ms), or 0.
function retryDelayMs(e) {
  const details = e?.response?.data?.error?.details;

  if (Array.isArray(details)) {
    const info = details.find(d => d && d.retryDelay);
    if (info) {
      const ms = parseDuration(info.retryDelay);
      if (ms) return ms;
    }
  }

  const header = e?.response?.headers?.['retry-after'];
  if (header && /^\d+$/.test(String(header))) return Number(header) * 1000;

  const m = errorMessage(e).match(/(?:retry|try again) in ([0-9hms.]+)/i);
  return m ? parseDuration(m[1].replace(/\.+$/, '')) : 0;
}

// Daily free quota: retrying right now is pointless.
function isDailyQuota(e) {
  const err = e?.response?.data?.error;
  const text = `${err ? JSON.stringify(err) : ''} ${errorMessage(e)}`;
  return /per[ -]?day/i.test(text) || retryDelayMs(e) > 5 * 60 * 1000;
}

// =====================================================
// PROVIDER CHAIN: Gemini models first, free backups after
// =====================================================

const hasMedia = (parts) =>
  (parts || []).some(p => p && p.inlineData);

function buildChain(parts) {
  const chain = [];

  if (key()) {
    for (const m of geminiModels()) {
      chain.push({ kind: 'gemini', id: `gemini:${m}`, model: m });
    }
  }

  // Backups are text-only: skip them for image / voice requests.
  if (!hasMedia(parts)) {
    for (const p of EXTRA) {
      const k = process.env[p.keyEnv];
      if (!k) continue;

      for (const m of list(process.env[p.modelEnv], p.defModel)) {
        chain.push({
          kind: 'openai',
          id: `${p.id}:${m}`,
          model: m,
          base: p.base,
          key: k,
          jsonMode: p.jsonMode
        });
      }
    }
  }

  return chain;
}

function requestGemini(entry, options) {
  const { system, parts, json, temp = 0.7 } = options;

  const body = {
    contents: [
      {
        role: 'user',
        parts
      }
    ],
    generationConfig: {
      temperature: temp,
      ...(json ? { responseMimeType: 'application/json' } : {})
    }
  };

  if (system) {
    body.systemInstruction = {
      parts: [{ text: system }]
    };
  }

  return axios.post(
    `${base()}/v1beta/models/${entry.model}:generateContent`,
    body,
    {
      headers: {
        'x-goog-api-key': key(),
        'content-type': 'application/json'
      },
      timeout: REQUEST_TIMEOUT
    }
  );
}

function requestOpenAI(entry, options) {
  const { system, parts, json, temp = 0.7 } = options;

  const text = (parts || [])
    .map(p => p.text || '')
    .filter(Boolean)
    .join('\n\n');

  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: text });

  return axios.post(
    `${entry.base}/chat/completions`,
    {
      model: entry.model,
      messages,
      temperature: temp,
      ...(json && entry.jsonMode
        ? { response_format: { type: 'json_object' } }
        : {})
    },
    {
      headers: {
        Authorization: `Bearer ${entry.key}`,
        'content-type': 'application/json'
      },
      timeout: REQUEST_TIMEOUT
    }
  );
}

// Returns { text, reason }
async function callEntry(entry, options) {
  if (entry.kind === 'gemini') {
    const response = await requestGemini(entry, options);
    const candidate = response.data?.candidates?.[0];

    return {
      text: (candidate?.content?.parts || [])
        .map(part => part.text || '')
        .join('')
        .trim(),
      reason: candidate?.finishReason || 'EMPTY_RESPONSE'
    };
  }

  const response = await requestOpenAI(entry, options);
  const choice = response.data?.choices?.[0];

  return {
    text: String(choice?.message?.content || '')
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .trim(),
    reason: choice?.finish_reason || 'EMPTY_RESPONSE'
  };
}

async function gem(options) {
  if (!hasAI()) {
    throw new Error('No AI API key is set');
  }

  // JSON calls must return real JSON, otherwise try again / use next model.
  const validate =
    options.validate ||
    (options.json ? (t => parseJSON(t) !== null) : null);

  const chain = buildChain(options.parts);
  let lastError = null;
  let lastRaw = '';

  for (const entry of chain) {
    if ((cooldown[entry.id] || 0) > Date.now()) {
      console.log(`[AI] Skipping ${entry.id} (cooldown)`);
      continue;
    }

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(
          `[AI] Trying ${entry.id} (${attempt + 1}/${MAX_RETRIES + 1})`
        );

        const { text, reason } = await callEntry(entry, options);

        if (!text) {
          // Empty response can happen if the model blocks a response.
          throw new Error(`AI returned no text (${reason})`);
        }

        if (validate && !validate(text)) {
          const bad = new Error('Model returned an invalid format');
          bad.invalid = true;
          bad.rawText = text;
          throw bad;
        }

        console.log(`[AI] Success: ${entry.id}`);
        return text;
      } catch (e) {
        lastError = e;

        const status = statusCode(e);
        console.error(
          `[AI] ${entry.id} failed; status=${status || (e.invalid ? 'bad-format' : 'network')};`,
          errorMessage(e)
        );

        if (e.invalid) {
          lastRaw = e.rawText;
          console.error('[AI] raw:', String(e.rawText).slice(0, 400));
        }

        // Wrong key / no permission / unknown model:
        // skip this one for a while, other providers may still work.
        if (status === 401 || status === 403 || status === 404) {
          cooldown[entry.id] = Date.now() + 60 * 60 * 1000;
          break;
        }

        // Bad request: go to the next model.
        if (status === 400) {
          break;
        }

        // Quota exceeded.
        if (status === 429) {
          const wait = retryDelayMs(e);

          if (isDailyQuota(e)) {
            // Daily limit: skip this model for a while, no pointless retries.
            const ms = clamp(wait || 30 * 60 * 1000, 60 * 1000, 30 * 60 * 1000);
            cooldown[entry.id] = Date.now() + ms;
            console.log(
              `[AI] ${entry.id}: daily quota used up, skipping it for ${Math.round(ms / 60000)} min`
            );
            break;
          }

          // Per-minute limit: short wait is fine, otherwise use next model.
          if (wait && wait <= 4000 && attempt < MAX_RETRIES) {
            console.log(`[AI] Rate limited, waiting ${wait}ms...`);
            await sleep(wait + 200);
            continue;
          }

          cooldown[entry.id] = Date.now() + clamp(wait || 15000, 5000, 60000);
          break;
        }

        // Retry temporary failures (and one retry for a bad format).
        const maxTries = e.invalid ? 1 : MAX_RETRIES;
        if (attempt < maxTries && (e.invalid || isRetryable(e))) {
          const delay = 800 * (attempt + 1);
          console.log(`[AI] Retrying in ${delay}ms...`);
          await sleep(delay);
          continue;
        }

        // Stop retrying this model; try the next one.
        break;
      }
    }
  }

  const finalError =
    lastError ||
    new Error(
      chain.length
        ? 'All AI models are in cooldown'
        : 'No AI provider available for this request'
    );
  if (lastRaw && !finalError.rawText) finalError.rawText = lastRaw;
  throw finalError;
}

// =====================================================
// JSON PARSER AND RESPONSE NORMALIZER
// =====================================================

function parseJSON(text) {
  const t = String(text || '')
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  try {
    return JSON.parse(t);
  } catch {}

  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');

  if (start >= 0 && end > start) {
    try {
      return JSON.parse(t.slice(start, end + 1));
    } catch {}
  }

  return null;
}

const ACT = [
  'none',
  'show_products',
  'start_order',
  'confirm_order',
  'cancel_order',
  'handover'
];

function norm(j) {
  j = j || {};

  return {
    reply: String(j.reply || '').trim(),
    action: ACT.includes(j.action) ? j.action : 'none',
    product_codes: Array.isArray(j.product_codes)
      ? j.product_codes.map(String)
      : [],
    handover_reason: String(j.handover_reason || ''),
    customer: j.customer || {},
    order_fields: j.order_fields || {},
    lead_interest: String(j.lead_interest || ''),
    intent: String(j.intent || 'other'),
    honorific: ['sir', 'madam'].includes(j.honorific)
      ? j.honorific
      : ''
  };
}

const inl = (buf, mime) => ({
  inlineData: {
    mimeType: String(mime || 'image/jpeg')
      .split(';')[0]
      .replace('video/mp4', 'audio/mp4'),
    data: buf.toString('base64')
  }
});

// =====================================================
// MAIN SALES AGENT PROMPT
// =====================================================

function systemPrompt(ctx) {
  const s = ctx.settings;

  return `You are the AI sales agent of the online shop "${s.businessName}", chatting with real customers on Messenger / Instagram / WhatsApp. Behave like a polite, warm, professional human salesman.

STYLE
- Reply in the customer's language. If they write Bangla in English letters (Banglish), reply in proper Bangla script. If they write English, reply in English.
- If the customer says Salam, answer "ওয়ালাইকুম আসসালাম".
- Customer honorific is "${ctx.customer.honorific || 'unknown'}". If "sir", use "স্যার"; if "madam", use "ম্যাম". If unknown, stay neutral unless obvious.
- Every reply must be neat: 2-6 short lines, at most 1-2 emojis.
- Be friendly and helpful. Never pressure the customer or lie.
- End with a clear friendly next step.

FACTS
- Use ONLY the catalog below for price, stock, size, colour and delivery. NEVER invent a price or product detail.
- If information is missing, say you will check and use action "handover".
- If a product or size is out of stock, say so politely and suggest in-stock alternatives.
- Delivery: inside Dhaka ${U.money(s.deliveryInside)}, outside Dhaka ${U.money(s.deliveryOutside)}, time ${s.deliveryDays}.
- Payment: cash on delivery.
- For complaints, refunds, exchanges, damaged items, special discounts or unknown issues, use action "handover".
- For parcel tracking, use the customer's ORDERS section.

OWNER'S RULES
${ctx.rules}

CATALOG (code | name | price | category | sizes & stock | description)
${ctx.catalogText || '(empty)'}

ACTIONS
- "show_products": customer wants to browse. Put up to 5 product codes in product_codes. If request is vague, ask one short clarifying question and use action "none".
- "start_order": customer clearly wants to buy a specific product. Put its code first in product_codes.
- "confirm_order": ONLY when an order draft is complete, its summary was shown, and the customer clearly confirms.
- "cancel_order": customer cancels the draft.
- "handover": a human must take over.
- "none": normal answer.
- While an order draft is active, extract provided size, name, phone, address and quantity into order_fields.
- Fill customer details whenever the customer provides them.
- Fill lead_interest when the customer shows buying interest.

OUTPUT: return ONLY one JSON object:
{"reply":"","action":"none","product_codes":[],"handover_reason":"","customer":{"name":"","phone":"","address":""},"order_fields":{"size":"","name":"","phone":"","address":"","qty":0},"lead_interest":"","intent":"greeting|browse|price|size|order|complaint|tracking|other","honorific":""}`;
}

function userBlock(ctx) {
  const c = ctx.customer || {};

  return `NOW: ${new Date().toLocaleString('en-GB')}
CUSTOMER: name=${c.name || '-'} phone=${c.phone || '-'} honorific=${c.honorific || '-'} platform=${ctx.platform || '-'}; past orders: ${ctx.stats || '-'}
ORDERS: ${ctx.ordersText || 'none'}
ORDER DRAFT: ${ctx.draftText || 'none'}
${ctx.imageMatch ? 'IMAGE SENT BY CUSTOMER: ' + ctx.imageMatch + '\n' : ''}
CONVERSATION SO FAR:
${ctx.history || '(first message)'}

CUSTOMER'S NEW MESSAGE: ${ctx.text || '(no text)'}`;
}

// =====================================================
// FALLBACK WHEN GEMINI IS UNAVAILABLE
// =====================================================

function fallback(ctx) {
  const text = String(ctx.text || '').toLowerCase();
  const products = Array.isArray(ctx.products) ? ctx.products : [];

  const words = text
    .split(/[^\p{L}\p{N}]+/u)
    .filter(word => word.length > 2);

  const hits = products.filter(p => {
    const searchText =
      `${p.name || ''} ${p.category || ''} ${p.keywords || ''} ${p.code || ''}`
        .toLowerCase();

    return words.some(word => searchText.includes(word));
  });

  if (/আসসালামু|assalam|salam|সালাম/.test(text)) {
    return norm({
      reply: 'ওয়ালাইকুম আসসালাম! 😊 কী ধরনের প্রোডাক্ট খুঁজছেন?'
    });
  }

  if (hits.length) {
    return norm({
      reply: 'আপনার জন্য কিছু প্রোডাক্ট পেয়েছি। দেখে নিন 👇',
      action: 'show_products',
      product_codes: hits.slice(0, 5).map(p => p.code),
      intent: 'browse',
      lead_interest: ctx.text
    });
  }

  if (ctx.imageMatch) {
    return norm({
      reply: 'ছবিটি পেয়েছি। আমাদের টিম দেখে আপনাকে জানাবে।',
      action: 'handover',
      handover_reason: 'Customer sent an image while AI was unavailable'
    });
  }

  if (/refund|return|ফেরত|অভিযোগ|complain|নষ্ট|damaged/.test(text)) {
    return norm({
      reply: 'আপনার সমস্যার জন্য দুঃখিত। আমাদের টিমের একজন আপনাকে সাহায্য করবেন।',
      action: 'handover',
      handover_reason: 'Customer complaint or return request'
    });
  }

  return norm({
    reply: 'দুঃখিত, একটু সমস্যা হচ্ছে। আমাদের টিম বিষয়টি দেখে আপনাকে সাহায্য করবে।',
    action: 'handover',
    handover_reason: 'Both Gemini models unavailable',
    intent: 'other'
  });
}

// =====================================================
// MAIN BRAIN
// =====================================================

// If the model's JSON was cut off, still rescue the "reply" text.
function salvageReply(raw) {
  const m = String(raw || '').match(/"reply"\s*:\s*"((?:[^"\\]|\\[\s\S])*)"/);
  if (!m) return '';

  try {
    return String(JSON.parse('"' + m[1].replace(/\r?\n/g, '\\n') + '"')).trim();
  } catch {
    return '';
  }
}

async function brain(ctx) {
  if (!hasAI()) {
    return fallback(ctx);
  }

  try {
    const text = await gem({
      system: systemPrompt(ctx),
      parts: [{ text: userBlock(ctx) }],
      json: true,
      temp: 0.6
    });

    const parsed = parseJSON(text);
    if (parsed) {
      return norm(parsed);
    }

    // Should not happen (gem() already validates), but stay safe.
    return {
      ...fallback(ctx),
      ai_failed: true
    };
  } catch (e) {
    console.error('[AI] brain failed:', errorMessage(e));

    // Model answered but the JSON was broken: keep its reply text.
    const saved = salvageReply(e && e.rawText);
    if (saved) {
      return norm({ reply: saved, action: 'none' });
    }

    // Keep the agent flow alive if the models fail.
    return {
      ...fallback(ctx),
      ai_failed: true
    };
  }
}

// =====================================================
// IMAGE DESCRIPTION
// =====================================================

async function describeImage(buf, mime) {
  if (!hasAI()) return { description: '' };

  try {
    const text = await gem({
      parts: [
        inl(buf, mime),
        {
          text: 'Describe this image for an online shop assistant in Bangla, maximum 2 sentences. Mention product type, colour and style. If a product code or text is visible, include it. Return JSON: {"description":"","visible_code":""}'
        }
      ],
      json: true,
      temp: 0.2
    });

    return parseJSON(text) || { description: '' };
  } catch (e) {
    console.error('[AI] describeImage failed:', errorMessage(e));
    return { description: '' };
  }
}

// =====================================================
// VOICE TRANSCRIPTION
// =====================================================

async function transcribe(buf, mime) {
  if (!hasAI()) return '';

  try {
    return (
      await gem({
        parts: [
          inl(buf, mime),
          {
            text: 'Transcribe this voice message exactly as spoken. Use Bangla script for Bangla speech and English for English speech. Output only the transcript.'
          }
        ],
        temp: 0
      })
    ).trim();
  } catch (e) {
    console.error('[AI] transcribe failed:', errorMessage(e));
    return '';
  }
}

// =====================================================
// CUSTOMER IMAGE TO CATALOG MATCHING
// =====================================================

async function matchImage(buf, mime, products) {
  if (!hasAI()) return null;

  const parts = [
    inl(buf, mime),
    {
      text: 'CUSTOMER IMAGE is above. Below are catalog products with their pictures.'
    }
  ];

  let count = 0;

  for (const p of products || []) {
    try {
      const imagePath =
        p.images?.[0] && p.images[0].startsWith('/uploads/')
          ? p.images[0]
          : null;

      const img = imagePath ? U.readUpload(imagePath) : null;

      if (!img || img.length > 600000 || count >= 12) continue;

      parts.push(
        { text: `Catalog product code=${p.code} name=${p.name}:` },
        inl(img, 'image/jpeg')
      );

      count++;
    } catch (e) {
      console.error('[AI] Could not load catalog image:', errorMessage(e));
    }
  }

  parts.push({
    text: 'Which catalog products look the same as the customer image? If a code is printed in the image, trust it first. Only include real matches, never guess. Return JSON: {"codes":["best match first"],"confidence":"high|medium|low","description":"short Bangla description"}'
  });

  try {
    const text = await gem({
      parts,
      json: true,
      temp: 0.1
    });

    return parseJSON(text);
  } catch (e) {
    console.error('[AI] matchImage failed:', errorMessage(e));
    return null;
  }
}

// =====================================================
// TEAM ASSISTANT
// =====================================================

async function assist(mode, { history, question, orders, customer }) {
  if (!hasAI()) {
    return '(AI key নেই, তাই সহকারী বন্ধ)';
  }

  const context =
    `CUSTOMER: ${customer || '-'}\n` +
    `ORDERS: ${orders || 'none'}\n` +
    `CONVERSATION:\n${history || 'none'}`;

  const tasks = {
    summary:
      'Summarize this customer relationship in Bangla in 4-6 short lines: who they are, what they wanted, orders, any problem, current status, and the best next action for our team.',

    ask:
      `Answer the team member's question about this customer in Bangla, using only the data above. Question: ${question || ''}`,

    draft:
      'Write the best next reply from our team to the customer, in the customer’s language, with a polite professional salesman tone. Plain text only, no quotes, no explanation.'
  };

  const task = tasks[mode];

  if (!task) {
    return 'অজানা assistant mode।';
  }

  try {
    return (
      await gem({
        parts: [{ text: `${context}\n\nTASK: ${task}` }],
        temp: 0.5
      })
    ).trim();
  } catch (e) {
    console.error('[AI] assist failed:', errorMessage(e));
    return 'AI সাময়িকভাবে কাজ করছে না। আবার চেষ্টা করুন।';
  }
}

// =====================================================
// SMALL TEXT GENERATION
// =====================================================

async function smallText(prompt, fallbackText) {
  if (!hasAI()) return fallbackText;

  try {
    return (
      await gem({
        parts: [{ text: prompt }],
        temp: 0.7
      })
    ).trim() || fallbackText;
  } catch (e) {
    console.error('[AI] smallText failed:', errorMessage(e));
    return fallbackText;
  }
}

// =====================================================
// SOCIAL MEDIA COMMENT PLAN
// =====================================================

async function commentPlan({ settings, commenter, comment, products }) {
  const safeProducts = Array.isArray(products) ? products : [];

  const fallbackPlan = {
    public_reply: `ধন্যবাদ ${commenter}! 😊 বিস্তারিত ইনবক্সে পাঠিয়েছি।`,

    dm:
      `আসসালামু আলাইকুম ${commenter}! আমাদের পোস্টে কমেন্ট করার জন্য ধন্যবাদ। ` +
      `${safeProducts.map(p =>
        `${p.name} - ${U.money(p.price)}`
      ).join(', ')}। অর্ডার বা প্রশ্ন থাকলে এখানেই লিখুন 😊`
  };

  if (!hasAI()) return fallbackPlan;

  try {
    const text = await gem({
      json: true,
      parts: [
        {
          text:
            `You are the social media agent of "${settings.businessName}". ` +
            `A customer named "${commenter}" commented on our post: "${comment}". ` +
            `Products on that post: ` +
            `${safeProducts.map(p =>
              `${p.name} (${U.money(p.price)}, ${O.stockText(p)})`
            ).join('; ') || 'unknown'}. ` +
            `Write in Bangla or the comment's language. ` +
            `"public_reply" = one short friendly line using their name that tells them you sent details to inbox. ` +
            `"dm" = a warm 3-4 line inbox message with product name and price, inviting them to reply here to order. ` +
            `Never invent facts. Return JSON: {"public_reply":"","dm":""}`
        }
      ]
    });

    const result = parseJSON(text);

    if (
      result &&
      typeof result.public_reply === 'string' &&
      typeof result.dm === 'string' &&
      result.public_reply.trim() &&
      result.dm.trim()
    ) {
      return result;
    }

    return fallbackPlan;
  } catch (e) {
    console.error('[AI] commentPlan failed:', errorMessage(e));
    return fallbackPlan;
  }
}

// =====================================================
// EXPORTS — KEEP THESE FOR routes/api.js
// =====================================================

module.exports = {
  hasAI,
  brain,
  describeImage,
  transcribe,
  matchImage,
  assist,
  smallText,
  commentPlan
};