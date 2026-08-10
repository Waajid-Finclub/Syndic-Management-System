"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, Lock, LogIn, Mail, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import type { User } from "@/lib/types";
import styles from "./login.module.css";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function checkSetup() {
      const status = await api<{ setup_complete: boolean }>("/api/auth/check-setup").catch(() => null);
      if (status && !status.setup_complete) router.replace("/setup");
    }

    void checkSetup();
  }, [router]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api<{ user: User }>("/api/auth/login", {
        method: "POST",
        body: { email, password },
      });
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
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

      <section className={styles.shell} aria-label="SyndicMS admin sign in">
        <div className={styles.visual} aria-hidden="true">
          <div className={styles.visualHeader}>
            <div className={styles.brandMark}>
              <ShieldCheck size={22} />
            </div>
            <div>
              <p className={styles.eyebrow}>SyndicMS</p>
              <h1 className={styles.visualTitle}>Admin console</h1>
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
                    style={{ animationDelay: `${(floorIndex * 0.18 + windowIndex * 0.11).toFixed(2)}s` }}
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
              <h2 className={styles.formTitle}>Platform sign in</h2>
              <p className={styles.formSubtitle}>Syndic Management System</p>
            </div>
          </div>

          {error ? <div className={styles.error}>{error}</div> : null}

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
              placeholder="admin@syndicms.mu"
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
        </form>
      </section>
    </main>
  );
}
