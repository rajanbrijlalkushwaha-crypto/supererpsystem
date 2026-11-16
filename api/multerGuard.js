/* File uploads (multipart forms) are read by multer inside each route, after the login check has run.
 * This makes every multer upload check, once the form is read, that it does not name another company than the
 * signed-in one — the same rule requireLogin applies to the query and JSON body. Loaded once from server.js. */
const multer = require('multer');

const Multer = Object.getPrototypeOf(multer({ storage: multer.memoryStorage() }));
['single', 'array', 'fields', 'any', 'none'].forEach(name => {
  const orig = Multer[name];
  if (typeof orig !== 'function' || orig.__guarded) return;
  Multer[name] = function guarded(...args) {
    const mw = orig.apply(this, args);
    return (req, res, next) => mw(req, res, err => {
      if (err) return next(err);
      const s = req.authUser;
      const asked = req.body && req.body.companyId;
      if (s && s.companyId && asked && String(asked) !== String(s.companyId)) {
        return res.status(403).json({ error: 'This login is for another company. Sign out and sign in to that company.' });
      }
      return next();
    });
  };
  Multer[name].__guarded = true;
});
