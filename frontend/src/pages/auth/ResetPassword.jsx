import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AuthShell, { Field, Alert, Btn, PwdHint, loginPath, StateIcon, Note } from '../../components/auth/AuthShell';

/* Company user — set a new password from the emailed reset link (?token=…). */
export default function ResetPassword() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token    = params.get('token') || '';

  const [status, setStatus]   = useState('verifying');   // verifying | valid | invalid | done
  const [email, setEmail]     = useState('');
  const [pwd, setPwd]         = useState('');
  const [confPwd, setConfPwd] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg]         = useState(null);

  useEffect(() => {
    if (!token) { setStatus('invalid'); return; }
    fetch(`/api/auth/verify-reset-token/${token}`)
      .then(r => r.json())
      .then(d => { if (d.valid) { setEmail(d.email); setStatus('valid'); } else setStatus('invalid'); })
      .catch(() => setStatus('invalid'));
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!pwd || pwd.length < 6) { setMsg({ text: 'Password must be at least 6 characters.' }); return; }
    if (pwd !== confPwd) { setMsg({ text: 'Passwords do not match.' }); return; }
    setLoading(true); setMsg(null);
    try {
      const res  = await fetch('/api/auth/reset-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: pwd }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Reset failed');
      setStatus('done');
    } catch (err) { setMsg({ text: err.message }); }
    finally { setLoading(false); }
  };

  return (
    <AuthShell
      kicker="Account recovery"
      heading="Choose a new password."
      text="Choose a new password for your account. Use at least 6 characters — mixing letters, numbers and symbols makes it stronger."
      points={['At least 6 characters', 'Do not reuse old passwords', 'Never share it with anyone']}
      title="Set new password"
      subtitle={status === 'valid' ? 'Enter and confirm your new password.' : undefined}
    >
      {status === 'verifying' && (
        <div className="as-state"><div className="as-loader" /><p>Checking your reset link…</p></div>
      )}

      {status === 'invalid' && (
        <div className="as-state">
          <StateIcon kind="bad" />
          <h3>Link invalid or expired</h3>
          <p>Reset links work for 1 hour and only once. Please ask for a new one.</p>
          <div className="as-btns">
            <Btn type="button" kind="out" onClick={() => navigate(loginPath())}>Back to sign in</Btn>
            <Btn type="button" onClick={() => navigate('/forgot-password')}>Get a new link</Btn>
          </div>
        </div>
      )}

      {status === 'done' && (
        <div className="as-state">
          <StateIcon kind="ok" />
          <h3>Password changed</h3>
          <p>You can now sign in with your new password.</p>
          <Btn type="button" onClick={() => navigate(loginPath())}>Sign in</Btn>
        </div>
      )}

      {status === 'valid' && (
        <form onSubmit={handleSubmit} autoComplete="off" noValidate className="as-anim">
          <Note icon="user">Account: <b>{email}</b></Note>
          <Alert msg={msg} />
          <Field id="rp-pwd" icon="lock" type="password" autoFocus placeholder="New password" aria-label="New password"
            value={pwd} onChange={e => { setPwd(e.target.value); setMsg(null); }} />
          <PwdHint pwd={pwd} />
          <Field id="rp-conf" icon="lock" type="password" placeholder="Confirm new password" aria-label="Confirm new password" bad={!!confPwd && pwd !== confPwd}
            value={confPwd} onChange={e => { setConfPwd(e.target.value); setMsg(null); }} />
          <PwdHint pwd={pwd} conf={confPwd} />
          <Btn type="submit" busy={loading} busyText="Saving…">Reset password</Btn>
          <div className="as-foot"><button type="button" className="as-link" onClick={() => navigate(loginPath())}>Back to sign in</button></div>
        </form>
      )}
    </AuthShell>
  );
}
