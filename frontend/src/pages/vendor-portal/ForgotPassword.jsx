import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import AuthShell, { Field, Alert, Btn, loginPath, StateIcon } from '../../components/auth/AuthShell';

/* Vendor — ask for a password reset link by email. */
export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail]     = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg]         = useState(null);
  const [sent, setSent]       = useState(false);

  const sendLink = async (e) => {
    e?.preventDefault();
    if (!email.trim()) { setMsg({ text: 'Enter your registered email address.' }); return; }
    setLoading(true); setMsg(null);
    try {
      const res = await axios.post('/api/vendor-portal/forgot-password/request', { email: email.trim() });
      setSent(true);
      if (res.data.devLink) setMsg({ type: 'success', text: `Dev mode — link: ${res.data.devLink}` });
    } catch (err) {
      setMsg({ text: err.response?.data?.error || err.message });
    } finally { setLoading(false); }
  };

  return (
    <AuthShell
      kicker="Supplier portal"
      heading="Recover your supplier account."
      text="Enter the email you registered with. We will send a secure link — you will confirm your business name and choose a new password."
      points={['Link sent to your registered email', 'Confirm your business name', 'Choose a new password']}
      title={sent ? 'Check your email' : 'Vendor password reset'}
      subtitle={sent ? undefined : 'Enter your registered email address.'}
    >
      {sent ? (
        <div className="as-state">
          <StateIcon kind="mail" />
          <h3>Reset link sent</h3>
          <p>If <b>{email}</b> is registered, a reset link is on its way. Check your spam folder too.</p>
          {msg && <div style={{ textAlign: 'left' }}><Alert msg={msg} /></div>}
          <div className="as-btns">
            <Btn type="button" kind="out" onClick={() => { setSent(false); setEmail(''); setMsg(null); }}>Use another email</Btn>
            <Btn type="button" onClick={() => navigate(loginPath())}>Back to sign in</Btn>
          </div>
        </div>
      ) : (
        <form onSubmit={sendLink} autoComplete="off" noValidate className="as-anim">
          <Alert msg={msg} />
          <Field id="vfp-email" icon="mail" type="email" autoFocus placeholder="vendor@company.com" aria-label="Registered email"
            value={email} onChange={e => { setEmail(e.target.value); setMsg(null); }} />
          <Btn type="submit" busy={loading} busyText="Sending…">Send reset link</Btn>
          <div className="as-foot">Remembered it?<button type="button" className="as-link" onClick={() => navigate(loginPath())}>Back to sign in</button></div>
        </form>
      )}
    </AuthShell>
  );
}
