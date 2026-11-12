// Activity view: admin-only feed of what happened (bookings, status changes,
// settings edits, sign-ins), plus simple counts.
const store = require('./_store');
const lib = require('./_lib');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'GET') return lib.send(res, 405, { ok: false, error: 'Method not allowed' });
    const doc = await store.read();
    if (!lib.sessionUser(doc, req)) return lib.send(res, 401, { ok: false, error: 'Sign in first.' });
    const counts = { total: doc.bookings.length, New: 0, Called: 0, Booked: 0, Done: 0 };
    for (const b of doc.bookings) if (counts[b.status] !== undefined) counts[b.status]++;
    return lib.send(res, 200, { ok: true, activity: doc.activity.slice(0, 100), counts });
  } catch (e) {
    return lib.send(res, 500, { ok: false, error: 'Something went wrong on our side.' });
  }
};
