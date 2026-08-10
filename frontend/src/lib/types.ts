export type PermissionMatrix = Record<string, string[]>;

export type User = {
  id: number;
  first_name: string;
  last_name: string | null;
  name: string;
  initials: string;
  email: string;
  phone: string | null;
  role: string;
  role_display: string;
  status: string;
  development_id: number | null;
  development_name: string | null;
  unit_label: string | null;
  scope_label: string;
  mfa_enabled: boolean;
  whatsapp_enabled: boolean;
  can_access_console: boolean;
  last_login_at: string | null;
  created_at: string | null;
  permissions?: PermissionMatrix;
};

export type RoleDefinition = {
  key: string;
  label: string;
  summary: string;
};

export type RoleCount = RoleDefinition & { role: string; count: number };

export type Development = {
  id: number;
  code: string;
  name: string;
  development_type: string;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  district: string | null;
  country: string;
  location: string | null;
  status: string;
  pipeline_stage: string;
  pipeline_label: string;
  launch_date: string | null;
  syndic_manager_name: string | null;
  syndic_manager_email: string | null;
  unit_count: number;
  parking_count: number;
  ev_parking_count: number;
  storage_count: number;
  facility_count: number;
  user_count: number;
  whatsapp_enabled: boolean;
  onboarding_percent: number;
  onboarding_stage_label: string;
  created_at: string | null;
  plan_code: string | null;
  plan_name: string | null;
  mrr: number;
  subscription_status: string | null;
};

export type DevelopmentListResponse = {
  developments: Development[];
  status_counts: Record<string, number>;
  totals: {
    properties: number;
    units: number;
    parking: number;
    storage: number;
    facilities: number;
    users: number;
    mrr: number;
    avg_units: number;
  };
};

export type PlatformOverview = {
  kpis: {
    properties: number;
    units: number;
    parking: number;
    ev_parking: number;
    users: number;
    mrr: number;
    arr: number;
    uptime: string | null;
  };
  plan_mix: { code: string; name: string; clients: number }[];
  setup_fees_collected: number;
  whatsapp: WhatsAppStats | null;
  pipeline: { stage: string; label: string; count: number }[];
  revenue_trend: { id: number; period_month: string; mrr_amount: number }[];
  recent_properties: Development[];
  property_count: number;
};

export type OnboardingStep = {
  id: number;
  development_id: number;
  sequence: number;
  title: string;
  status: string;
  owner_user_id: number | null;
  due_date: string | null;
  completed_at: string | null;
};

export type OnboardingClient = {
  id: number;
  name: string;
  status: string;
  stage_label: string;
  percent: number;
  steps: OnboardingStep[];
};

export type OnboardingResponse = {
  clients: OnboardingClient[];
  checklist_template: string[];
  stages: string[];
  promo: SetupFeePromo;
};

export type SetupFeePromo = {
  headline: string;
  detail: string;
  ends_on: string;
  standard_fee: number;
};

export type SubscriptionPlan = {
  id: number;
  code: string;
  name: string;
  monthly_unit_rate: number;
  vat_rate: number;
  rate_incl_vat: number;
  setup_fee_amount: number;
  features: string[];
  is_popular: boolean;
  is_active: boolean;
  sort_order: number;
  client_count: number;
};

export type Subscription = {
  id: number;
  development_id: number;
  development_name: string | null;
  plan_id: number;
  plan_code: string | null;
  plan_name: string | null;
  setup_fee_amount: number;
  monthly_unit_rate: number;
  vat_rate: number;
  active_units_count: number;
  mrr: number;
  mrr_incl_vat: number;
  status: string;
  start_date: string | null;
  end_date: string | null;
};

export type SubscriptionResponse = {
  plans: SubscriptionPlan[];
  subscriptions: Subscription[];
  metrics: {
    mrr: number;
    arr: number;
    churn_pct: number;
    arpc: number;
    ltv: number;
    client_count: number;
  };
  promo: SetupFeePromo;
};

export type FeatureFlagOverride = {
  id: number;
  feature_flag_id: number;
  development_id: number;
  development_name: string | null;
  is_enabled: boolean;
};

export type FeatureFlag = {
  id: number;
  feature_key: string;
  description: string | null;
  is_enabled: boolean;
  scope: string;
  config_json: unknown;
  override_count: number;
  sort_order: number;
  overrides?: FeatureFlagOverride[];
};

export type SystemMetric = {
  id: number;
  metric_key: string;
  label: string;
  group_key: string;
  value_text: string;
  target_text: string | null;
  icon: string | null;
  is_ok: boolean;
  sort_order: number;
  captured_at: string | null;
};

export type SystemAlert = {
  id: number;
  message: string;
  severity: string;
  occurred_at: string | null;
};

export type MonitoringResponse = {
  metrics: SystemMetric[];
  alerts: SystemAlert[];
  all_operational: boolean;
  degraded_count: number;
};

export type AuditEntry = {
  id: number;
  occurred_at: string | null;
  user_id: number | null;
  user_label: string;
  development_id: number | null;
  development_label: string;
  action: string;
  entity: string;
  category: string;
  detail: string | null;
};

export type AuditResponse = {
  entries: AuditEntry[];
  categories: { key: string; label: string; count: number }[];
  total: number;
  retention_note: string;
};

export type WhatsAppStats = {
  id: number;
  period_month: string;
  total_sent: number;
  delivered: number;
  read: number;
  failed: number;
  queue_depth: number;
  monthly_cost: number;
  delivered_pct: number | null;
  read_pct: number | null;
  failed_pct: number | null;
};

export type WhatsAppTemplate = {
  id: number;
  name: string;
  category: string;
  status: string;
  body: string | null;
  sent_30d: number;
  delivered_pct: number | null;
  read_pct: number | null;
  cost_per_message: number;
};

export type WhatsAppNumber = {
  id: number;
  development_id: number | null;
  display_name: string;
  phone_number: string;
  status: string;
  monthly_messages: number;
};

export type WhatsAppResponse = {
  stats: WhatsAppStats | null;
  templates: WhatsAppTemplate[];
  numbers: WhatsAppNumber[];
};

export type Integration = {
  id: number;
  name: string;
  protocol: string | null;
  direction: string | null;
  status: string;
  last_sync_label: string | null;
  requests_per_day: number;
};

export type ApiKey = {
  id: number;
  name: string;
  key_prefix: string;
  created_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
  is_active: boolean;
  plaintext_key?: string;
};

export type IntegrationsResponse = {
  integrations: Integration[];
  api_metrics: SystemMetric[];
  endpoints: string[];
  api_keys: ApiKey[];
};

export type UsersResponse = {
  users: User[];
  role_counts: RoleCount[];
  roles: RoleDefinition[];
};
