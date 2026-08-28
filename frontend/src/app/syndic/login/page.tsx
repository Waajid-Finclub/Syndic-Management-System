"use client";

/**
 * Syndic Admin sign-in — layer 2.
 *
 * Reuses the operator console's login stylesheet so the three surfaces read as
 * one product, and differs only where it must: the copy names the syndic
 * console, and a failed sign-in that turns out to be a co-owner or an operator
 * account is redirected in the message rather than left as a dead end. That is
 * the single most common support call a three-surface product generates.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Building2, KeyRound, Loader2, Lock, LogIn, Mail } from "lucide-react";
import { api } from "@/lib/api";
import { useSyndicSession } from "@/lib/syndic/session";
import type { SyndicSession } from "@/lib/syndic/types";
import styles from "@/app/login/login.module.css";

export default function SyndicLoginPage() {
  const router = useRouter();
  const { session, loading: sessionLoading, reload } = useSyndicSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<{ href: string; label: string } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sessionLoading && session) router.replace("/syndic/dashboard");
  }, [session, sessionLoading, router]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setHint(null);
    try {
      await api<SyndicSession>("/api/syndic/auth/login", {
        method: "POST",
        body: { email, password },
      });
      await reload();
      router.push("/syndic/dashboard");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign in failed";
      setError(message);
      // The API says an account exists but belongs to another layer. Point at
      // the door it actually opens rather than leaving the person guessing.
      if (message.toLowerCase().includes("does not have access")) {
        setHint({ href: "/app/login", label: "Co-owner? Sign in to the resident app" });
      }
      setLoading(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.background} aria-hidden="true">
        <span className={`${styles.beam} ${styles.beamOne}`} />
        <span className={`${styles.beam} ${styles.beamTwo}`} />
        <span className={styles.grid} />
      </div>

      <section className={styles.shell} aria-label="SyndicMS syndic console sign in">
        <div className={styles.visual} aria-hidden="true">
          <div className={styles.visualHeader}>
            <div className={styles.brandMark}>
              <Building2 size={22} />
            </div>
            <div>
              <p className={styles.eyebrow}>SyndicMS</p>
              <h1 className={styles.visualTitle}>Syndic console</h1>
            </div>
          </div>

          <div className={styles.tower}>
            <div className={styles.roof} />
            {Array.from({ length: 7 }).map((_, floorIndex) => (
              <div className={styles.floor} key={floorIndex}>
                {Array.from({ length: 5 }).map((__, windowIndex) => (
                  <span
                    className={styles.window}
                    key={windowIndex}
                    style={{
                      animationDelay: `${(floorIndex * 0.18 + windowIndex * 0.11).toFixed(2)}s`,
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        <form className={styles.formPanel} onSubmit={submit}>
          <div className={styles.formHeader}>
            <div className={styles.formIcon}>
              <KeyRound size={22} />
            </div>
            <div>
              <h2 className={styles.formTitle}>Manage your development</h2>
              <p className={styles.formSubtitle}>Registry, billing, maintenance, governance</p>
            </div>
          </div>

          {error ? (
            <div className={styles.error}>
              {error}
              {hint ? (
                <>
                  {" "}
                  <Link className="underline font-semibold" href={hint.href}>
                    {hint.label}
                  </Link>
                </>
              ) : null}
            </div>
          ) : null}

          <label className="label" htmlFor="email">
            Email
          </label>
          <div className={styles.input}>
            <Mail size={15} />
            <input
              autoComplete="email"
              id="email"
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="manager@syndicms.mu"
              required
              type="email"
              value={email}
            />
          </div>

          <label className="label" htmlFor="password">
            Password
          </label>
          <div className={`${styles.input} ${styles.passwordInput}`}>
            <Lock size={15} />
            <input
              autoComplete="current-password"
              id="password"
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </div>

          <button className={styles.submit} disabled={loading} type="submit">
            {loading ? <Loader2 className={styles.spinner} size={16} /> : <LogIn size={16} />}
            {loading ? "Signing in..." : "Sign in"}
          </button>

          <p className="mt-4 text-center text-xs font-medium text-[var(--cmt)]">
            Accounts here are provisioned by the platform operator.
            <br />
            Co-owners sign in at{" "}
            <Link className="font-semibold text-[var(--cr)] underline" href="/app/login">
              the resident app
            </Link>
            .
          </p>
        </form>
      </section>
    </main>
  );
}
