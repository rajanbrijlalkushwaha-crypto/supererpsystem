import axios from 'axios';

/* A sales order keeps a copy of the client's details from the day it was saved. For printing and viewing,
   the latest details from the client master are used instead, so an edit there shows up on the order and its PIs.
   - Values come from the master only when the master has them (a blank in the master never wipes the order's value).
   - Ship-to follows the master only when it was the same as bill-to (a separate delivery address is kept).
   - The order file itself is not changed. Tax invoices are not built from this: they keep what was billed. */
const s = v => String(v ?? '').trim();

/* only the client fields to lay over the order ({} when the client is not found) */
export async function latestClientPatch(order, companyId) {
  const id = s(order?.customerCode || order?.clientId);
  if (!order || !id || !companyId) return {};
  let c;
  try { c = (await axios.get(`/api/clients/${encodeURIComponent(id)}`, { params: { companyId } })).data; } catch { return {}; }
  if (!c || String(c.clientId ?? c.id ?? '') !== id) return {};

  const pick = (fromMaster, old) => s(fromMaster) || old;
  const cp = Array.isArray(c.contactPersons) ? c.contactPersons.find(p => p && s(p.name)) : null;
  const bill = {
    customerName: pick(c.companyName || c.clientName, order.customerName),
    address: pick(c.address || c.billingAddr, order.address),
    customerCity: pick(c.city, order.customerCity),
    customerPincode: pick(c.pincode, order.customerPincode),
    customerState: pick(c.state, order.customerState),
    customerGstin: pick(c.gstin || c.gst, order.customerGstin),
    contactPerson: s(order.contactPerson) || s(cp?.name) || s(c.contactPerson),
    mobile: s(order.mobile) || s(cp?.mobileNumber) || s(c.mobile),
    email: s(order.email) || s(cp?.email) || s(c.email),
  };

  const shipSame = !s(order.shipToAddress)
    || (s(order.shipToAddress) === s(order.address) && s(order.shipToCity) === s(order.customerCity));
  const ship = shipSame ? {
    shipToName: !s(order.shipToName) || s(order.shipToName) === s(order.customerName) ? bill.customerName : order.shipToName,
    shipToAddress: s(c.shippingAddr) || bill.address,
    shipToCity: bill.customerCity,
    shipToState: bill.customerState,
    shipToPincode: bill.customerPincode,
  } : {};

  return { ...bill, ...ship };
}

export async function withLatestClient(order, companyId) {
  return order ? { ...order, ...(await latestClientPatch(order, companyId)) } : order;
}
