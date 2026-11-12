// Let's Get Well admin data store: one JSON document in one private Vercel Blob
// (lets-get-well-db.json) via the Blob REST API with plain fetch. Zero deps.
// Local fallback: LGW_DATA_FILE env or a tmp file (dev only).
// Concurrency: last-write-wins v1 (single-owner site, low traffic).
const fs = require('fs');
const os = require('os');
const path = require('path');
const BLOB_NAME = 'lets-get-well-db.json';
let cache = null;
const CACHE_MS = 1500;

function defaultSettings() {
  return {
    name: "Let's Get Well LLC",
    phone: '314-267-8759',
    email: '',
    web: 'lets-get-well.com',
    purple: '#69439d',
    pink: '#ec3b96',
    travelFee: 50,
    drawFee: 60,
    surchargeLow: 35,
    surchargeHigh: 75,
    cancelFee: 40,
    hours: 'Mon–Fri · 6:00 AM–2:00 PM Central',
  };
}
function defaultDoc() {
  return {
    admin: null,      // {salt, passHash, createdAt} — set on first-run setup
    sessions: {},     // sha256(token) -> {createdAt, expiresAt}
    bookings: [],     // callback requests saved from the public form
    settings: defaultSettings(),
    activity: [],     // {id, at, kind, text} newest first, capped
  };
}
function localFile() {
  return process.env.LGW_DATA_FILE || path.join(os.tmpdir(), 'lets-get-well-data.json');
}
const API = 'https://blob.vercel-storage.com';
function apiHeaders(token, extra) {
  return Object.assign({ authorization: 'Bearer ' + token, 'x-api-version': '10' }, extra || {});
}
async function readBlob(token) {
  const listRes = await fetch(API + '/?prefix=' + encodeURIComponent(BLOB_NAME) + '&cb=' + Date.now(), { headers: apiHeaders(token, { 'cache-control': 'no-cache' }), cache: 'no-store' });
  if (!listRes.ok) throw new Error('Blob list failed: ' + listRes.status);
  const list = await listRes.json();
  const blob = (list.blobs || []).find((b) => b.pathname === BLOB_NAME);
  if (!blob) return null;
  const base = blob.downloadUrl || blob.url;
  const url = base + (base.includes('?') ? '&' : '?') + 'cb=' + Date.now();
  const res = await fetch(url, { headers: apiHeaders(token, { 'cache-control': 'no-cache' }), cache: 'no-store' });
  if (!res.ok) throw new Error('Blob read failed: ' + res.status);
  return await res.json();
}
async function writeBlob(token, doc) {
  const res = await fetch(API + '/?pathname=' + encodeURIComponent(BLOB_NAME), {
    method: 'PUT',
    headers: apiHeaders(token, { 'x-content-type': 'application/json', 'x-add-random-suffix': '0', 'x-allow-overwrite': '1', 'x-vercel-blob-access': 'private' }),
    body: JSON.stringify(doc),
  });
  if (!res.ok) throw new Error('Blob write failed: ' + res.status);
}
async function read() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.doc;
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  let doc = null;
  if (token) { doc = await readBlob(token); }
  else { try { doc = JSON.parse(fs.readFileSync(localFile(), 'utf8')); } catch (e) { doc = null; } }
  if (!doc || typeof doc !== 'object') doc = defaultDoc();
  const fresh = defaultDoc();
  for (const k of Object.keys(fresh)) if (doc[k] === undefined) doc[k] = fresh[k];
  if (!doc.settings || typeof doc.settings !== 'object') doc.settings = defaultSettings();
  const ds = defaultSettings();
  for (const k of Object.keys(ds)) if (doc.settings[k] === undefined) doc.settings[k] = ds[k];
  cache = { doc, at: Date.now() };
  return doc;
}
async function write(doc) {
  cache = { doc, at: Date.now() };
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (token) { await writeBlob(token, doc); }
  else { fs.writeFileSync(localFile(), JSON.stringify(doc)); }
}
async function mutate(fn) { cache = null; const doc = await read(); const out = fn(doc); await write(doc); return out; }
module.exports = { read, write, mutate, defaultDoc, defaultSettings, BLOB_NAME };
