"use client";

/**
 * Registration against a syndic-issued invitation.
 *
 * Four steps rather than one long form, because the first step is a gate: the
 * code and email are verified with the server before anyone is asked to type a
 * name or choose a password. Someone with the wrong code finds out on the first
 * screen instead of at the end.
 *
 * The unit, block and share allocation shown from step 2 onwards come from the
 * invitation, not from anything typed here — the resident confirms what the
 * syndic already recorded rather than asserting who they are.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  BadgeCheck,
  Building2,
  CircleCheck,
  Info,
  KeyRound,
  Lock,
  Mail,
  Phone,
  TriangleAlert,
  User,
} from "lucide-react";
import { DefRow, Card, Notice, ScreenHeader } from "@/components/resident/ui";
import { api } from "@/lib/api";
import { useAction } from "@/lib/resident/hooks";
import { useResidentSession } from "@/lib/resident/session";
import type { Invitation } from "@/lib/resident/types";

const STEPS = ["Verify", "Personal", "Security", "Confirm"];
const MIN_PASSWORD = 10;

export default function RegisterScreen() {
  const router = useRouter();
  const { reload } = useResidentSession();

  const [step, setStep] = useState(0);
  const [invitation, setInvitation] = useState<Invitation | null>(null);

  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const verify = useAction(async () => {
    const payload = await api<{ invitation: Invitation }>(
      "/api/resident/auth/verify-invitation",
      { method: "POST", body: { code: code.trim(), email: email.trim() } },
    );
    setInvitation(payload.invitation);
    setFirstName(payload.invitation.first_name ?? "");
    setLastName(payload.invitation.last_name ?? "");
    setStep(1);
  });

  const register = useAction(async () => {
    await api("/api/resident/auth/register", {
      method: "POST",
      body: {
        code: code.trim(),
        email: email.trim(),
        password,
        first_name: firstName.trim(),
        last_name: lastName.trim() || null,
        phone: phone.trim() || null,
      },
    });
    await reload();
    router.replace("/app/home");
  });

  const passwordsMatch = password.length >= MIN_PASSWORD && password === confirm;

  return (
    <div className="r-screen r-screen--plain">
      <ScreenHeader back="/app/login" title="Create your account" />

      <div className="r-stepper">
        {STEPS.map((label, index) => (
          <div
            className={`r-stepper__step ${index === step ? "is-active" : ""} ${
              index < step ? "is-done" : ""
            }`}
            key={label}
          >
            <span className="r-stepper__dot">
              {index < step ? <CircleCheck size={13} /> : index + 1}
            </span>
            <span className="r-stepper__label">{label}</span>
            {index < STEPS.length - 1 ? <span className="r-stepper__line" /> : null}
          </div>
        ))}
      </div>

      {step === 0 ? (
        <Card accent>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Verify your invitation</div>
          <p className="r-muted" style={{ marginBottom: 14, lineHeight: 1.55 }}>
            Enter the code your syndic manager sent you, and the email address they hold for
            your unit.
          </p>

          {verify.error ? (
            <Notice icon={TriangleAlert} tone="er">
              {verify.error}
            </Notice>
          ) : null}

          <Field
            icon={KeyRound}
            label="Invitation code"
            onChange={setCode}
            placeholder="ABC-123"
            style={{ textTransform: "uppercase" }}
            value={code}
          />
          <Field
            icon={Mail}
            label="Email address"
            onChange={setEmail}
            placeholder="you@email.com"
            type="email"
            value={email}
          />

          <Notice icon={Info} tone="info">
            Your email must match the address registered against your unit. If it does not,
            your syndic manager can update it.
          </Notice>

          <button
            className="r-btn r-btn--primary r-btn--block"
            disabled={verify.pending || !code || !email}
            onClick={() => void verify.run()}
            type="button"
          >
            {verify.pending ? "Checking…" : "Verify and continue"}
          </button>
        </Card>
      ) : null}

      {step > 0 && invitation ? (
        <Card>
          <div className="r-label" style={{ marginBottom: 8 }}>
            Invitation confirmed
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="r-row__mark tint-ok">
              <BadgeCheck size={16} />
            </span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                Unit {invitation.unit_label}
              </div>
              <div className="r-muted">
                {invitation.development_name} ·{" "}
                {invitation.role === "co_owner" ? "Co-owner" : "Tenant"}
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      {step === 1 ? (
        <Card accent>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Your details</div>
          <Field icon={User} label="First name" onChange={setFirstName} placeholder="First name" value={firstName} />
          <Field icon={User} label="Last name" onChange={setLastName} placeholder="Last name" value={lastName} />
          <Field
            icon={Phone}
            label="Mobile number"
            onChange={setPhone}
            placeholder="+230 5xxx xxxx"
            type="tel"
            value={phone}
          />
          <p className="r-muted" style={{ marginBottom: 14, lineHeight: 1.55 }}>
            A mobile number is optional. Without one you will not receive WhatsApp notices —
            invoices and notifications still appear in the app.
          </p>
          <div className="r-btn-row" style={{ marginTop: 0 }}>
            <button className="r-btn" onClick={() => setStep(0)} type="button">
              Back
            </button>
            <button
              className="r-btn r-btn--primary"
              disabled={!firstName.trim()}
              onClick={() => setStep(2)}
              type="button"
            >
              Continue
            </button>
          </div>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card accent>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Choose a password</div>
          <Field
            icon={Lock}
            label="Password"
            onChange={setPassword}
            placeholder="At least 10 characters"
            type="password"
            value={password}
          />
          <Field
            icon={Lock}
            label="Confirm password"
            onChange={setConfirm}
            placeholder="Repeat the password"
            type="password"
            value={confirm}
          />
          {password && password.length < MIN_PASSWORD ? (
            <div className="r-field__error">Use at least {MIN_PASSWORD} characters.</div>
          ) : null}
          {confirm && password !== confirm ? (
            <div className="r-field__error">The two passwords do not match.</div>
          ) : null}

          <div className="r-btn-row" style={{ marginTop: 12 }}>
            <button className="r-btn" onClick={() => setStep(1)} type="button">
              Back
            </button>
            <button
              className="r-btn r-btn--primary"
              disabled={!passwordsMatch}
              onClick={() => setStep(3)}
              type="button"
            >
              Continue
            </button>
          </div>
        </Card>
      ) : null}

      {step === 3 && invitation ? (
        <Card accent>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Confirm and finish</div>

          {register.error ? (
            <Notice icon={TriangleAlert} tone="er">
              {register.error}
            </Notice>
          ) : null}

          <DefRow label="Name">
            {firstName} {lastName}
          </DefRow>
          <DefRow label="Email">{email}</DefRow>
          <DefRow label="Mobile">{phone || "Not provided"}</DefRow>
          <DefRow label="Unit">
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Building2 size={13} />
              {invitation.unit_label} · {invitation.development_name}
            </span>
          </DefRow>
          <DefRow label="Role">
            {invitation.role === "co_owner" ? "Co-owner" : "Tenant"}
          </DefRow>

          <div className="r-btn-row">
            <button className="r-btn" onClick={() => setStep(2)} type="button">
              Back
            </button>
            <button
              className="r-btn r-btn--accent"
              disabled={register.pending}
              onClick={() => void register.run()}
              type="button"
            >
              {register.pending ? "Creating…" : "Create account"}
            </button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  icon: Icon,
  type = "text",
  style,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  icon: typeof User;
  type?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className="r-field">
      <label className="r-field__label">{label}</label>
      <div className="r-input">
        <span className="r-input__icon">
          <Icon size={15} />
        </span>
        <input
          autoCapitalize={type === "email" ? "none" : "sentences"}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          style={style}
          type={type}
          value={value}
        />
      </div>
    </div>
  );
}
