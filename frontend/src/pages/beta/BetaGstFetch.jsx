/* "Fetch from GST" — used by Create Client and Create Vendor.
 * The orange button opens a box for the GSTIN; the E-Way Helper on this PC opens the GST portal search (hidden),
 * its captcha picture is shown here, the user types it, and the details come back in a pop-up: Import fills the form. */
import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Svg } from '../../components/ui/Icon';
import { startHelperOnThisPC, waitHelperOnline, HelperBox } from './BetaDC';

const TEAL = '#03444f';
const F = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

export const STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh',
  'Uttarakhand', 'West Bengal', 'Delhi', 'Chandigarh', 'Puducherry', 'Ladakh',
];

/* "Principal Place of Business" from the GST portal → address, city, state, pincode
   e.g. "502, THE SUNGRACE ARCADE, MOTERA, Ahmedabad, Ahmedabad, Gujarat, 380005" */
export const gstAddress = text => {
  let parts = String(text || '').split(',').map(x => x.trim()).filter(Boolean);
  let pincode = '', state = '';
  const pin = parts.length ? parts[parts.length - 1].match(/(^|\D)(\d{6})$/) : null;
  if (pin) { pincode = pin[2]; const rest = parts[parts.length - 1].slice(0, -6).trim(); parts = rest ? [...parts.slice(0, -1), rest] : parts.slice(0, -1); }
  for (let i = parts.length - 1; i >= 0; i--) {
    const st = STATES.find(x => x.toLowerCase() === parts[i].toLowerCase());
    if (st) { state = st; parts.splice(i, 1); break; }
  }
  while (parts.length > 1 && parts[parts.length - 1].toLowerCase() === parts[parts.length - 2].toLowerCase()) parts.pop();   // district written twice
  const city = parts.length > 1 ? parts.pop() : '';
  const title = x => x.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());
  return { address: parts.join(', '), city: city ? title(city) : '', state, pincode };
};

const gstValid = g => /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(g || '');

