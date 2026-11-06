/* small helpers shared by the HR tabs */
import axios from 'axios';

/* open a stored file (CV, document) in a new tab — fetched with the user's login */
export async function openFile(kind, id, file, cid) {
  const w = window.open('', '_blank');
  try {
    const r = await axios.get(`/api/hr/${kind}/${id}/file/${encodeURIComponent(file.fileName)}`, { params: { companyId: cid }, responseType: 'blob' });
    const url = URL.createObjectURL(new Blob([r.data], { type: r.headers['content-type'] || 'application/octet-stream' }));
    if (w) w.location.href = url; else window.open(url, '_blank');
  } catch (e) { if (w) w.close(); alert(`Could not open ${file.name || file.fileName}: ${e.response?.status === 404 ? 'file not found' : e.message}`); }
}

/* a record + new files as multipart form data (JSON-encodes objects / arrays) */
export function toForm(obj, files = [], names = []) {
  const fd = new FormData();
  Object.entries(obj).forEach(([k, v]) => { if (v === undefined || v === null) return; fd.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v)); });
  files.forEach(f => fd.append('files', f));
  if (names.length) fd.append('fileNames', JSON.stringify(names));
  return fd;
}

export const CAND_STATUS = ['New', 'Shortlisted', 'Interview', 'Selected', 'On hold', 'Rejected', 'Joined'];
export const STATUS_COLOR = {
  New: ['#EFF8FF', '#175CD3'], Shortlisted: ['#F4F3FF', '#5925DC'], Interview: ['#FFFAEB', '#B54708'], Selected: ['#ECFDF3', '#067647'],
  'On hold': ['#F2F4F7', '#475467'], Rejected: ['#FEF3F2', '#B42318'], Joined: ['#ECFDF3', '#05603A'],
  Active: ['#ECFDF3', '#067647'], 'On notice': ['#FFFAEB', '#B54708'], Left: ['#F2F4F7', '#475467'], Inactive: ['#F2F4F7', '#475467'],
};
export const DEPARTMENTS = ['Projects', 'Production', 'Sales', 'Purchase', 'Accounts', 'Admin', 'HR', 'Design', 'Site', 'Store', 'Logistics'];
