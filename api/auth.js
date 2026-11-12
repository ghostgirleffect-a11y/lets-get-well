// Admin auth: first-run setup, login, logout, me, change-password.
// Single owner account (Cathy). Sessions stored hashed in the doc.
const store = require('./_store');
const lib = require('./_lib');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return lib.send(res, 405, { ok: false, error: 'Method not allowed' });
    const b = await lib.body(req);
    const action = lib.str(b.action, 30);

    if (action === 'status') {
      const doc = await store.read();
      const s = lib.sessionUser(doc, req);
      return lib.send(res, 200, { ok: true, setupDone: !!doc.admin, signedIn: !!s });
    }

    if (action === 'setup') {
      const password = String(b.password || '');
      if (password.length < 10) return lib.send(res, 400, { ok: false, error: 'Use a password of at least 10 characters.' });
      const out = await store.mutate((doc) => {
        if (doc.admin) return { err: 'Setup is already complete. Sign in instead.' };
        doc.admin = lib.newCredentials(password);
        lib.log(doc, 'auth', 'Admin account created (first-run setup).');
        return { ok: true };
      });
      if (out.err) return lib.send(res, 409, { ok: false, error: out.err });
      return await login(res, password);
    }

    if (action === 'login') {
      const password = String(b.password || '');
      const doc = await store.read();
      if (!doc.admin) return lib.send(res, 400, { ok: false, error: 'Setup has not been completed yet.' });
      if (!lib.checkPassword(password, doc.admin)) return lib.send(res, 401, { ok: false, error: 'That password is not right.' });
      return await login(res, password, true);
    }

    if (action === 'logout') {
      const token = lib.cookieOf(req);
      if (token) await store.mutate((doc) => { delete doc.sessions[lib.sha(token)]; });
      lib.clearSessionCookie(res);
      return lib.send(res, 200, { ok: true });
    }

    if (action === 'change-password') {
      const doc0 = await store.read();
      if (!lib.sessionUser(doc0, req)) return lib.send(res, 401, { ok: false, error: 'Sign in first.' });
      const current = String(b.current || '');
      const next = String(b.next || '');
      if (!lib.checkPassword(current, doc0.admin)) return lib.send(res, 403, { ok: false, error: 'Your current password is not right.' });
      if (next.length < 10) return lib.send(res, 400, { ok: false, error: 'Use a new password of at least 10 characters.' });
      await store.mutate((doc) => {
        doc.admin = lib.newCredentials(next);
        lib.log(doc, 'auth', 'Admin password changed.');
      });
      return lib.send(res, 200, { ok: true });
    }

    return lib.send(res, 400, { ok: false, error: 'Unknown action' });
  } catch (e) {
    return lib.send(res, 500, { ok: false, error: 'Something went wrong on our side.' });
  }
};

async function login(res, password, logIt) {
  const token = require('crypto').randomBytes(32).toString('hex');
  await store.mutate((doc) => {
    doc.sessions[lib.sha(token)] = { createdAt: Date.now(), expiresAt: Date.now() + 7 * 24 * 3600 * 1000 };
    const now = Date.now();
    for (const k of Object.keys(doc.sessions)) if (doc.sessions[k].expiresAt < now) delete doc.sessions[k];
    if (logIt) lib.log(doc, 'auth', 'Admin signed in.');
  });
  lib.setSessionCookie(res, token);
  return lib.send(res, 200, { ok: true });
}
