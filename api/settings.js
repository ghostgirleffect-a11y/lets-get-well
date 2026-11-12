// Site settings: public GET (the website reads its phone, prices, colors from
// here), admin PUT (edits made in the admin go live on the public site).
const store = require('./_store');
const lib = require('./_lib');

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      const doc = await store.read();
      return lib.send(res, 200, { ok: true, settings: lib.publicSettings(doc) });
    }
    if (req.method === 'PUT') {
      const doc0 = await store.read();
      if (!lib.sessionUser(doc0, req)) return lib.send(res, 401, { ok: false, error: 'Sign in first.' });
      const b = await lib.body(req);
      const out = await store.mutate((doc) => {
        const before = JSON.stringify(doc.settings);
        doc.settings = lib.sanitizeSettings(b, doc.settings);
        if (JSON.stringify(doc.settings) !== before) lib.log(doc, 'settings', 'Site settings updated.');
        return { ok: true, settings: doc.settings };
      });
      return lib.send(res, 200, out);
    }
    return lib.send(res, 405, { ok: false, error: 'Method not allowed' });
  } catch (e) {
    return lib.send(res, 500, { ok: false, error: 'Something went wrong on our side.' });
  }
};
