import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AuthShell, { Field, Alert, Btn, loginPath, StateIcon } from '../../components/auth/AuthShell';

/* Company user — ask for a password reset link by email. */
export default function ForgotPasswordCompany() {
  const navigate = useNavigate();
  const [email, setEmail]     = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg]         = useState(null);
  const [sent, setSent]       = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) { setMsg({ text: 'Please enter your email address.' }); return; }
    setLoading(true); setMsg(null);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      setSent(true);
    } catch (err) {
      setMsg({ text: err.message });
    } finally { setLoading(false); }
  };

  return (
    <AuthShell
      kicker="Account recovery"
      heading="Reset your password securely."
      text="Enter the email address linked to your account. We will send you a one-time link to choose a new password."
      points={['The reset link is valid for 1 hour and can be used once', 'Your current password keeps working until you change it', 'Contact your administrator if you no longer have access to this email']}
      title={sent ? 'Check your email' : 'Reset password'}
      subtitle={sent ? undefined : 'Enter the email address linked to your account.'}
    >
      {sent ? (
        <div className="as-state">
          <StateIcon kind="mail" />
          <h3>Reset link sent</h3>
          <p>If <b>{email}</b> is registered, a reset link is on its way.<br />The link expires in <b>1 hour</b> — check your spam folder too.</p>
          <div className="as-btns">
            <Btn type="button" kind="out" onClick={() => { setSent(false); setMsg(null); }}>Use another email</Btn>
            <Btn type="button" onClick={() => navigate(loginPath())}>Back to sign in</Btn>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} autoComplete="off" noValidate className="as-anim">
          <Alert msg={msg} />
          <Field id="fp-email" icon="mail" type="email" autoFocus placeholder="your@email.com" aria-label="Email address"
            value={email} onChange={e => { setEmail(e.target.value); setMsg(null); }} />
          <Btn type="submit" busy={loading} busyText="Sending…">Send reset link</Btn>
          <div className="as-foot">Remembered it?<button type="button" className="as-link" onClick={() => navigate(loginPath())}>Back to sign in</button></div>
        </form>
      )}
    </AuthShell>
  );
}
