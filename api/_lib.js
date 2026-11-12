// Shared helpers for the Let's Get Well admin API. Zero deps.
const crypto = require('crypto');

function send(res, code, obj) {
  res.statusCode = code;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(obj));
}
async function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = '';
  for await (const chunk of req) raw += chunk;
  if (!raw) return {};
  try { return JSON.parse(raw); } catch (e) { return {}; }
}
function str(v, max) {
  return String(v == null ? '' : v).slice(0, max || 300).trim();
}
function id() { return Date.now().toString(36) + crypto.randomBytes(4).toString('hex'); }
function sha(s) { return crypto.createHash('sha256').update(s).digest('hex'); }

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString('hex');
}
function newCredentials(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return { salt, passHash: hashPassword(password, salt), createdAt: new Date().toISOString() };
}
function checkPassword(password, admin) {
  if (!admin) return false;
  const h = Buffer.from(hashPassword(password, admin.salt), 'hex');
  const stored = Buffer.from(admin.passHash, 'hex');
  return h.length === stored.length && crypto.timingSafeEqual(h, stored);
}

const COOKIE = 'lgw_admin';
function cookieOf(req) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === COOKIE) return decodeURIComponent(rest.join('='));
  }
  return '';
}
function setSessionCookie(res, token) {
  const maxAge = 7 * 24 * 3600;
  res.setHeader('set-cookie', `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`);
}
function clearSessionCookie(res) {
  res.setHeader('set-cookie', `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}
function sessionUser(doc, req) {
  const token = cookieOf(req);
  if (!token) return null;
  const s = doc.sessions[sha(token)];
  if (!s) return null;
  if (s.expiresAt < Date.now()) return null;
  return s;
}
function log(doc, kind, text) {
  doc.activity.unshift({ id: id(), at: new Date().toISOString(), kind, text });
  if (doc.activity.length > 200) doc.activity.length = 200;
}
function publicSettings(doc) {
  return Object.assign({}, doc.settings);
}
const SETTING_FIELDS = ['name', 'phone', 'email', 'web', 'purple', 'pink', 'hours'];
const SETTING_NUMBERS = ['travelFee', 'drawFee', 'surchargeLow', 'surchargeHigh', 'cancelFee'];
function sanitizeSettings(input, current) {
  const out = Object.assign({}, current);
  for (const k of SETTING_FIELDS) if (input[k] !== undefined) out[k] = str(input[k], 120);
  for (const k of SETTING_NUMBERS) if (input[k] !== undefined) {
    const n = Number(input[k]);
    if (Number.isFinite(n) && n >= 0 && n <= 100000) out[k] = n;
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(out.purple)) out.purple = '#69439d';
  if (!/^#[0-9a-fA-F]{6}$/.test(out.pink)) out.pink = '#ec3b96';
  return out;
}
module.exports = { send, body, str, id, sha, newCredentials, checkPassword, cookieOf, setSessionCookie, clearSessionCookie, sessionUser, log, publicSettings, sanitizeSettings };
