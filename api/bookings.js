// Bookings: public create (from the site form), admin list / update / delete.
const store = require('./_store');
const lib = require('./_lib');

const STATUSES = ['New', 'Called', 'Booked', 'Done'];

module.exports = async (req, res) => {
  try {
    if (req.method === 'POST') {
      const b = await lib.body(req);
      // Honeypot: real visitors never fill this hidden field.
      if (b.company) return lib.send(res, 200, { ok: true });
      const bk = {
        name: lib.str(b.name, 120),
        phone: lib.str(b.phone, 40),
        email: lib.str(b.email, 160),
        zip: lib.str(b.zip, 10),
        type: lib.str(b.type, 60),
        date: lib.str(b.date, 20),
        order: lib.str(b.order, 60),
        notes: lib.str(b.notes, 1000),
      };
      if (!bk.name || !bk.phone || !bk.email || !bk.zip || !bk.date) {
        return lib.send(res, 400, { ok: false, error: 'Please fill in your name, phone, email, ZIP code, and preferred date.' });
      }
      if (!/^[0-9]{5}$/.test(bk.zip)) return lib.send(res, 400, { ok: false, error: 'Please enter a 5-digit ZIP code.' });
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(bk.email)) return lib.send(res, 400, { ok: false, error: 'Please enter a valid email address.' });
      const saved = await store.mutate((doc) => {
        const rec = Object.assign({ id: lib.id(), createdAt: new Date().toISOString(), status: 'New', adminNote: '' }, bk);
        doc.bookings.unshift(rec);
        lib.log(doc, 'booking', `New callback request from ${rec.name} (${rec.type}, preferred ${rec.date}).`);
        return rec;
      });
      return lib.send(res, 200, { ok: true, id: saved.id });
    }

    // Everything below is admin-only.
    const doc = await store.read();
    if (!lib.sessionUser(doc, req)) return lib.send(res, 401, { ok: false, error: 'Sign in first.' });

    if (req.method === 'GET') {
      return lib.send(res, 200, { ok: true, bookings: doc.bookings });
    }
    if (req.method === 'PATCH') {
      const b = await lib.body(req);
      const targetId = lib.str(b.id, 40);
      const out = await store.mutate((d) => {
        const rec = d.bookings.find((x) => x.id === targetId);
        if (!rec) return { err: 'That request could not be found.' };
        const changes = [];
        if (b.status !== undefined && STATUSES.includes(b.status) && b.status !== rec.status) {
          changes.push(`status ${rec.status} → ${b.status}`);
          rec.status = b.status;
        }
        if (b.adminNote !== undefined) {
          const note = lib.str(b.adminNote, 1000);
          if (note !== rec.adminNote) { rec.adminNote = note; changes.push('note updated'); }
        }
        if (changes.length) lib.log(d, 'status', `${rec.name}: ${changes.join(', ')}.`);
        return { ok: true, booking: rec };
      });
      if (out.err) return lib.send(res, 404, { ok: false, error: out.err });
      return lib.send(res, 200, out);
    }
    if (req.method === 'DELETE') {
      const b = await lib.body(req);
      const targetId = lib.str(b.id, 40);
      const out = await store.mutate((d) => {
        const i = d.bookings.findIndex((x) => x.id === targetId);
        if (i < 0) return { err: 'That request could not be found.' };
        const [rec] = d.bookings.splice(i, 1);
        lib.log(d, 'status', `Deleted callback request from ${rec.name}.`);
        return { ok: true };
      });
      if (out.err) return lib.send(res, 404, { ok: false, error: out.err });
      return lib.send(res, 200, out);
    }
    return lib.send(res, 405, { ok: false, error: 'Method not allowed' });
  } catch (e) {
    return lib.send(res, 500, { ok: false, error: 'Something went wrong on our side.' });
  }
};
