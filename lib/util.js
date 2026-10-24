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

module.exports = { UP, id, saveUpload, readUpload, parseDataUrl, bn, money, normPhone, phoneOk, findPhone, sleep, day };