const CSS = `
.cf-fetch { position:relative; z-index:1; display:inline-flex; align-items:center; gap:6px; height:28px; padding:0 14px; border:0; border-radius:2px; background:#F79009; color:#fff;
  cursor:pointer; font:700 12.5px ${F}; box-shadow:0 1px 3px rgba(0,0,0,.25); white-space:nowrap; }
.cf-fetch:hover:not(:disabled) { background:#DC6803; }
.cf-fetch:disabled { opacity:.6; cursor:default; }
.gp-back { position:fixed; inset:0; z-index:1500; background:rgba(2,24,28,.5); display:flex; align-items:center; justify-content:center; padding:16px; font-family:${F}; }
.gp { width:100%; max-width:640px; max-height:90vh; display:flex; flex-direction:column; background:#fff; border-radius:4px; overflow:hidden; box-shadow:0 20px 60px rgba(0,0,0,.35); }
.gp-hd { display:flex; align-items:center; gap:10px; padding:10px 14px; background:${TEAL}; color:#fff; font-size:14px; font-weight:700; }
.gp-hd .mono { margin-left:auto; font-family:ui-monospace, Consolas, monospace; font-size:12.5px; font-weight:600; opacity:.9; }
.gp-hd button { border:0; background:none; color:#fff; font-size:20px; line-height:1; cursor:pointer; padding:0 2px; }
.gp-bd { padding:12px 14px; overflow-y:auto; }
.gp-name { display:flex; align-items:center; gap:10px; margin-bottom:10px; }
.gp-name b { font-size:15px; color:#101828; }
.gp-st { padding:2px 8px; border-radius:2px; background:#1E7B34; color:#fff; font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; }
.gp-st.bad { background:#B42318; }
.gp-warn { margin:-4px 0 10px; padding:7px 10px; background:#FDECEC; color:#B42318; font-size:12px; font-weight:600; }
.gp-t { width:100%; border-collapse:collapse; font-size:12.5px; }
.gp-t th { width:190px; padding:6px 10px; background:#F4F8F8; border:1px solid #DCE6E8; text-align:left; font-weight:600; color:#344054; vertical-align:top; }
.gp-t td { padding:6px 10px; border:1px solid #DCE6E8; color:#101828; }
.gp-note { margin-top:10px; font-size:11.5px; color:#667085; }
.gp-ft { display:flex; justify-content:flex-end; gap:8px; padding:10px 14px; border-top:1px solid #DCE6E8; background:#FAFCFC; }
.gp-b { height:36px; padding:0 18px; border-radius:2px; cursor:pointer; font:600 13px ${F}; border:1px solid transparent; white-space:nowrap; }
.gp-b.ghost { background:#fff; border-color:#C9D7DA; color:#344054; } .gp-b.ghost:hover { background:#F7FAFA; }
.gp-b.pri { background:${TEAL}; color:#fff; box-shadow:0 2px 6px rgba(3,68,79,.35); } .gp-b.pri:hover { background:#025763; }
.ga { max-width:460px; }
.ga .gp-hd button { margin-left:auto; }
.ga-l { display:block; margin-bottom:6px; font-size:12px; font-weight:600; color:#344054; }
.ga-row { display:flex; gap:8px; }
.ga-row input { flex:1; min-width:0; height:38px; padding:0 12px; border:1px solid #C9D7DA; border-radius:2px; outline:none; font:600 15px ui-monospace, Consolas, monospace; letter-spacing:.8px; color:#101828; }
.ga-row input:focus { border-color:${TEAL}; box-shadow:0 0 0 3px rgba(3,68,79,.12); }
.ga-row input:disabled { background:#F2F6F6; }
.ga-go { display:inline-flex; align-items:center; gap:6px; height:38px; padding:0 18px; border:0; border-radius:2px; background:#F79009; color:#fff; cursor:pointer; font:700 13px ${F}; }
.ga-go:hover { background:#DC6803; }
.ga-hint { margin-top:5px; font-size:11.5px; color:#B54708; }
.ga-help { margin-top:10px; font-size:12px; color:#667085; line-height:1.45; }
.ga-st { display:flex; align-items:center; gap:8px; margin-top:12px; padding:9px 10px; background:#F5F9FA; border:1px solid #DCE6E8; font-size:12.5px; color:#344054; }
.ga-st.err { background:#FDECEC; border-color:#F5C2C0; color:#B42318; }
.ga-st.warn { background:#FFFAEB; border-color:#FEDF89; color:#B54708; }
.ga-st span:nth-child(2) { flex:1; }
.ga-cap { margin-top:14px; padding-top:12px; border-top:1px solid #EDF2F3; }
.ga-capimg { display:flex; align-items:center; gap:10px; margin-bottom:8px; }
.ga-capimg img { height:56px; max-width:260px; border:1px solid #C9D7DA; background:#fff; }
.ga-new { display:inline-flex; align-items:center; gap:5px; height:30px; padding:0 10px; border:1px solid #C9D7DA; border-radius:2px; background:#fff; color:#344054; cursor:pointer; font:600 12px ${F}; }
.ga-new:hover:not(:disabled) { background:#F7FAFA; }
.ga-new:disabled, .ga-go:disabled { opacity:.55; cursor:default; }
.ga-stop { flex-shrink:0; white-space:nowrap; height:26px; padding:0 12px; border:1px solid #C9D7DA; border-radius:2px; background:#fff; color:#344054; cursor:pointer; font:600 12px ${F}; }
.ga .spin { display:inline-block; flex-shrink:0; width:13px; height:13px; border:2px solid #C9D7DA; border-top-color:${TEAL}; border-radius:50%; animation:gfspin .8s linear infinite; }
@keyframes gfspin { to { transform:rotate(360deg); } }
.gpr { margin-top:12px; padding:10px 12px; background:#F5F9FA; border:1px solid #DCE6E8; }
.gpr-top { display:flex; align-items:center; gap:8px; font-size:12.5px; color:#344054; margin-bottom:7px; }
.gpr-top b { flex:1; font-weight:600; color:#101828; }
.gpr-top .t { font:600 11.5px ui-monospace, Consolas, monospace; color:#667085; }
.gpr-bar { position:relative; height:16px; border:1px solid #9AA9AC; border-radius:3px; overflow:hidden;
  background:linear-gradient(#F3F3F3, #DADADA 50%, #CFCFCF 51%, #E8E8E8); box-shadow:inset 0 1px 2px rgba(0,0,0,.15); }
.gpr-fill { position:absolute; inset:0 auto 0 0; overflow:hidden; transition:width .35s ease-out;
  background:linear-gradient(#9BEA8C, #37C13A 45%, #06A70A 52%, #3BD13E); box-shadow:inset 0 0 0 1px rgba(255,255,255,.35); }
.gpr-fill::after { content:''; position:absolute; top:0; bottom:0; width:90px; left:-90px;
  background:linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,.75), rgba(255,255,255,0)); animation:gprshine 1.6s linear infinite; }
.gpr.wait .gpr-fill { background:linear-gradient(#FFE58A, #F5B800 45%, #E0A100 52%, #F7C531); }
@keyframes gprshine { to { left:100%; } }
.gpr-steps { list-style:none; margin:9px 0 0; padding:0; display:grid; gap:3px; font-size:12px; }
.gpr-steps li { display:flex; align-items:center; gap:7px; color:#98A2B3; }
.gpr-steps li.done { color:#067647; } .gpr-steps li.now { color:#101828; font-weight:600; }
.gpr-steps .ic { width:14px; text-align:center; flex-shrink:0; }
.gpr-steps li.now .spin { width:11px; height:11px; }
.gpr-ft { display:flex; align-items:center; gap:8px; margin-top:8px; font-size:12px; color:#667085; }
.gpr-ft span { flex:1; }
@media (prefers-reduced-motion: reduce) { .gpr-fill::after { animation:none; } .gpr-fill { transition:none; } }
@media (max-width: 600px) { .gp-t th { width:120px; } }
`;

