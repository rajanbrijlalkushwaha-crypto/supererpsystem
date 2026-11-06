import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import AuthShell, { Field, Alert, Btn, PwdHint, loginPath, StateIcon, Note } from '../../components/auth/AuthShell';
import { PRODUCT_NAME } from '../../utils/brand';

/* New company user — activate the account from the invite link (?token=…) by choosing a password. */
export default function SetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const navigate = useNavigate();

  const [status, setStatus] = useState('verifying'); // verifying | valid | invalid | done
  const [info, setInfo]     = useState(null);
  const [pwd, setPwd]       = useState('');
  const [conf, setConf]     = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg]       = useState(null);

  useEffect(() => {
    if (!token) { setStatus('invalid'); return; }
    axios.get(`/api/auth/verify-invite/${token}`)
      .then(r => { setInfo(r.data); setStatus('valid'); })
      .catch(() => setStatus('invalid'));
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (pwd.length < 6) { setMsg({ text: 'Password must be at least 6 characters.' }); return; }
    if (pwd !== conf)   { setMsg({ text: 'Passwords do not match.' }); return; }
    setMsg(null); setSaving(true);
    try {
      await axios.post('/api/auth/accept-invite', { token, password: pwd });
      setStatus('done');
    } catch (err) {
      setMsg({ text: err.response?.data?.error || err.message });
    } finally { setSaving(false); }
  };

  const first = info?.name?.split(' ')[0];

  return (
    <AuthShell
      kicker="Account activation"
      heading={first ? `Welcome, ${first}.` : 'Activate your account.'}
      text={`Your administrator has created an account for you on ${PRODUCT_NAME}. Choose a password to activate it.`}
      points={['Choose your password', 'Sign in with your user name', 'Start working right away']}
      title="Activate account"
      subtitle={status === 'valid' ? 'Set a password to finish setting up your account.' : undefined}
    >
      {status === 'verifying' && <div className="as-state"><div className="as-loader" /><p>Checking your invite link…</p></div>}

      {status === 'invalid' && (
        <div className="as-state">
          <StateIcon kind="bad" />
          <h3>Link invalid or expired</h3>
          <p>Invite links expire after 7 days. Please ask your administrator to send the invitation again.</p>
          <Btn type="button" onClick={() => navigate(loginPath())}>Go to sign in</Btn>
        </div>
      )}

      {status === 'done' && (
        <div className="as-state">
          <StateIcon kind="ok" />
          <h3>Account activated</h3>
          <p>Your password is set. Sign in with your user name <b>{info?.username}</b>.</p>
          <Btn type="button" onClick={() => navigate(loginPath())}>Sign in</Btn>
        </div>
      )}

      {status === 'valid' && (
        <form onSubmit={handleSubmit} autoComplete="off" noValidate className="as-anim">
          <Note icon="user">User name: <b>{info?.username}</b>{info?.email && <><br />Email: {info.email}</>}</Note>
          <Alert msg={msg} />
          <Field id="sp-pwd" icon="lock" type="password" autoFocus placeholder="New password" aria-label="New password"
            value={pwd} onChange={e => { setPwd(e.target.value); setMsg(null); }} />
          <PwdHint pwd={pwd} />
          <Field id="sp-conf" icon="lock" type="password" placeholder="Confirm password" aria-label="Confirm password" bad={!!conf && pwd !== conf}
            value={conf} onChange={e => { setConf(e.target.value); setMsg(null); }} />
          <PwdHint pwd={pwd} conf={conf} />
          <Btn type="submit" busy={saving} busyText="Activating…">Activate account</Btn>
        </form>
      )}
    </AuthShell>
  );
}
