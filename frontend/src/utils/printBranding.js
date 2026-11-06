/* printBranding.js — the one line every printed document (statements,
 * ledgers, Sales Order, Purchase Order, Delivery Challan, ...) shows next
 * to the company header: who generated the software, and which logged-in
 * user printed this particular copy. `user` is the AuthContext user object
 * ({ id, username, name }) — pass it from useAuth() at the call site, since
 * plain print utils (outside React) can't reach context themselves.
 */
export const brandLine = (user) => {
  const who = user ? (user.name || user.username || '') : '';
  const uid = user?.username || user?.id || '';
  const whoPart = who ? `User: ${who}${uid && uid !== who ? ` (${uid})` : ''}` : '';
  return `Printed by Super ERP System — Epsilon Group${whoPart ? ' &nbsp;|&nbsp; ' + whoPart : ''}`;
};
