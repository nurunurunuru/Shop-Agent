
const axios = require('axios');
const U = require('./util');
const O = require('./orders');

// =====================================================
// GEMINI CONFIG
// Primary: gemini-3.6-flash
// Backup:  gemini-3.5-flash-lite
// =====================================================

const key = () => process.env.GEMINI_API_KEY;

const model = () =>
  process.env.GEMINI_MODEL || 'gemini-3.6-flash';

const fallbackModel = () =>
  process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash-lite';

const base = () =>
  (process.env.GEMINI_BASE ||
    'https://generativelanguage.googleapis.com').replace(/\/+$/, '');

const hasAI = () => Boolean(key());

// Retry settings
const MAX_RETRIES = 2;
const REQUEST_TIMEOUT = 30000;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const cooldown = {}; // daily quota shesh hole model ke kichukkhon bad rakhbe

function errorMessage(e) {
  return (
    e?.response?.data?.error?.message ||
    e?.message ||
    'Unknown Gemini error'
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

// =====================================================
// GEMINI REQUEST WITH AUTOMATIC FAILOVER
// =====================================================

async function requestModel(modelName, options) {
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
    `${base()}/v1beta/models/${modelName}:generateContent`,
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

async function gem(options) {
  if (!hasAI()) {
    throw new Error('GEMINI_API_KEY is missing');
  }

  // Primary model first, backup model second.
  const models = [...new Set([model(), fallbackModel()])];
  let lastError;

  for (const modelName of models) {

        if ((cooldown[modelName] || 0) > Date.now()) continue;
        
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(
          `[AI] Trying ${modelName} (${attempt + 1}/${MAX_RETRIES + 1})`
        );

        const response = await requestModel(modelName, options);
        const data = response.data;

        const candidate = data?.candidates?.[0];
        const text = (candidate?.content?.parts || [])
          .map(part => part.text || '')
          .join('')
          .trim();

        if (text) {
          console.log(`[AI] Success: ${modelName}`);
          return text;
        }

        // Empty response can happen if the model blocks a response.
        const reason = candidate?.finishReason || 'EMPTY_RESPONSE';
        throw new Error(`Gemini returned no text (${reason})`);
      } catch (e) {
        lastError = e;

        const status = statusCode(e);
        console.error(
          `[AI] ${modelName} failed; status=${status || 'network'};`,
          errorMessage(e)
        );

        // Bad API key, permission or invalid request:
        // retrying the same request usually won't fix it.
        if (status === 400 || status === 401 || status === 403) {
          // Try the backup model for a model-specific bad request.
          // For authentication/permission failures, another model
          // usually will not help, so stop early.
          if (status === 401 || status === 403) {
            throw e;
          }
          break;
        }

        // Model name unavailable: move to the next model.
        if (status === 404) {
          break;
        }

        // Retry temporary failures before switching models.
        if (attempt < MAX_RETRIES && isRetryable(e)) {
          const delay = 800 * (attempt + 1);
          console.log(`[AI] Retrying in ${delay}ms...`);
          await sleep(delay);
          continue;
        }

        // Stop retrying this model; try the backup.
        break;
      }
    }
  }

  throw lastError || new Error('All Gemini models failed');
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

    console.error('[AI] Could not parse the model response');
    return norm({
      reply: 'আপনাকে সাহায্য করতে চাই। একটু বিস্তারিত বলবেন?',
      action: 'none'
    });
  } catch (e) {
    console.error('[AI] Both models failed:', errorMessage(e));

    // Keep the agent flow alive if both models fail.
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
