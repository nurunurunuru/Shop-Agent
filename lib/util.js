const fs = require('fs'), path = require('path'), crypto = require('crypto');
const UP = path.join(__dirname, '..', 'data', 'uploads');
fs.mkdirSync(UP, { recursive: true });

const id = () => crypto.randomBytes(6).toString('hex');
const EXT = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'video/mp4': 'm4a', 'audio/aac': 'aac', 'audio/wav': 'wav', 'audio/webm': 'webm' };

function saveUpload(buf, mime) {
  const ext = EXT[String(mime || '').split(';')[0]] || 'bin';
  const name = crypto.randomBytes(10).toString('hex') + '.' + ext;
  fs.writeFileSync(path.join(UP, name), buf);
  return '/uploads/' + name;
}
// প্রোডাক্টের ছবি: Cloudinary সেট থাকলে সেখানে (স্থায়ী), না থাকলে লোকাল data/uploads-এ।
const cloudOn = () => !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
async function uploadImage(buf, mime) {
  if (!cloudOn()) return saveUpload(buf, mime);
  const ts = Math.floor(Date.now() / 1000), folder = process.env.CLOUDINARY_FOLDER || 'shop-agent';
  const sig = crypto.createHash('sha1').update(`folder=${folder}&timestamp=${ts}${process.env.CLOUDINARY_API_SECRET}`).digest('hex');
  const fd = new FormData();
  fd.append('file', new Blob([buf], { type: mime }), 'image');
  fd.append('api_key', process.env.CLOUDINARY_API_KEY); fd.append('timestamp', String(ts)); fd.append('folder', folder); fd.append('signature', sig);
  const r = await fetch(`https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload`, { method: 'POST', body: fd });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.secure_url) throw new Error('Cloudinary আপলোড হয়নি: ' + ((j.error && j.error.message) || r.status));
  return j.secure_url;
}
function readUpload(url) { try { return fs.readFileSync(path.join(UP, path.basename(url))); } catch { return null; } }
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

module.exports = { UP, id, saveUpload, uploadImage, cloudOn, readUpload, parseDataUrl, bn, money, normPhone, phoneOk, findPhone, sleep, day };
