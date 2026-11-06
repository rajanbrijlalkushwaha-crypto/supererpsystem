/* liveContact.js — a Sales Order stores a copy of the client's contact (name,
 * mobile, email) when it is created, so later edits on the client never reach it.
 * These helpers refresh that copy from the client record at display / print time:
 *   - the order's contact is matched to one of the client's contact persons by
 *     name or mobile, and that person's current details are used;
 *   - if the order holds only a placeholder ("", ".", "9000000000" …) the client's
 *     first real contact is used;
 *   - otherwise the order's own saved values are kept.
 */
const norm   = v => String(v ?? '').trim();
const digits = v => norm(v).replace(/\D/g, '').slice(-10);
export const isPlaceholder = v => {
  const t = norm(v);
  return !t || /^[.\-_\s]+$/.test(t) || /^0+$/.test(t.replace(/\D/g, '')) || /^90{9}$/.test(t.replace(/\D/g, ''));
};

const pick = (name, mobile, list) => {
  const people = (list || []).filter(Boolean);
  const real = people.filter(p => !isPlaceholder(p.name) || !isPlaceholder(p.mobileNumber));
  const byName = !isPlaceholder(name) && people.find(p => norm(p.name).toLowerCase() === norm(name).toLowerCase());
  const byMob  = !isPlaceholder(mobile) && digits(mobile) && people.find(p => digits(p.mobileNumber) === digits(mobile));
  if (byName || byMob) return byName || byMob;
  if (isPlaceholder(name) && isPlaceholder(mobile)) return real[0] || null;
  return null;
};

/* keep the saved value unless the client has a real (non-placeholder) one */
const prefer = (live, saved) => (isPlaceholder(live) ? saved : live);

/** Returns a copy of the order with billing + shipping contact refreshed from `client`. */
export function withLiveContacts(order, client) {
  const list = client?.contactPersons || [];
  if (!order || !list.length) return order;
  const out = { ...order };

  const bill = pick(order.contactPerson, order.mobile, list);
  if (bill) {
    out.contactPerson   = prefer(bill.name,         order.contactPerson);
    out.mobile          = prefer(bill.mobileNumber, order.mobile);
    out.email           = prefer(bill.email,        order.email);
    out.alternateMobile = prefer(bill.altMobile,    order.alternateMobile || order.alternateNo);
  }
  const ship = pick(order.shipToContact, order.shipToMobile, list);
  if (ship) {
    out.shipToContact   = prefer(ship.name,         order.shipToContact);
    out.shipToMobile    = prefer(ship.mobileNumber, order.shipToMobile);
    out.shipToEmail     = prefer(ship.email,        order.shipToEmail);
    out.shipToAlternate = prefer(ship.altMobile,    order.shipToAlternate);
  }
  return out;
}
