"use client";

/**
 * Resident sign-in.
 *
 * A separate surface from the console's /login because the two accept
 * different accounts: this endpoint refuses console roles, and the console's
 * refuses residents. One shared form would have to explain a rejection it
 * cannot predict.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Eye, EyeOff, House, Lock, Mail, MessageSquare, TriangleAlert } from "lucide-react";
import { Notice } from "@/components/resident/ui";
import { api } from "@/lib/api";
import { useAction } from "@/lib/resident/hooks";
import { useResidentSession } from "@/lib/resident/session";

export default function LoginScreen() {
  const router = useRouter();
  const { session, reload } = useResidentSession();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);

  // Someone who is already signed in has no business on the login screen.
  useEffect(() => {
    if (session) router.replace("/app/home");
  }, [session, router]);

  const signIn = useAction(async () => {
    await api("/api/resident/auth/login", {
      method: "POST",
      body: { email: email.trim(), password },
    });
    await reload();
    router.replace("/app/home");
  });

  return (
    <div className="r-auth">
      <div className="r-auth__brand">
        <span className="r-auth__mark">
          <House size={25} strokeWidth={2.1} />
        </span>
        <div className="r-auth__name">SyndicMS</div>
        <div className="r-auth__tag">Co-Owner Portal</div>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void signIn.run();
        }}
      >
        {signIn.error ? (
          <Notice icon={TriangleAlert} tone="er">
            {signIn.error}
          </Notice>
        ) : null}

        <div className="r-field">
          <label className="r-field__label" htmlFor="email">
            Email address
          </label>
          <div className="r-input">
            <span className="r-input__icon">
              <Mail size={15} />
            </span>
            <input
              autoCapitalize="none"
              autoComplete="email"
              id="email"
              inputMode="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@email.com"
              required
              type="email"
              value={email}
            />
          </div>
        </div>

        <div className="r-field">
          <label className="r-field__label" htmlFor="password">
            Password
          </label>
          <div className="r-input">
            <span className="r-input__icon">
              <Lock size={15} />
            </span>
            <input
              autoComplete="current-password"
              id="password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              required
              type={reveal ? "text" : "password"}
              value={password}
            />
            <button
              aria-label={reveal ? "Hide password" : "Show password"}
              className="r-input__icon"
              onClick={() => setReveal((current) => !current)}
              style={{ background: "none", border: "none", cursor: "pointer" }}
              type="button"
            >
              {reveal ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        <button
          className="r-btn r-btn--primary r-btn--block"
          disabled={signIn.pending || !email || !password}
          type="submit"
        >
          {signIn.pending ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <div className="r-divider">or</div>

      <Link className="r-btn r-btn--block" href="/app/register">
        Register with an invitation code
      </Link>

      <div style={{ marginTop: 16, textAlign: "center" }}>
        <span className="r-notice r-notice--ok" style={{ display: "inline-flex", marginBottom: 0 }}>
          <MessageSquare size={14} />
          WhatsApp notifications available
        </span>
      </div>

      <div className="r-auth__foot">
        Forgotten your password? Contact your syndic manager to have it reset.
      </div>
    </div>
  );
}
