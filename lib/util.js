const fs = require('fs'), path = require('path'), crypto = require('crypto'), axios = require('axios');
const UP = path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'uploads');
fs.mkdirSync(UP, { recursive: true });

const id = () => crypto.randomBytes(6).toString('hex');
const EXT = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'video/mp4': 'm4a', 'audio/aac': 'aac', 'audio/wav': 'wav', 'audio/webm': 'webm', 'video/mp4x': 'mp4', 'application/pdf': 'pdf', 'application/msword': 'doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx', 'application/vnd.ms-excel': 'xls', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx', 'text/plain': 'txt' };

// ---- Cloudinary (ঐচ্ছিক) — Render-এ ছবি যেন রিস্টার্টে মুছে না যায় ----
// CLOUDINARY_URL=cloudinary://API_KEY:API_SECRET@CLOUD_NAME  অথবা আলাদা তিনটি ভ্যারিয়েবল
function cloudCfg() {
  const m = /^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/.exec(String(process.env.CLOUDINARY_URL || '').trim());
  if (m) return { key: m[1], secret: m[2], cloud: m[3] };
  const { CLOUDINARY_CLOUD_NAME: cloud, CLOUDINARY_API_KEY: key, CLOUDINARY_API_SECRET: secret } = process.env;
  return cloud && key && secret ? { cloud: cloud.trim(), key: key.trim(), secret: secret.trim() } : null;
}
const cloudOn = () => !!cloudCfg();

async function cloudUpload(buf, mime, ext) {
  const c = cloudCfg(), base = String(mime || '').split(';')[0];
  const type = /^image\//.test(base) ? 'image' : /^(video|audio)\//.test(base) ? 'video' : 'raw';
  const publicId = crypto.randomBytes(10).toString('hex') + (type === 'raw' ? '.' + ext : '');
  const params = { folder: 'shop-agent', public_id: publicId, timestamp: Math.floor(Date.now() / 1000) };
  const toSign = Object.keys(params).sort().map(k => k + '=' + params[k]).join('&');
  const signature = crypto.createHash('sha1').update(toSign + c.secret).digest('hex');
  const form = new URLSearchParams({ ...params, api_key: c.key, signature, file: 'data:' + base + ';base64,' + buf.toString('base64') });
  const r = await axios.post(`https://api.cloudinary.com/v1_1/${c.cloud}/${type}/upload`, form.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 60000, maxBodyLength: Infinity, maxContentLength: Infinity,
  });
  return r.data.secure_url;
}

async function saveUpload(buf, mime) {
  const ext = EXT[String(mime || '').split(';')[0]] || 'bin';
  if (cloudOn()) {
    try { return await cloudUpload(buf, mime, ext); }
    catch (e) { console.error('Cloudinary আপলোড ব্যর্থ, লোকাল ডিস্কে রাখা হলো:', (e.response && e.response.data && e.response.data.error && e.response.data.error.message) || e.message); }
  }
  const name = crypto.randomBytes(10).toString('hex') + '.' + ext;
  fs.writeFileSync(path.join(UP, name), buf);
  return '/uploads/' + name;
}
async function readUpload(url) {
  try {
    if (/^https?:\/\//.test(url)) {
      // Cloudinary ছবি AI-তে পাঠানোর আগে ছোট JPG বানিয়ে নেয়
      const u = /res\.cloudinary\.com\/.+\/image\/upload\//.test(url) ? url.replace('/image/upload/', '/image/upload/f_jpg,w_800,q_auto/') : url;
      return Buffer.from((await axios.get(u, { responseType: 'arraybuffer', timeout: 15000 })).data);
    }
    return fs.readFileSync(path.join(UP, path.basename(url)));
  } catch { return null; }
}
function parseDataUrl(d) {
  const m = /^data:([^;]+);base64,(.+)$/.exec(d || '');
  return m ? { mime: m[1], buf: Buffer.from(m[2], 'base64') } : null;
}
const bn = s => String(s || '').replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d));
const money = n => '৳' + Number(n || 0).toLocaleString('en-US');
const normPhone = p => bn(p).replace(/[\s-]/g, '').replace(/^\+?88/, '');
const phoneOk = p => /^01[3-9]\d{8}$/.test(normPhone(p));
const findPhone = t => { const m = /(?:\+?88)?01[3-9][\s-]?\d{8}/.exec(bn(t)); return m ? normPhone(m[0]) : ''; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const day = ts => new Date(ts).toLocaleDateString('en-CA');

// "M, L, XL: 5" ভুল করে এক লাইনে লিখলেও আলাদা সাইজ বানায় (প্রতিটায় একই স্টক)
const splitVariants = list => {
  const out = [];
  for (const v of list || []) for (const part of String(v.label || '').split(/[,،;|]+/).map(x => x.trim()).filter(Boolean)) {
    const label = /^[a-z]{1,4}$/i.test(part) ? part.toUpperCase() : part;
    if (!out.some(o => o.label === label)) out.push({ label, stock: Math.max(0, +v.stock || 0) });
  }
  return out;
};
const fileKind = m => /^image\//.test(m) ? 'image' : /^video\//.test(m) ? 'video' : /^audio\//.test(m) ? 'audio' : 'file';
const ALLOWED = /^(image\/(jpeg|png|webp|gif)|video\/mp4|application\/pdf|audio\/(mpeg|mp4|ogg|wav|aac)|application\/(msword|vnd\.ms-excel|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet))|text\/plain)$/;

module.exports = { splitVariants, fileKind, ALLOWED, UP, cloudOn, id, saveUpload, readUpload, parseDataUrl, bn, money, normPhone, phoneOk, findPhone, sleep, day };
