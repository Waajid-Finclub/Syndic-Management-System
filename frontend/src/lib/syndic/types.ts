/** Types for the Syndic Admin console — layer 2 of the platform. */

export type SyndicMatrix = Record<string, string[]>;

export type SyndicUser = {
  id: number;
  name: string;
  initials: string;
  email: string;
  phone: string | null;
  role: string;
  role_display: string;
  status: string;
  layer: string | null;
  development_id: number | null;
  mfa_enabled: boolean;
  whatsapp_enabled: boolean;
  last_login_at: string | null;
  permissions?: SyndicMatrix;
  /** True while a platform super admin is in a support session. */
  impersonating?: boolean;
};

export type DevelopmentSettings = {
  id: number;
  development_id: number;
  currency_code: string;
  timezone: string;
  billing_day: number;
  arrears_grace_days: number;
  penalty_rate_percent: number | null;
  allow_online_payments: boolean;
  allow_resident_voting: boolean;
};

export type SyndicDevelopment = {
  id: number;
  code: string;
  name: string;
  location: string | null;
  development_type: string;
  status: string;
  unit_count: number;
  settings: DevelopmentSettings | null;
  plan_name: string | null;
  admin_seats: number;
};

export type SyndicSession = {
  user: SyndicUser;
  development: SyndicDevelopment;
  permissions: SyndicMatrix;
};

// --- Overview ---------------------------------------------------------------

/** The dashboard's compact arrears row: owners are names only. */
export type ArrearsSummaryRow = {
  unit_id: number;
  unit_label: string | null;
  balance: number;
  overdue: number;
  days_overdue: number;
  owners: string[];
};

export type OwnerContact = {
  user_id: number | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  percent: number;
  is_primary_contact: boolean;
};

/** The finance screen's arrears row, which needs someone to actually contact. */
export type ArrearsRow = {
  unit_id: number;
  unit_label: string | null;
  balance: number;
  overdue: number;
  invoice_count: number;
  days_overdue: number;
  owners: OwnerContact[];
};

export type SyndicOverview = {
  development: { id: number; name: string; code: string; location: string | null; status: string };
  kpis: {
    units: number;
    total_shares: number;
    co_owner_accounts: number;
    units_with_owner: number;
    outstanding: number;
    overdue: number;
    overdue_units: number;
    collected_this_month: number;
    collection_rate: number;
    open_requests: number;
    urgent_requests: number;
  };
  arrears_top: ArrearsSummaryRow[];
  recent_requests: MaintenanceRow[];
  funds: Fund[];
  upcoming_meetings: Meeting[];
  recent_announcements: Announcement[];
  last_billing_run: BillingRun | null;
  today: { bookings: number; visitors: number };
};

// --- Registry ---------------------------------------------------------------

export type ShareSummary = {
  allocated: number;
  target: number;
  remaining: number;
  is_balanced: boolean;
};

export type Block = { id: number; name: string; floors: number; unit_count?: number };

export type UnitOwner = {
  user_id: number | null;
  name: string | null;
  email: string | null;
  percent: number;
  is_primary_contact: boolean;
};

export type UnitRow = {
  id: number;
  label: string;
  unit_type: string;
  floor: number | null;
  area_sqm: number | null;
  share_value: number;
  total_shares: number;
  share_percent: number;
  monthly_charge: number;
  block_id: number | null;
  block_name: string | null;
  owners: UnitOwner[];
  occupants: { id: number; name: string; phone: string | null; lease_end_date: string | null }[];
  balance: number;
  parking_codes: string[];
  storage_codes: string[];
};

export type UnitsResponse = { units: UnitRow[]; shares: ShareSummary };

export type ParkingBay = {
  id: number;
  code: string;
  level: string | null;
  unit_id: number | null;
  unit_label: string | null;
  allocation: string;
  status: string;
  is_ev: boolean;
  charger_kw: number | null;
  charger_type: string | null;
  tariff_per_kwh: number | null;
};

export type StorageRow = {
  id: number;
  code: string;
  level: string | null;
  unit_id: number | null;
  unit_label: string | null;
  area_sqm: number | null;
  allocation: string;
  access_method: string | null;
  status: string;
};

export type FacilityRow = {
  id: number;
  name: string;
  facility_type: string;
  hours_label: string | null;
  detail: string | null;
  rules: string | null;
  booking_required: boolean;
  capacity: number | null;
  slot_hours: number;
  booking_rate: number | null;
  booking_rate_label: string | null;
  status: string;
};

export type RegistryMeta = {
  unit_types: string[];
  allocation_types: string[];
  facility_types: { key: string; label: string }[];
  share_target: number;
};

// --- Co-owners --------------------------------------------------------------