/* Step-by-step progress for the GST search (Windows 7 style bar).
   The bar creeps forward inside each step and jumps when the next step starts, so it never looks stuck. */
const GSTEPS = [
  { key: 'connect', label: 'Connecting to the helper',  lo: 0,  hi: 12, tau: 1.5 },
  { key: 'open',    label: 'Opening the GST portal',     lo: 12, hi: 60, tau: 6 },
  { key: 'captcha', label: 'Captcha ready — type it below', lo: 62, hi: 62, tau: 1 },
  { key: 'search',  label: 'Searching the GST portal',   lo: 66, hi: 96, tau: 2.5 },
  { key: 'done',    label: 'Details received',           lo: 100, hi: 100, tau: 1 },
];
const stageOf = g => !g?.jobId ? 'connect' : !g.img ? 'open' : (g.sent === g.seq && !g.refreshing) ? 'search' : 'captcha';

function GstProgress({ gst, onStop }) {
  const stage = stageOf(gst);
  const t0 = useRef(Date.now());             // when the whole search started
  const at = useRef({ stage, t: Date.now() });  // when the current step started
  if (at.current.stage !== stage) at.current = { stage, t: Date.now() };
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick(x => x + 1), 200); return () => clearInterval(id); }, []);
  const idx = GSTEPS.findIndex(x => x.key === stage), st = GSTEPS[idx];
  const inStep = (Date.now() - at.current.t) / 1000;
  const pct = Math.round(st.lo + (st.hi - st.lo) * (1 - Math.exp(-inStep / st.tau)));
  const secs = Math.floor((Date.now() - t0.current) / 1000);
  return (
    <div className={`gpr${stage === 'captcha' ? ' wait' : ''}`} role="status" aria-live="polite">
      <div className="gpr-top"><b>{st.label}</b><span className="t">{pct}% · {secs}s</span></div>
      <div className="gpr-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="GST search progress">
        <div className="gpr-fill" style={{ width: `${pct}%` }} />
      </div>
      <ol className="gpr-steps">
        {GSTEPS.slice(0, 4).map((x, i) => (
          <li key={x.key} className={i < idx ? 'done' : i === idx ? 'now' : ''}>
            <span className="ic">{i < idx ? '✓' : i === idx ? <span className="spin" /> : '○'}</span>{x.label}
          </li>
        ))}
      </ol>
      <div className="gpr-ft"><span>{gst.text}</span><button type="button" className="ga-stop" onClick={onStop}>Stop</button></div>
    </div>
  );
}

/* props: companyId, gstin (the form's, to start with), disabled,
   fills: text for the pop-up ("Import fills …"), onImport(details, address) */
