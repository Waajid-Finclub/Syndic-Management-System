"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Rocket, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import type { User } from "@/lib/types";

export default function SetupPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function checkSetup() {
      const status = await api<{ setup_complete: boolean }>("/api/auth/check-setup").catch(() => null);
      if (status?.setup_complete) {
        router.replace("/login");
        return;
      }
      setChecking(false);
    }

    void checkSetup();
  }, [router]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError(null);

    try {
      await api<{ user: User }>("/api/setup/init", {
        method: "POST",
        body: {
          first_name: form.get("first_name"),
          last_name: form.get("last_name"),
          email: form.get("email"),
          password: form.get("password"),
        },
      });
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed");
    } finally {
      setSaving(false);
    }
  }

  if (checking) {
    return (
      <main className="grid min-h-screen place-items-center">
        <div className="loading-line">Checking platform status...</div>
      </main>
    );
  }

  return (
    <main className="grid min-h-screen place-items-center p-7">
      <section className="w-full max-w-[540px]">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-[14px] bg-[var(--cr)] text-white">
            <Rocket size={22} />
          </span>
          <div>
            <h1 className="text-[26px] font-extrabold leading-tight tracking-[-0.02em] text-[var(--ct)]">
              Set up SyndicMS
            </h1>
            <p className="mt-1 text-xs font-semibold text-[var(--cmt)]">
              Create the first super admin for the platform
            </p>
          </div>
        </div>

        <form className="section" onSubmit={submit}>
          <div className="section__header">
            <div>
              <h2 className="section__title">First administrator</h2>
              <p className="section__sub">This account has full control of every client property</p>
            </div>
            <ShieldCheck className="text-[var(--cr)]" size={18} />
          </div>

          <div className="section__body">
            {error ? <div className="notice notice--er">{error}</div> : null}

            <div className="form-grid">
              <div>
                <label className="label" htmlFor="first_name">
                  First name
                </label>
                <input className="field" id="first_name" name="first_name" required />
              </div>
              <div>
                <label className="label" htmlFor="last_name">
                  Last name
                </label>
                <input className="field" id="last_name" name="last_name" />
              </div>
            </div>

            <div className="mt-4">
              <label className="label" htmlFor="email">
                Email
              </label>
              <input className="field" id="email" name="email" required type="email" />
            </div>

            <div className="mt-4">
              <label className="label" htmlFor="password">
                Password
              </label>
              <input className="field" id="password" minLength={10} name="password" required type="password" />
              <p className="mt-2 text-[11px] font-semibold text-[var(--cmt)]">At least 10 characters.</p>
            </div>
          </div>

          <div className="modal__footer">
            <button className="btn btn-primary" disabled={saving} type="submit">
              {saving ? <Loader2 className="animate-spin" size={14} /> : <Rocket size={14} />}
              {saving ? "Creating..." : "Create administrator"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