export type CoOwnerUnit = {
  unit_id: number;
  unit_label: string | null;
  share_value: number;
  percent: number;
  is_primary_contact: boolean;
};

export type CoOwnerAccount = {
  id: number;
  name: string;
  initials: string;
  email: string;
  phone: string | null;
  status: string;
  unit_label: string | null;
  whatsapp_enabled: boolean;
  last_login_at: string | null;
  created_at: string | null;
  units: CoOwnerUnit[];
};

export type InvitationRow = {
  id: number;
  email: string;
  code: string;
  status: string;
  state: string;
  unit_id: number;
  unit_label: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  ownership_percent: number;
  is_primary_contact: boolean;
  invited_by_label: string | null;
  attempts: number;
  is_expired: boolean;
  is_usable: boolean;
  accepted_at: string | null;
  created_at: string | null;
  expires_at: string | null;
};

export type AllocatableUnit = {
  id: number;
  label: string;
  unit_type: string;
  share_value: number;
  has_owner: boolean;
};

export type CoOwnersResponse = {
  co_owners: CoOwnerAccount[];
  invitations: InvitationRow[];
  units: AllocatableUnit[];
  counts: {
    accounts: number;
    active: number;
    suspended: number;
    pending_invitations: number;
    units: number;
    units_without_owner: number;
  };
  csv_columns: string[];
};

export type ImportError = { row: number; message: string };

export type ImportResult = {
  imported: number;
  valid_count: number;
  errors: ImportError[];
  preview?: {
    row: number;
    unit_label: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    ownership_percent: number;
  }[];
  dry_run?: boolean;
};

export type Occupancy = {
  id: number;
  unit_id: number;
  unit_label: string | null;
  user_name: string;
  occupant_name: string | null;
  occupant_email: string | null;
  occupant_phone: string | null;
  lease_start_date: string | null;
  lease_end_date: string | null;
  is_current: boolean;
};

// --- Finance ----------------------------------------------------------------

export type AgingBucket = { key: string; label: string; amount: number; count: number };

export type Fund = {
  id: number;
  name: string;
  fund_type: string;
  balance: number;
  target_balance: number | null;
};

export type BillingRun = {
  id: number;
  period_month: string;
  period_label: string;
  basis: string;
  budget_amount: number | null;
  issue_date: string | null;
  due_date: string | null;
  invoice_count: number;
  total_amount: number;
  status: string;
  run_by_label: string | null;
  created_at: string | null;
};

export type BillingPreview = {
  period_month: string;
  period_label: string;
  basis: string;
  budget_amount: number | null;
  issue_date: string;
  due_date: string;
  rows: {
    unit_id: number;
    unit_label: string;
    shares: number;
    amount: number;
    description: string;
  }[];
  total: number;
  already_run: BillingRun | null;
};

export type FinanceSummary = {
  totals: {
    billed: number;
    collected: number;
    outstanding: number;
    overdue: number;
    collection_rate: number;
    collected_this_month: number;
    open_invoices: number;
    overdue_invoices: number;
  };
  aging: AgingBucket[];
  invoice_types: { key: string; label: string }[];
  billing_basis: { key: string; label: string; description: string }[];
  runs: BillingRun[];
  funds: Fund[];
  fund_types: string[];
};

export type InvoiceRow = {
  id: number;
  reference: string;
  title: string;
  invoice_type: string;
  period_label: string | null;
  issue_date: string | null;
  due_date: string | null;
  total_amount: number;
  amount_paid: number;
  balance: number;
  status: string;
  display_status: string;
  is_overdue: boolean;
  unit_id: number;
  unit_label: string | null;
  billing_run_id: number | null;
  dispute_reason: string | null;
};

export type PaymentRow = {
  id: number;
  reference: string;
  amount: number;
  method_label: string | null;
  status: string;
  gateway_name: string | null;
  failure_reason: string | null;
  paid_at: string | null;
  unit_id: number;
  unit_label: string | null;
  payer_name: string | null;
  allocations: {
    invoice_id: number;
    invoice_reference: string | null;
    invoice_title: string | null;
    amount: number;
  }[];
};

// --- Operations -------------------------------------------------------------

export type MaintenanceRow = {
  id: number;
  reference: string;
  category: string;
  category_label: string;
  title: string;
  location_label: string | null;
  priority: string;
  status: string;
  status_label: string;
  is_open: boolean;
  vendor_id: number | null;
  vendor_name: string | null;
  eta_label: string | null;
  scheduled_for: string | null;
  created_at: string | null;
  unit_label: string | null;
  photo_count: number;
  reported_by_name?: string | null;
  message_count?: number;
};

