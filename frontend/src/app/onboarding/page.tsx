"use client";

import { useState } from "react";
import { Check, Circle, CircleDot, ListChecks, PartyPopper } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { StatusPill } from "@/components/status-pill";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { canEdit } from "@/lib/permissions";
import type { OnboardingResponse, OnboardingStep, User } from "@/lib/types";

export default function OnboardingPage() {
  const session = useApi<{ user: User | null }>("/api/auth/me");
  const onboarding = useApi<OnboardingResponse>("/api/onboarding/");
  const [busyStep, setBusyStep] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const user = session.data?.user ?? null;
  const editable = canEdit(user, "onboarding");
  const data = onboarding.data;

  async function cycleStep(step: OnboardingStep) {
    if (!editable || busyStep) return;
    const next = step.status === "done" ? "pending" : "done";
    setBusyStep(step.id);
    setError(null);
    try {
      await api(`/api/onboarding/steps/${step.id}`, { method: "PATCH", body: { status: next } });
      await onboarding.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the step");
    } finally {
      setBusyStep(null);
    }
  }

  return (
    <AppShell>
      <PageHeader
        title="Onboarding Workflow"
        subtitle="Implementation progress for every client property not yet fully live"
      />

      {error ? <div className="notice notice--er">{error}</div> : null}
      {onboarding.error ? <div className="notice notice--er">{onboarding.error}</div> : null}

      {data?.promo ? (
        <div className="notice notice--ok">
          <PartyPopper size={17} />
          <div>
            <div className="notice__title">{data.promo.headline}</div>
            <div className="notice__sub">{data.promo.detail}</div>
          </div>
        </div>
      ) : null}

      {onboarding.loading && !data ? <div className="loading-line">Loading onboarding pipeline...</div> : null}

      {data?.clients.map((client) => (
        <Section
          key={client.id}
          title={client.name}
          subtitle={`Current stage: ${client.stage_label}`}
          action={<StatusPill value={client.status} />}
        >
          <div className="mb-4 flex items-center gap-3">
            <div className="progress-track">
              <div className="progress-track__fill" style={{ width: `${client.percent}%` }} />
            </div>
            <span className="text-xs font-extrabold text-[var(--cr)]">{client.percent}%</span>
          </div>

          <div className="step-grid">
            {client.steps.map((step) => {
              const StepIcon = step.status === "done" ? Check : step.status === "current" ? CircleDot : Circle;
              return (
                <button
                  className={`step-chip step-chip--${step.status}`}
                  disabled={!editable || busyStep === step.id}
                  key={step.id}
                  onClick={() => cycleStep(step)}
                  title={editable ? "Toggle this stage" : "You do not have permission to change onboarding"}
                  type="button"
                >
                  <StepIcon size={12} />
                  {step.title}
                </button>
              );
            })}
          </div>
        </Section>
      ))}

      {data && !data.clients.length ? (
        <Section title="Onboarding Workflow">
          <EmptyState message="Every client property is fully live" />
        </Section>
      ) : null}

      {data ? (
        <Section
          title="Onboarding checklist template"
          subtitle="The standard implementation run performed for each new client"
          action={<ListChecks className="text-[var(--cr)]" size={17} />}
        >
          {data.checklist_template.map((item, index) => (
            <div className="checklist-row" key={item}>
              <span className="checklist-row__index">{index + 1}.</span>
              <span>{item}</span>
            </div>
          ))}
        </Section>
      ) : null}

      {data && !data.clients.length && !data.checklist_template.length ? (
        <EmptyState message="No onboarding data" />
      ) : null}

      {!data && !onboarding.loading ? (
        <Section title="Onboarding">
          <EmptyState message="No onboarding data available" />
        </Section>
      ) : null}
    </AppShell>
  );
}
