/* Receipt entry — the fast voucher screen (see ../voucher/FastVoucher.jsx).
   The previous multi-card form is in git history. */
import FastVoucher from '../voucher/FastVoucher';

export default function CreateReceipt() {
  return <FastVoucher type="receipt" />;
}