export type MaintenanceDetail = MaintenanceRow & {
  description: string | null;
  timeline: {
    key: string;
    label: string;
    detail: string | null;
    occurred_at: string | null;
    done: boolean;
  }[];
  photos: { id: number; filename: string; url: string }[];
  messages: {
    id: number;
    author_label: string;
    author_role: string;
    body: string;
    created_at: string | null;
  }[];
  rating: number | null;
  rating_comment: string | null;
};

export type VendorRow = {
  id: number;
  name: string;
  trade: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  rating: number | null;
  completed_jobs: number;
  status: string;
  is_shared: boolean;
  open_jobs: number;
};

export type MaintenanceMeta = {
  categories: { key: string; label: string; icon: string }[];
  priorities: { key: string; label: string }[];
  statuses: { key: string; label: string; sequence: number }[];
  vendors: VendorRow[];
};

// --- Governance -------------------------------------------------------------

export type Meeting = {
  id: number;
  reference: string;
  title: string;
  meeting_type: string;
  type_label: string;
  scheduled_for: string | null;
  location: string | null;
  status: string;
  is_voting_open: boolean;
  voting_closes_at: string | null;
  quorum_note: string | null;
  whatsapp_sent: boolean;
  resolution_count: number;
  participation?: { total_shares: number; represented_shares: number; percent: number };
  resolutions?: ResolutionRow[];
};

export type ResolutionRow = {
  id: number;
  sequence: number;
  title: string;
  description: string | null;
  majority_type: string;
  article_ref: string | null;
  outcome: string | null;
  tally: { for: number; against: number; abstain: number };
  shares_cast: number;
  total_shares: number;
  turnout_percent: number;
  threshold_percent: number;
  threshold_basis: string;
  in_favour_percent: number;
  would_pass: boolean;
};

export type GovernanceMeta = {
  meeting_types: { key: string; label: string }[];
  meeting_statuses: string[];
  majority_types: { key: string; label: string; article: string }[];
  total_shares: number;
};

// --- Community --------------------------------------------------------------

export type Announcement = {
  id: number;
  title: string;
  body: string | null;
  priority: string;
  author_label: string | null;
  whatsapp_sent: boolean;
  published_at: string | null;
};

export type BookingRow = {
  id: number;
  facility_id: number;
  facility_name: string | null;
  booking_date: string | null;
  slot_label: string;
  status: string;
  amount: number;
  unit_label: string | null;
  booked_by: string | null;
};

export type VisitorRow = {
  id: number;
  visitor_name: string;
  vehicle_registration: string | null;
  purpose: string;
  expected_at: string | null;
  parking_label: string;
  access_code: string;
  access_pin: string;
  status: string;
  unit_label: string | null;
  host: string | null;
};

export type DocumentRow = {
  id: number;
  folder_id: number;
  title: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  version_label: string | null;
  uploaded_at: string | null;
  unit_id: number | null;
  unit_label: string | null;
  url: string;
};

export type DocumentFolderRow = {
  id: number;
  name: string;
  category: string;
  is_private: boolean;
  document_count: number;
  documents: DocumentRow[];
};

// --- Team -------------------------------------------------------------------

export type Seats = {
  allowed: number;
  used: number;
  remaining: number;
  plan_name: string | null;
  is_overridden: boolean;
};

export type TeamMember = {
  id: number;
  name: string;
  initials: string;
  email: string;
  phone: string | null;
  role: string;
  role_display: string;
  status: string;
  mfa_enabled: boolean;
  last_login_at: string | null;
  permissions: SyndicMatrix;
  has_overrides: boolean;
  is_self: boolean;
};

export type RoleDefinition = { key: string; label: string; summary: string };

export type TeamResponse = {
  team: TeamMember[];
  seats: Seats;
  roles: RoleDefinition[];
  grantable_roles: RoleDefinition[];
  catalog: {
    modules: { key: string; label: string; group: string; capabilities: string[] }[];
    capabilities: { key: string; label: string; description: string }[];
    groups: string[];
    roles: RoleDefinition[];
  };
};

// --- Settings ---------------------------------------------------------------

export type SettingsResponse = {
  development: {
    id: number;
    code: string;
    name: string;
    development_type: string;
    address_line_1: string | null;
    address_line_2: string | null;
    city: string | null;
    district: string | null;
    country: string;
    status: string;
    syndic_manager_name: string | null;
    syndic_manager_email: string | null;
    unit_count: number;
    whatsapp_enabled: boolean;
  };
  settings: DevelopmentSettings;
  subscription: {
    plan_name: string | null;
    status: string | null;
    admin_seats: number;
    monthly_unit_rate: number;
    mrr: number;
  };
  operator_controlled: string[];
};
