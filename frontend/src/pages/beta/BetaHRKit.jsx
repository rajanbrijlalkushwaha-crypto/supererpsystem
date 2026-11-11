/* Shared bits for the Beta HR pages (Employees, Assets, Attendance, Payroll, HR Policy) — /api/hr. */
import axios from 'axios';
import { can } from '../../utils/permissions';
import { openPreview } from './printKit';

/* HR permission. Until an admin sets it for a user (User Management → HR & Payroll), the accounts people
   (Expense rights) have it — the same people who had the classic HR page. */
export const hrCan = (user, action) => {
  if (!user) return false;
  if (user.role === 'admin' || user.permissions == null || user.permissions.hr) return can(user, 'hr', action);
  return can(user, 'accExpense', action === 'delete' ? 'edit' : action);
};

export const EMP_STATUS = ['Active', 'On notice', 'Left'];
export const DEPARTMENTS = ['Projects', 'Production', 'Sales', 'Purchase', 'Accounts', 'Admin', 'HR', 'Design', 'Site', 'Store', 'Logistics'];
export const STATUS_PILL = { Active: ['#ECFDF3', '#067647'], 'On notice': ['#FFFAEB', '#B54708'], Left: ['#F2F4F7', '#475467'], Inactive: ['#F2F4F7', '#475467'],
  issued: ['#EFF8FF', '#175CD3'], returned: ['#ECFDF3', '#067647'], lost: ['#FEF3F2', '#B42318'], damaged: ['#FFFAEB', '#B54708'] };
/* the salary structure that applies in a month (yyyy-mm) — the same rule as the server: the newest revision effective on or
   before the month; before the first revision, that revision's 'from'; without revisions, the employee's salary */
export const salaryFor = (emp, month) => {
  const h = (emp?.salaryHistory || []).slice().sort((a, b) => String(a.effectiveFrom).localeCompare(String(b.effectiveFrom)));
  if (!h.length) return emp?.salary || {};
  let cur = h[0].from || emp.salary || {};
  h.forEach(r => { if (String(r.effectiveFrom) <= String(month)) cur = r.to; });
  return cur || {};
};
export const grossOf = s => ['basic', 'hra', 'conveyance', 'special', 'other'].reduce((t, k) => t + (Number(s?.[k]) || 0), 0);
export const thisMonth = () => new Date().toISOString().slice(0, 7);
export const daysIn = m => { const [y, mo] = String(m).split('-').map(Number); return new Date(y, mo, 0).getDate(); };
export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const dowOf = (m, d) => { const [y, mo] = String(m).split('-').map(Number); return new Date(y, mo - 1, d).getDay(); };
/* on the rolls in a month: joined by its end, not left before its start */
export const onRolls = (e, m) => { const end = `${m}-${String(daysIn(m)).padStart(2, '0')}`, start = `${m}-01`; return (!e.joiningDate || e.joiningDate <= end) && (!e.leavingDate || e.leavingDate >= start) && e.status !== 'Inactive'; };

/* attendance marks: what each counts as for paid days */
export const MARKS = [['P', 'Present', 1, '#ECFDF3', '#067647'], ['A', 'Absent', 0, '#FEF3F2', '#B42318'], ['HD', 'Half day', 0.5, '#FFFAEB', '#B54708'],
  ['L', 'Paid leave', 1, '#EFF8FF', '#175CD3'], ['LWP', 'Leave without pay', 0, '#FDF2FA', '#C11574'], ['WO', 'Weekly off', 1, '#F2F4F7', '#475467'], ['H', 'Holiday', 1, '#F4F3FF', '#5925DC']];
export const markOf = k => MARKS.find(m => m[0] === k);
export const tally = (row, days) => {
  const t = { P: 0, A: 0, HD: 0, L: 0, LWP: 0, WO: 0, H: 0, blank: 0, paid: 0 };
  for (let d = 1; d <= days; d++) { const k = row && row[d]; if (!k) { t.blank++; continue; } t[k] = (t[k] || 0) + 1; t.paid += (markOf(k) || [])[2] || 0; }
  return t;
};

export async function loadEmployees(companyId) { const r = await axios.get('/api/hr/employees', { params: { companyId } }); return Array.isArray(r.data) ? r.data : []; }
export async function loadSettings(companyId) { try { return (await axios.get('/api/hr/settings', { params: { companyId } })).data || {}; } catch { return {}; } }

/* open an HR file (employee document, signed agreement) in the preview */
export async function viewHrFile(kind, id, f, companyId) {
  const r = await axios.get(`/api/hr/${kind}/${id}/file/${encodeURIComponent(f.fileName)}`, { params: { companyId }, responseType: 'blob' });
  const pdf = /\.pdf$/i.test(f.fileName || f.name || '');
  openPreview(f.name || f.fileName, { pdfUrl: URL.createObjectURL(new Blob([r.data], { type: pdf ? 'application/pdf' : (r.headers['content-type'] || r.data.type || 'application/octet-stream') })), fileName: f.name || f.fileName });
}
/* a record + new files as multipart form data (objects are JSON-encoded) — as the classic HR page sends it */
export function toForm(obj, files = [], names = []) {
  const fd = new FormData();
  Object.entries(obj).forEach(([k, v]) => { if (v === undefined || v === null) return; fd.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v)); });
  files.forEach(f => fd.append('files', f));
  if (names.length) fd.append('fileNames', JSON.stringify(names));
  return fd;
}
