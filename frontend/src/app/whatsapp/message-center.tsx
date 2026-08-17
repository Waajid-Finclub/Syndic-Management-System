"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCheck,
  CircleSlash,
  Coins,
  History,
  Loader2,
  MessageSquare,
  ScrollText,
  Send,
  ShieldAlert,
  TestTube2,
  Users,
} from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Modal } from "@/components/modal";
import { Section } from "@/components/section";
import { SelectMenu } from "@/components/select-menu";
import { MetricTile, StatCard } from "@/components/stat-card";
import { StatusPill } from "@/components/status-pill";
import { api } from "@/lib/api";
import { compactMoney, formatDateTime, money, number, relativeTime, titleCase } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type {
  AuditEntry,
  WhatsAppAudienceSummary,
  WhatsAppCenterResponse,
  WhatsAppCenterTemplate,
  WhatsAppDispatchResult,
  WhatsAppMessagesResponse,
} from "@/lib/types";
import { TemplateSelect } from "./template-select";

const PLACEHOLDER_PATTERN = /{{\s*([A-Za-z0-9_]+)\s*}}/g;
const ALL_PROPERTIES = "";

/** Split a template body into literal text and its {{placeholder}} tokens. */
function bodyParts(body: string) {
  const parts: { text: string; token: string | null }[] = [];
  let cursor = 0;

  for (const match of body.matchAll(PLACEHOLDER_PATTERN)) {
    const start = match.index ?? 0;
    if (start > cursor) parts.push({ text: body.slice(cursor, start), token: null });
    parts.push({ text: match[0], token: match[1] });
    cursor = start + match[0].length;
  }
  if (cursor < body.length) parts.push({ text: body.slice(cursor), token: null });

  return parts;
}

