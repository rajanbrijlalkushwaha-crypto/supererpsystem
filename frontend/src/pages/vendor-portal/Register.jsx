import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import AuthShell, { Field, Alert, Btn, PwdHint, loginPath, StateIcon } from '../../components/auth/AuthShell';

/* Vendor self-registration — 4 steps, then email OTP; the request goes for approval. */
const STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat',
  'Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh',
  'Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan',
  'Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal',
  'Delhi','Chandigarh','Puducherry','Jammu and Kashmir','Ladakh',
];
const BUSINESS_TYPES = ['Proprietorship','Partnership','Private Limited','Public Limited','LLP','Government','Individual','Trust / NGO','HUF'];
const INDUSTRY_TYPES = ['Manufacturing','Trading','Services','Construction','Consulting','Logistics','Others'];
const STEPS = ['Business', 'Contact & Address', 'Bank & Password', 'Verify Email'];

/* fields that must be filled before moving on from each step */
const checkStep = (step, f) => {
  if (step === 0) {
    if (!f.vendorName.trim()) return 'Please enter the vendor name.';
    if (!f.businessType) return 'Please select the business type.';
  }
  if (step === 1) {
    if (!f.contactPerson.trim()) return 'Please enter the contact person.';
    if (!/^\d{10}$/.test(f.mobile)) return 'Please enter a 10-digit mobile number.';
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) return 'Please enter a valid email address.';
    if (!f.address.trim() || !f.city.trim() || !f.state) return 'Please fill the address, city and state.';
  }
  if (step === 2) {
    if (!f.password || f.password.length < 6) return 'Password must be at least 6 characters.';
    if (f.password !== f.confirmPassword) return 'Passwords do not match.';
  }
  return null;
};

