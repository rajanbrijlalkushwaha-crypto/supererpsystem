/* PDFs on the phone: make one from a printed page (on the ERP server) and open Android's share sheet
 * (WhatsApp, e-mail, Drive…). In a desktop browser (testing) the file is downloaded instead. */
import axios from 'axios';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

const toB64 = blob => new Promise((res, rej) => { const rd = new FileReader(); rd.onload = () => res(String(rd.result).split(',')[1] || ''); rd.onerror = rej; rd.readAsDataURL(blob); });
export const safeName = t => { const n = String(t || 'document').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 90) || 'document'; return /\.[a-z0-9]{2,5}$/i.test(n) ? n : `${n}.pdf`; };

export async function htmlToPdf(html) {
  const r = await axios.post('/api/print-merge', { htmls: [html] }, { responseType: 'blob' });
  return r.data;
}
export async function shareBlob(blob, name) {
  const file = safeName(name).replace(/\.pdf\.pdf$/i, '.pdf');
  if (!Capacitor.isNativePlatform()) {   // browser: download
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); return;
  }
  const path = `share/${file}`;
  await Filesystem.writeFile({ path, data: await toB64(blob), directory: Directory.Cache, recursive: true });
  const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
  try { await Share.share({ title: file, url: uri, dialogTitle: /\.pdf$/i.test(file) ? 'Share PDF' : 'Share file' }); }
  catch (e) { if (/cancel/i.test(String((e && e.message) || e))) return; throw e; }   // closed the share sheet: not an error
}