export function MessageCenter({ onSent }: { onSent?: () => void }) {
  const center = useApi<WhatsAppCenterResponse>("/api/whatsapp/center");

  const [templateId, setTemplateId] = useState<number | null>(null);
  const [audience, setAudience] = useState("all_residents");
  const [developmentId, setDevelopmentId] = useState(ALL_PROPERTIES);
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [testMode, setTestMode] = useState(false);
  const [testNumber, setTestNumber] = useState("");

  const [confirming, setConfirming] = useState(false);
  const [viewing, setViewing] = useState<"dispatches" | "messages" | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WhatsAppDispatchResult | null>(null);

  const data = center.data;
  const template = data?.templates.find((entry) => entry.id === templateId) ?? null;

  const scopeQuery = developmentId ? `&development_id=${developmentId}` : "";
  const preview = useApi<WhatsAppAudienceSummary>(
    template && !testMode ? `/api/whatsapp/audience?audience=${audience}${scopeQuery}` : null,
  );

  const filled = useMemo(() => {
    if (!template?.body) return "";
    return template.body.replace(PLACEHOLDER_PATTERN, (token, name: string) =>
      variables[name]?.trim() ? variables[name].trim() : token,
    );
  }, [template, variables]);

  const missing = (template?.placeholders ?? []).filter((name) => !variables[name]?.trim());
  const recipients = testMode ? (testNumber.trim() ? 1 : 0) : preview.data?.reachable ?? 0;
  const cost = recipients * (template?.cost_per_message ?? 0);
  const blocked = blockingReason();

  function blockingReason() {
    if (!data?.can_send) return "Your role may view the centre but not trigger sends";
    if (!template) return "Pick a template to trigger";
    if (!template.can_send) return `'${template.name}' is awaiting Meta approval`;
    if (missing.length) return `Fill in ${missing.length} placeholder${missing.length === 1 ? "" : "s"}`;
    if (testMode && !testNumber.trim()) return "Enter a test number";
    if (!testMode && !recipients) return "Nobody in this audience is reachable on WhatsApp";
    return null;
  }

  function chooseTemplate(next: WhatsAppCenterTemplate) {
    setTemplateId(next.id);
    setVariables({});
    setResult(null);
    setError(null);
  }

  async function send() {
    if (!template) return;
    setSending(true);
    setError(null);

    try {
      const outcome = await api<WhatsAppDispatchResult>("/api/whatsapp/dispatch", {
        method: "POST",
        body: {
          template_id: template.id,
          audience: testMode ? null : audience,
          development_id: developmentId ? Number(developmentId) : null,
          test_number: testMode ? testNumber.trim() : null,
          variables,
        },
      });
      setResult(outcome);
      setConfirming(false);
      await center.reload();
      await preview.reload();
      onSent?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not trigger the message");
      setConfirming(false);
    } finally {
      setSending(false);
    }
  }

  const stats = data?.stats ?? null;
  const today = data?.today;
  const propertyOptions = (data?.developments ?? []).map((entry) => ({
    value: String(entry.id),
    label: entry.name,
  }));
  const audienceOptions = (data?.audiences ?? []).map((entry) => ({
    value: entry.key,
    label: entry.label,
  }));
  const audienceNote = data?.audiences.find((entry) => entry.key === audience)?.description;

  return (
    <>
      {center.error ? <div className="notice notice--er">{center.error}</div> : null}
      {center.loading && !data ? <div className="loading-line">Loading the message centre...</div> : null}

      {today ? (
        <div className="kpi-grid">
          <StatCard icon={Send} label="Triggered today" value={number(today.sent)} sub="Logged dispatches" />
          <StatCard icon={Users} label="Numbers reached today" value={number(today.recipients)} sub="Distinct recipients" />
          <StatCard icon={CircleSlash} label="Rejected today" value={number(today.failed)} sub="Unusable numbers" />
          <StatCard
            icon={MessageSquare}
            label="Month to date"
            value={number(stats?.total_sent)}
            sub={stats?.period_month ?? "-"}
          />
          <StatCard icon={Coins} label="Month cost" value={compactMoney(stats?.monthly_cost)} sub="Meta Cloud API" />
        </div>
      ) : null}

      {data ? (
        <div className="toolbar">
          <button className="btn btn-secondary" onClick={() => setViewing("dispatches")} type="button">
            <History size={13} />
            Recent dispatches
            <span className="chip">{data.recent_dispatches.length}</span>
          </button>
          <button className="btn btn-secondary" onClick={() => setViewing("messages")} type="button">
            <ScrollText size={13} />
            Message log
          </button>
        </div>
      ) : null}

      <Section
        title="Trigger a message"
        subtitle="Pick an approved template, choose who receives it, then dispatch"
        action={<span className="chip">{(data?.templates ?? []).filter((entry) => entry.can_send).length} ready</span>}
      >
        {data && !data.templates.length ? (
          <EmptyState message="No templates registered" />
        ) : (
          <>
            <TemplateSelect onChange={chooseTemplate} templates={data?.templates ?? []} value={templateId} />
            {template ? (
              <div className="wa-meta">
                <span className="wa-meta__item">
                  <StatusPill value={template.status} />
                </span>
                <span className="wa-meta__item">{template.category}</span>
                <span className="wa-meta__item">
                  {template.placeholders.length} variable{template.placeholders.length === 1 ? "" : "s"}
                </span>
                <span className="wa-meta__item">{money(template.cost_per_message)} / message</span>
                <span className="wa-meta__item">{number(template.sent_30d)} sent in 30d</span>
              </div>
            ) : null}
          </>
        )}
      </Section>

      {template ? (
        <div className="split-grid">
          <Section title="Message setup" subtitle={`Composing '${template.name}'`}>
            <div className="wa-toggle-row">
              <button
                className={`wa-mode ${testMode ? "" : "is-active"}`}
                onClick={() => setTestMode(false)}
                type="button"
              >
                <Users size={13} />
                Send to an audience
              </button>
              <button
                className={`wa-mode ${testMode ? "is-active" : ""}`}
                onClick={() => setTestMode(true)}
                type="button"
              >
                <TestTube2 size={13} />
                Test to one number
              </button>
            </div>

            {testMode ? (
              <div className="mt-4">
                <label className="label" htmlFor="wa-test-number">
                  Test number
                </label>
                <input
                  className="field"
                  id="wa-test-number"
                  onChange={(event) => setTestNumber(event.target.value)}
                  placeholder="+230 5xxx xxxx"
                  value={testNumber}
                />
                <p className="wa-hint">
                  Goes to this number only. Nothing is charged to the audience and no resident is contacted.
                </p>
              </div>
            ) : (
              <div className="form-grid mt-4">
                <div>
                  <label className="label">Audience</label>
                  <SelectMenu
                    ariaLabel="Audience"
                    fullWidth
                    onChange={setAudience}
                    options={audienceOptions}
                    shape="field"
                    value={audience}
                  />
                  {audienceNote ? <p className="wa-hint">{audienceNote}</p> : null}
                </div>
                <div>
                  <label className="label">Property scope</label>
                  <SelectMenu
                    ariaLabel="Property scope"
                    fullWidth
                    onChange={setDevelopmentId}
                    options={propertyOptions}
                    placeholder="All properties"
                    shape="field"
                    value={developmentId}
                  />
                  <p className="wa-hint">Leave on all properties for a platform-wide notice.</p>
                </div>
              </div>
            )}

            {template.placeholders.length ? (
              <>
                <div className="wa-divider">Template variables</div>
                <div className="form-grid">
                  {template.placeholders.map((name) => (
                    <div key={name}>
                      <label className="label" htmlFor={`wa-var-${name}`}>
                        {titleCase(name)}
                      </label>
                      <input
                        className="field"
                        id={`wa-var-${name}`}
                        onChange={(event) =>
                          setVariables((current) => ({ ...current, [name]: event.target.value }))
                        }
                        placeholder={`{{${name}}}`}
                        value={variables[name] ?? ""}
                      />
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="wa-hint mt-4">This template has no variables — it sends exactly as written.</p>
            )}
          </Section>

          <Section title="Preview & dispatch" subtitle="Exactly what each recipient receives">
            <div className="wa-preview">
              <div className="wa-bubble">
                {bodyParts(filled).map((part, index) =>
                  part.token ? (
                    <span className="wa-token" key={`${part.token}-${index}`}>
                      {part.text}
                    </span>
                  ) : (
                    <span key={`text-${index}`}>{part.text}</span>
                  ),
                )}
                <span className="wa-bubble__meta">
                  <CheckCheck size={11} />
                  {template.category}
                </span>
              </div>
            </div>

            <div className="wa-summary">
              <div className="wa-summary__row">
                <span>{testMode ? "Test number" : "Reachable recipients"}</span>
                <strong>{testMode ? testNumber.trim() || "-" : number(recipients)}</strong>
              </div>
              {!testMode && preview.data ? (
                <>
                  <div className="wa-summary__row">
                    <span>In scope</span>
                    <strong>{number(preview.data.in_scope)}</strong>
                  </div>
                  <div className="wa-summary__row">
                    <span>Opted in to WhatsApp</span>
                    <strong>{number(preview.data.opted_in)}</strong>
                  </div>
                </>
              ) : null}
              <div className="wa-summary__row">
                <span>Estimated cost</span>
                <strong>{money(cost)}</strong>
              </div>
            </div>

            {!testMode && preview.data && preview.data.opted_in > preview.data.reachable ? (
              <div className="notice notice--warn">
                <AlertTriangle size={15} />
                <div>
                  <div className="notice__title">
                    {preview.data.opted_in - preview.data.reachable} opted-in without a number
                  </div>
                  <div className="notice__sub">
                    They are skipped until a WhatsApp number is on their account.
                  </div>
                </div>
              </div>
            ) : null}

            {error ? <div className="notice notice--er">{error}</div> : null}

            {result ? (
              <div className="notice notice--ok">
                <CheckCheck size={15} />
                <div>
                  <div className="notice__title">
                    {result.sent} sent{result.failed ? `, ${result.failed} rejected` : ""} · {money(result.cost)}
                  </div>
                  <div className="notice__sub">{result.detail}</div>
                </div>
              </div>
            ) : null}

            <button
              className="btn btn-primary w-full"
              disabled={Boolean(blocked) || sending}
              onClick={() => setConfirming(true)}
              title={blocked ?? "Trigger this message"}
              type="button"
            >
              {sending ? <Loader2 className="animate-spin" size={13} /> : <Send size={13} />}
              {sending ? "Dispatching..." : "Trigger message"}
            </button>
            {blocked ? <p className="wa-hint wa-hint--center">{blocked}</p> : null}

            {!testMode && preview.data?.sample.length ? (
              <>
                <div className="wa-divider">Recipient sample</div>
                {preview.data.sample.map((person) => (
                  <div className="number-row" key={person.id}>
                    <span className={`number-row__icon ${person.reachable ? "" : "number-row__icon--off"}`}>
                      <MessageSquare size={15} />
                    </span>
                    <div className="number-row__copy">
                      <div className="number-row__name">{person.name}</div>
                      <div className="number-row__phone">{person.phone ?? "No number on file"}</div>
                    </div>
                    <span className="chip">{person.scope_label}</span>
                    {person.reason ? <span className="pill pill--blocked">{person.reason}</span> : null}
                  </div>
                ))}
              </>
            ) : null}
          </Section>
        </div>
      ) : null}

      {viewing === "dispatches" ? (
        <DispatchLogModal entries={data?.recent_dispatches ?? []} onClose={() => setViewing(null)} />
      ) : null}

      {viewing === "messages" ? <MessageLogModal onClose={() => setViewing(null)} /> : null}

      {confirming && template ? (
        <Modal
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setConfirming(false)} type="button">
                Cancel
              </button>
              <button className="btn btn-primary" disabled={sending} onClick={send} type="button">
                {sending ? <Loader2 className="animate-spin" size={13} /> : <Send size={13} />}
                {sending ? "Dispatching..." : `Send to ${number(recipients)}`}
              </button>
            </>
          }
          icon={<ShieldAlert size={17} />}
          onClose={() => setConfirming(false)}
          subtitle="This cannot be recalled once dispatched"
          title="Confirm dispatch"
        >
          <div className="metric-strip">
            <MetricTile center label="Template" value={template.name} />
            <MetricTile
              center
              label={testMode ? "Test number" : "Recipients"}
              value={testMode ? testNumber.trim() : number(recipients)}
            />
            <MetricTile center label="Cost" value={money(cost)} />
          </div>
          <div className="wa-preview mt-4">
            <div className="wa-bubble">{filled}</div>
          </div>
          {!testMode ? (
            <div className="notice notice--warn mt-4">
              <AlertTriangle size={15} />
              <div>
                <div className="notice__title">
                  {preview.data?.label} · {developmentId ? propertyOptions.find((option) => option.value === developmentId)?.label : "All properties"}
                </div>
                <div className="notice__sub">
                  Every reachable recipient in this audience receives the message above.
                </div>
              </div>
            </div>
          ) : null}
        </Modal>
      ) : null}
    </>
  );
}

/** Every console-triggered send, read back off the audit trail. */
function DispatchLogModal({ entries, onClose }: { entries: AuditEntry[]; onClose: () => void }) {
  return (
    <Modal
      icon={<History size={17} />}
      onClose={onClose}
      subtitle="Every trigger is written to the audit log as it happens"
      title="Recent dispatches"
      wide
    >
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Triggered by</th>
              <th>Property</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td className="mono">{formatDateTime(entry.occurred_at)}</td>
                <td className="bold color-cr">{entry.user_label}</td>
                <td>{entry.development_label}</td>
                <td className="wrap">{entry.detail}</td>
              </tr>
            ))}
            {entries.length ? null : (
              <tr>
                <td className="empty-cell" colSpan={4}>
                  Nothing dispatched from the console yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

/** The outbound message log, fetched on open rather than with the dashboard. */
function MessageLogModal({ onClose }: { onClose: () => void }) {
  const log = useApi<WhatsAppMessagesResponse>("/api/whatsapp/messages?limit=100");
  const messages = log.data?.messages ?? [];

  return (
    <Modal
      icon={<ScrollText size={17} />}
      onClose={onClose}
      subtitle={
        log.data
          ? `${number(messages.length)} of ${number(log.data.total)} logged against resident accounts`
          : "Outbound messages logged against resident accounts"
      }
      title="Message log"
      wide
    >
      {log.error ? <div className="notice notice--er">{log.error}</div> : null}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Sent</th>
              <th>Template</th>
              <th>Recipient</th>
              <th>Number</th>
              <th>Property</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {messages.map((message) => (
              <tr key={message.id}>
                <td>{relativeTime(message.created_at)}</td>
                <td className="mono bold color-cr">{message.template_name}</td>
                <td>{message.recipient_name ?? "Test send"}</td>
                <td className="mono">{message.to_number}</td>
                <td>{message.development_name ?? "-"}</td>
                <td>
                  <StatusPill value={message.status} />
                </td>
              </tr>
            ))}
            {log.loading && !messages.length ? (
              <tr>
                <td className="empty-cell" colSpan={6}>
                  Loading the message log...
                </td>
              </tr>
            ) : null}
            {!log.loading && !messages.length ? (
              <tr>
                <td className="empty-cell" colSpan={6}>
                  No messages logged yet
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