export default function VendorRegister() {
  const navigate = useNavigate();
  const [step, setStep]             = useState(0);
  const [otpSent, setOtpSent]       = useState(false);
  const [sending, setSending]       = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg]               = useState(null);
  const [submitted, setSubmitted]   = useState(null);
  const [form, setForm] = useState({
    vendorName:'', businessType:'', industryType:'', gst:'', pan:'', cin:'', msme:'',
    contactPerson:'', mobile:'', email:'', website:'',
    address:'', city:'', state:'', pincode:'', country:'India',
    bankName:'', accountHolder:'', accountNo:'', ifsc:'', branch:'',
    password:'', confirmPassword:'', otp:'',
  });

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setMsg(null); };
  const bind = (k, fx = v => v) => ({ value: form[k], onChange: e => set(k, fx(e.target.value)) });
  const upper = v => v.toUpperCase();
  const digits = v => v.replace(/\D/g, '');

  const next = () => {
    const err = checkStep(step, form);
    if (err) { setMsg({ text: err }); return; }
    setMsg(null); setStep(s => s + 1);
  };
  const back = () => { setMsg(null); setStep(s => s - 1); };

  const sendOTP = async () => {
    if (!form.email) { setMsg({ text: 'Enter your email first.' }); return; }
    if (!form.password || form.password.length < 6) { setMsg({ text: 'Set a password (min 6 chars) before sending OTP.' }); return; }
    if (form.password !== form.confirmPassword) { setMsg({ text: 'Passwords do not match.' }); return; }
    setSending(true); setMsg(null);
    try {
      const res = await axios.post('/api/vendor-portal/send-otp', { email: form.email });
      setOtpSent(true);
      const txt = res.data.message || `OTP sent to ${form.email}. Check your inbox.`;
      setMsg({ type: 'success', text: res.data.devOtp ? `OTP: ${res.data.devOtp} (use this OTP)` : txt });
    } catch (e) {
      setMsg({ text: e.response?.data?.error || e.message });
    } finally { setSending(false); }
  };

  const handleSubmit = async () => {
    if (!form.otp) { setMsg({ text: 'Enter the OTP.' }); return; }
    setSubmitting(true); setMsg(null);
    try {
      const res = await axios.post('/api/vendor-portal/register', form);
      setSubmitted({ trackingNo: res.data.trackingNo });
    } catch (e) {
      setMsg({ text: e.response?.data?.error || e.message });
    } finally { setSubmitting(false); }
  };

  const shell = {
    kicker: 'Supplier onboarding',
    heading: 'Become a registered supplier.',
    text: 'Register your business as a supplier. After approval you can see purchase orders, share dispatch details and track payments.',
    modules: true,
    wide: true,
  };

  if (submitted) return (
    <AuthShell {...shell} title="Registration submitted">
      <div className="as-state">
        <StateIcon kind="ok" />
        <h3>Thank you!</h3>
        <p>Your registration is sent for review. You will get an email once it is approved.</p>
        <div className="as-track"><small>Your tracking number</small><b>{submitted.trackingNo}</b></div>
        <Btn type="button" onClick={() => navigate(loginPath())}>Go to sign in</Btn>
      </div>
    </AuthShell>
  );

  return (
    <AuthShell {...shell} title="Vendor registration" subtitle={`Step ${step + 1} of ${STEPS.length} — ${STEPS[step]}`}>
      <div className="as-steps" aria-hidden="true">
        {STEPS.map((s, i) => <div key={s} className={i < step ? 'done' : i === step ? 'on' : ''}><b /><span>{i < step ? '✓ ' : ''}{s}</span></div>)}
      </div>

      <form onSubmit={e => { e.preventDefault(); if (step < 3) next(); else handleSubmit(); }} autoComplete="off" noValidate>
        <Alert msg={msg} />

        <div className="as-grid as-anim" key={step}>
          {step === 0 && <>
            <Field full id="vr-name" label="Vendor name" req autoFocus placeholder="Full legal name" {...bind('vendorName')} />
            <Field id="vr-btype" label="Business type" req type="select" {...bind('businessType')}>
              <option value="">— Select —</option>{BUSINESS_TYPES.map(o => <option key={o}>{o}</option>)}
            </Field>
            <Field id="vr-itype" label="Industry type" type="select" {...bind('industryType')}>
              <option value="">— Select —</option>{INDUSTRY_TYPES.map(o => <option key={o}>{o}</option>)}
            </Field>
            <Field id="vr-gst" label="GST number" maxLength={15} placeholder="22AAAAA0000A1Z5" {...bind('gst', upper)} />
            <Field id="vr-pan" label="PAN number" maxLength={10} placeholder="ABCDE1234F" {...bind('pan', upper)} />
            <Field id="vr-cin" label="CIN number" placeholder="Optional" {...bind('cin', upper)} />
            <Field id="vr-msme" label="MSME / Udyam no." placeholder="Optional" {...bind('msme', upper)} />
          </>}

          {step === 1 && <>
            <Field id="vr-cp" label="Contact person" req autoFocus placeholder="Full name" {...bind('contactPerson')} />
            <Field id="vr-mob" label="Mobile number" req maxLength={10} inputMode="numeric" placeholder="10-digit mobile" {...bind('mobile', digits)} />
            <Field id="vr-email" label="Email address" req type="email" placeholder="vendor@company.com" {...bind('email')} />
            <Field id="vr-web" label="Website" placeholder="https://…" {...bind('website')} />
            <Field full id="vr-addr" label="Address" req type="textarea" rows={2} placeholder="Full address" {...bind('address')} />
            <Field id="vr-city" label="City" req placeholder="City" {...bind('city')} />
            <Field id="vr-state" label="State" req type="select" {...bind('state')}>
              <option value="">— Select —</option>{STATES.map(s => <option key={s}>{s}</option>)}
            </Field>
            <Field id="vr-pin" label="Pincode" maxLength={6} inputMode="numeric" placeholder="6-digit" {...bind('pincode', digits)} />
            <Field id="vr-country" label="Country" {...bind('country')} />
          </>}

          {step === 2 && <>
            <Field id="vr-bank" label="Bank name" autoFocus placeholder="e.g. State Bank of India" {...bind('bankName')} />
            <Field id="vr-holder" label="Account holder" placeholder="Name on account" {...bind('accountHolder')} />
            <Field id="vr-acno" label="Account number" placeholder="Bank account number" {...bind('accountNo')} />
            <Field id="vr-ifsc" label="IFSC code" maxLength={11} placeholder="SBIN0001234" {...bind('ifsc', upper)} />
            <Field full id="vr-branch" label="Branch" placeholder="Branch city / name" {...bind('branch')} />
            <div className="full">
              <Field id="vr-pwd" label="Set password" req icon="lock" type="password" placeholder="Min 6 characters" {...bind('password')} />
              <PwdHint pwd={form.password} />
            </div>
            <div className="full">
              <Field id="vr-conf" label="Confirm password" req icon="lock" type="password" placeholder="Re-enter password"
                bad={!!form.confirmPassword && form.password !== form.confirmPassword} {...bind('confirmPassword')} />
              <PwdHint pwd={form.password} conf={form.confirmPassword} />
            </div>
          </>}

          {step === 3 && <div className="full" style={{ textAlign: 'center' }}>
            <div className="as-state" style={{ paddingTop: 0 }}>
              <StateIcon kind="mail" />
              <h3>Verify your email</h3>
              <p>We will send a 6-digit OTP to <b>{form.email}</b></p>
            </div>
            <Btn type="button" kind={otpSent ? 'out' : 'pri'} busy={sending} busyText="Sending…" onClick={sendOTP}>
              {otpSent ? 'Resend OTP' : 'Send OTP to email'}
            </Btn>
            {otpSent && <div style={{ marginTop: 16 }}>
              <Field id="vr-otp" label="Enter OTP" req autoFocus maxLength={6} inputMode="numeric" placeholder="••••••" className="as-otp" {...bind('otp', digits)} />
            </div>}
          </div>}
        </div>

        <div className="as-btns" style={{ marginTop: 6 }}>
          {step > 0 && <Btn type="button" kind="ghost" onClick={back} disabled={submitting}>← Back</Btn>}
          {step < 3
            ? <Btn type="submit">Next →</Btn>
            : <Btn type="submit" kind="ok" busy={submitting} busyText="Submitting…" disabled={!form.otp}>Complete registration</Btn>}
        </div>
        <div className="as-foot">Already registered?<button type="button" className="as-link" onClick={() => navigate(loginPath())}>Sign in</button></div>
      </form>
    </AuthShell>
  );
}