export default function GstFetch({ companyId, gstin: formGstin, disabled, fills, onImport, title = 'Fill this form from the GST portal' }) {
  const [ask, setAsk] = useState(null);   // the box: { gstin }
  const [gst, setGst] = useState(null);   // search in progress / error: { busy, text, err, jobId, img, seq, sent, warn }
  const [pop, setPop] = useState(null);   // details read from the GST portal, waiting for Import / Cancel
  const [capIn, setCapIn] = useState('');
  const [helperBox, setHelperBox] = useState(false);   // start the helper / download its setup on this PC

  const stopGst = () => { if (gst?.jobId) axios.post(`/api/eway-helper/jobs/${gst.jobId}/cancel`).catch(() => {}); setGst(null); };
  const closeAsk = () => { if (gst?.busy) stopGst(); else setGst(null); setAsk(null); };
  const capSeq = gst?.seq;
  useEffect(() => { setCapIn(''); if (capSeq) setTimeout(() => document.getElementById('ga-cap')?.focus(), 50); }, [capSeq]);
  useEffect(() => {
    if ((!ask && !pop) || helperBox) return undefined;   // the helper box closes itself on Esc
    const k = e => { if (e.key !== 'Escape') return; if (pop) setPop(null); else closeAsk(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  });

  const sendCaptcha = async refresh => {
    if (!gst?.jobId || !gst.seq || gst.sent === gst.seq) return;
    if (!refresh && !capIn.trim()) return;
    const seq = gst.seq;
    setGst(o => ({ ...o, sent: seq, refreshing: !!refresh, text: refresh ? 'Getting a new captcha…' : 'Searching on the GST portal…' }));
    try { await axios.post(`/api/eway-helper/jobs/${gst.jobId}/captcha`, refresh ? { seq, refresh: true } : { seq, answer: capIn.trim() }); }
    catch (e) { setGst(o => (o && o.seq === seq ? { ...o, sent: null, text: e.response?.data?.error || 'Could not send the captcha — try again.' } : o)); }
  };

  const search = async gstin => {
    if (!gstValid(gstin)) return;
    setGst({ busy: true, text: 'Opening the GST portal on this PC…' });
    const post = () => axios.post('/api/eway-helper/jobs', { companyId, kind: 'gst', gstin });
    let job;
    try {
      try { job = (await post()).data; } catch (e) {
        if (e.response?.status !== 409 || !/your PC/i.test(e.response?.data?.error || '')) throw e;   // only a helper on this PC can be started from here
        setGst({ busy: true, text: 'Starting the helper on this PC…' }); startHelperOnThisPC();
        if (!(await waitHelperOnline(15000))) throw e;
        job = (await post()).data;
      }
    } catch (e) {
      // no helper on this PC (or not running): offer to start it / download its setup
      const noHelper = e.response?.status === 409 && /your PC/i.test(e.response?.data?.error || '');
      setGst({ err: true, helper: noHelper, text: noHelper ? 'The helper is not running on this PC. Start it — or, the first time on this PC, download its setup and run it once.' : (e.response?.data?.error || 'Could not reach the helper on this PC.') });
      return;
    }
    setGst({ busy: true, text: job.message, jobId: job.id });
    for (let i = 0; i < 975; i++) {
      await new Promise(r => setTimeout(r, 400));
      let j; try { j = (await axios.get(`/api/eway-helper/jobs/${job.id}`)).data; } catch { continue; }
      if (j.status === 'failed') { setGst(o => (o && o.jobId === job.id ? { err: true, text: j.message } : o)); return; }
      if (j.status === 'done' && j.gst) {
        setGst(o => (o && o.jobId === job.id ? null : o));
        setAsk(null);
        setPop({ ...j.gst, gstin });
        return;
      }
      let gone = false;
      setGst(o => {
        if (!o || o.jobId !== job.id) { gone = true; return o; }
        const fresh = j.captchaSeq && j.captchaSeq !== o.seq;   // a new picture (first one, or the last answer was wrong)
        return { ...o, img: j.captchaImg || o.img, seq: j.captchaSeq || o.seq, sent: fresh ? null : o.sent, refreshing: fresh ? false : o.refreshing,
          text: j.message, warn: fresh && /not accepted|again/i.test(j.message || '') };
      });
      if (gone) return;   // stopped by the user
    }
    setGst({ err: true, text: 'No answer from the GST portal search.' });
  };

  const gp = pop, gpA = gp ? gstAddress(gp.address) : null, gpActive = gp && /^active/i.test(gp.status || '');
  return (
    <>
      <style>{CSS}</style>
      <button type="button" className="cf-fetch" disabled={disabled} onClick={() => { setGst(null); setAsk({ gstin: formGstin || '' }); }} title={title}>
        <Svg name="search" size={14} />Fetch from GST</button>
      {ask && (
        <div className="gp-back" onMouseDown={e => { if (e.target === e.currentTarget && !gst?.busy) closeAsk(); }}>
          <div className="gp ga" role="dialog" aria-modal="true" aria-labelledby="ga-t">
            <div className="gp-hd"><span id="ga-t">Fetch from GST</span>
              <button type="button" onClick={closeAsk} aria-label="Close">×</button></div>
            <form className="gp-bd" onSubmit={e => { e.preventDefault(); if (gst?.busy && gst.img) sendCaptcha(false); else if (!gst?.busy) search(ask.gstin); }}>
              <label className="ga-l" htmlFor="ga-in">GSTIN / UIN</label>
              <div className="ga-row">
                <input id="ga-in" className="mono" autoFocus value={ask.gstin} maxLength={15} placeholder="24AAAFE1234K1Z5" disabled={!!gst?.busy} autoComplete="off"
                  onChange={e => { setAsk({ gstin: e.target.value.toUpperCase().replace(/\s/g, '').slice(0, 15) }); if (gst?.err) setGst(null); }} />
                {gstValid(ask.gstin) && !gst?.busy && <button type="submit" className="ga-go"><Svg name="search" size={14} />Fetch</button>}
              </div>
              {ask.gstin && !gstValid(ask.gstin) && <div className="ga-hint">{ask.gstin.length < 15 ? `${15 - ask.gstin.length} more character${15 - ask.gstin.length === 1 ? '' : 's'}` : 'This is not a valid GSTIN'}</div>}
              {!gst && <div className="ga-help">The GST portal opens on this PC with this GSTIN filled in. Its captcha picture shows here — type it and press Search, the details come back here.</div>}
              {gst?.busy && gst.img && (
                <div className="ga-cap">
                  <label className="ga-l" htmlFor="ga-cap">Type the characters in the picture</label>
                  <div className="ga-capimg">
                    <img src={gst.img} alt="Captcha from the GST portal" />
                    <button type="button" className="ga-new" disabled={gst.sent === gst.seq} onClick={() => sendCaptcha(true)} title="Show a new picture"><Svg name="refresh" size={14} />New picture</button>
                  </div>
                  <div className="ga-row">
                    <input id="ga-cap" className="mono" value={capIn} maxLength={12} autoComplete="off" placeholder="Characters shown above" disabled={gst.sent === gst.seq}
                      onChange={e => setCapIn(e.target.value.replace(/\s/g, ''))} />
                    <button type="submit" className="ga-go" disabled={!capIn.trim() || gst.sent === gst.seq}><Svg name="search" size={14} />Search</button>
                  </div>
                </div>
              )}
              {gst?.busy && <GstProgress gst={gst} onStop={stopGst} />}
              {gst && !gst.busy && (
                <div className={`ga-st${gst.err ? ' err' : gst.warn && gst.sent !== gst.seq ? ' warn' : ''}`} role="status">
                  {gst.busy && <span className="spin" />}<span>{gst.text}</span>
                  {gst.busy && <button type="button" className="ga-stop" onClick={stopGst}>Stop</button>}
                  {gst.helper && <button type="button" className="ga-stop" onClick={() => setHelperBox(true)}>Set up / start helper</button>}
                </div>
              )}
            </form>
          </div>
        </div>
      )}
      {helperBox && <HelperBox onClose={() => setHelperBox(false)} />}
      {gp && (
        <div className="gp-back" onMouseDown={e => { if (e.target === e.currentTarget) setPop(null); }}>
          <div className="gp" role="dialog" aria-modal="true" aria-labelledby="gp-t">
            <div className="gp-hd"><span id="gp-t">Details from the GST portal</span><span className="mono">{gp.gstin}</span>
              <button type="button" onClick={() => setPop(null)} aria-label="Close">×</button></div>
            <div className="gp-bd">
              <div className="gp-name"><b>{gp.legalName}</b><span className={`gp-st${gpActive ? '' : ' bad'}`}>{gp.status || 'Status not shown'}</span></div>
              {!gpActive && <div className="gp-warn">This GSTIN is not active on the GST portal — check before billing.</div>}
              <table className="gp-t"><tbody>
                {[['Legal Name', gp.legalName], ['Trade Name', gp.tradeName], ['GSTIN', gp.gstin], ['PAN', gp.gstin.slice(2, 12)], ['GSTIN Status', gp.status],
                  ['Registered On', gp.regDate], ['Constitution', gp.constitution], ['Taxpayer Type', gp.taxpayerType],
                  ['Principal Place of Business', gp.address], ['Address', gpA.address], ['City', gpA.city], ['State', gpA.state], ['Pincode', gpA.pincode],
                  ['Administrative Office', gp.jurisdiction], ['Nature of Business', gp.natureOfBusiness]]
                  .filter(([, x]) => x).map(([k, x]) => <tr key={k}><th>{k}</th><td>{x}</td></tr>)}
              </tbody></table>
              {fills && <div className="gp-note">{fills}</div>}
            </div>
            <div className="gp-ft">
              <button type="button" className="gp-b ghost" onClick={() => setPop(null)}>Cancel</button>
              <button type="button" className="gp-b pri" autoFocus onClick={() => { const g = pop; setPop(null); onImport(g, gstAddress(g.address)); }}>Import</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
