import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import AuthShell, { Field, Alert, Btn, PwdHint, loginPath, StateIcon, Note } from '../../components/auth/AuthShell';

/* Vendor — new password from the emailed link (?token=…); the business name is confirmed for safety. */
export default function VendorResetPassword() {
  const navigate = useNavigate();
  const token = new URLSearchParams(window.location.search).get('token') || '';

  const [phase, setPhase]             = useState('verifying');   // verifying | invalid | form | done
  const [nameHint, setNameHint]       = useState('');
  const [confirmName, setConfirmName] = useState('');
  const [newPwd, setNewPwd]           = useState('');
  const [confPwd, setConfPwd]         = useState('');
  const [loading, setLoading]         = useState(false);
  const [msg, setMsg]                 = useState(null);
  const [errText, setErrText]         = useState('');

  useEffect(() => {
    if (!token) { setPhase('invalid'); setErrText('No reset token found. Please request a new password reset link.'); return; }
    axios.get(`/api/vendor-portal/verify-reset-token/${token}`)
      .then(r => { setNameHint(r.data.nameHint || ''); setPhase('form'); })
      .catch(e => { setErrText(e.response?.data?.error || 'Invalid or expired reset link.'); setPhase('invalid'); });
  }, [token]);

  const submit = async (e) => {
    e?.preventDefault();
    if (!confirmName.trim()) { setMsg({ text: 'Please enter your registered business name.' }); return; }
    if (!newPwd || newPwd.length < 6) { setMsg({ text: 'Password must be at least 6 characters.' }); return; }
    if (newPwd !== confPwd) { setMsg({ text: 'Passwords do not match.' }); return; }
    setLoading(true); setMsg(null);
    try {
      await axios.post('/api/vendor-portal/forgot-password/reset-with-name', {
        token, confirmName: confirmName.trim(), newPassword: newPwd,
      });
      setPhase('done');
    } catch (err) {
      setMsg({ text: err.response?.data?.error || err.message });
    } finally { setLoading(false); }
  };

  return (
    <AuthShell
      kicker="Supplier portal"
      heading="Choose a new password."
      text="For your safety, confirm your registered business name, then choose a new password for the vendor portal."
      points={['Confirm your business name', 'At least 6 characters', 'Sign in with your email']}
      title="Set new password"
      subtitle={phase === 'form' ? 'Confirm your business name and choose a new password.' : undefined}
    >
      {phase === 'verifying' && <div className="as-state"><div className="as-loader" /><p>Checking your reset link…</p></div>}

      {phase === 'invalid' && (
        <div className="as-state">
          <StateIcon kind="bad" />
          <h3>Link invalid or expired</h3>
          <p>{errText}</p>
          <div className="as-btns">
            <Btn type="button" kind="out" onClick={() => navigate(loginPath())}>Back to sign in</Btn>
            <Btn type="button" onClick={() => navigate('/vendor-forgot-password')}>Get a new link</Btn>
          </div>
        </div>
      )}

      {phase === 'done' && (
        <div className="as-state">
          <StateIcon kind="ok" />
          <h3>Password changed</h3>
          <p>Your vendor portal password is updated. You can sign in now.</p>
          <Btn type="button" onClick={() => navigate(loginPath())}>Sign in</Btn>
        </div>
      )}

      {phase === 'form' && (
        <form onSubmit={submit} autoComplete="off" noValidate className="as-anim">
          <Note icon="shield">Please confirm your <b>registered business name</b>.{nameHint && <><br />Hint: <b style={{ letterSpacing: 1 }}>{nameHint}</b></>}</Note>
          <Alert msg={msg} />
          <Field id="vrp-name" icon="biz" autoFocus placeholder="Registered business name" aria-label="Registered business name"
            value={confirmName} onChange={e => { setConfirmName(e.target.value); setMsg(null); }} />
          <Field id="vrp-pwd" icon="lock" type="password" placeholder="New password" aria-label="New password"
            value={newPwd} onChange={e => { setNewPwd(e.target.value); setMsg(null); }} />
          <PwdHint pwd={newPwd} />
          <Field id="vrp-conf" icon="lock" type="password" placeholder="Confirm new password" aria-label="Confirm new password" bad={!!confPwd && newPwd !== confPwd}
            value={confPwd} onChange={e => { setConfPwd(e.target.value); setMsg(null); }} />
          <PwdHint pwd={newPwd} conf={confPwd} />
          <Btn type="submit" busy={loading} busyText="Saving…">Reset password</Btn>
          <div className="as-foot">Link not working?<button type="button" className="as-link" onClick={() => navigate('/vendor-forgot-password')}>Get a new link</button></div>
        </form>
      )}
    </AuthShell>
  );
}
