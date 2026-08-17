/**
 * Shapes returned by /api/resident/*.
 *
 * Mirrors the `to_dict()` methods on the Flask models. Where the API omits a
 * block rather than zeroing it — the finance section for a tenant, say — the
 * field is optional here too, so the compiler forces the screen to handle the
 * absence instead of rendering a balance that is not theirs to see.
 */

export type ResidentFeatures = {
  finance: boolean;
  voting: boolean;
  private_documents: boolean;
  maintenance: boolean;
  facilities: boolean;
  visitors: boolean;
  assets: boolean;
  documents: boolean;
  community: boolean;
};

export type ResidentUser = {
  id: number;
  name: string;
  first_name: string;
  last_name: string | null;
  initials: string;
  email: string;
  phone: string | null;
  role: "co_owner" | "tenant";
  role_display: string;
  status: string;
  development_name: string | null;
  unit_label: string | null;
  whatsapp_enabled: boolean;
  features: ResidentFeatures;
};

export type ResidentUnit = {
  id: number;
  label: string;
  unit_type: string;
  floor: number | null;
  area_sqm: number | null;
  block_name: string | null;
  share_value: number;
  total_shares: number;
  share_percent: number;
  monthly_charge: number;
  tenure: "owner" | "tenant";
  development: { id: number; name: string; location: string | null } | null;
};

export type ResidentPreferences = {
  language_code: string;
  push_notifications: boolean;
  whatsapp_notifications: boolean;
  email_notifications: boolean;
  sms_notifications: boolean;
};

export type ResidentSession = {
  user: ResidentUser;
  unit: ResidentUnit | null;
  preferences: ResidentPreferences;
  unread_notifications: number;
};

export type AccountSummary = {
  outstanding: number;
  overdue_amount: number;
  overdue_count: number;
  open_invoice_count: number;
  paid_ytd: number;
  ev_this_month: number;
  credit: number;
  next_due_date: string | null;
  days_until_due: number | null;
  overdue_since: string | null;
  is_overdue: boolean;
};

export type InvoiceLine = {
  id: number;
  description: string;
  quantity: number;
  unit_rate: number;
  amount: number;
};

export type InvoicePayment = {
  id: number;
  reference: string;
  amount: number;
  paid_at: string | null;
  method_label: string | null;
  status: string;
};

export type Invoice = {
  id: number;
  reference: string;
  title: string;
  invoice_type: string;
  period_label: string | null;
  issue_date: string;
  due_date: string;
  total_amount: number;
  amount_paid: number;
  balance: number;
  status: string;
  display_status: string;
  is_overdue: boolean;
  unit_label: string | null;
  dispute_reason: string | null;
  disputed_at: string | null;
  lines?: InvoiceLine[];
  payments?: InvoicePayment[];
};

export type Transaction = {
  kind: "invoice" | "payment" | "ev_session";
  id: number;
  reference: string;
  description: string;
  occurred_on: string | null;
  amount: number;
  status: string;
  invoice_type: string | null;
  link_id: number | null;
};

export type PaymentMethod = {
  id: number;
  method_type: "card" | "bank" | "wallet";
  label: string;
  detail: string | null;
  is_default: boolean;
};

export type PaymentAllocation = {
  invoice_id: number;
  invoice_reference: string | null;
  invoice_title: string | null;
  amount: number;
};

export type Payment = {
  id: number;
  reference: string;
  amount: number;
  method_label: string | null;
  status: string;
  gateway_name: string | null;
  gateway_reference: string | null;
  paid_at: string | null;
  allocations?: PaymentAllocation[];
};

export type StatementRow = {
  date: string;
  reference: string;
  description: string;
  debit: number | null;
  credit: number | null;
  balance: number;
};

export type Statement = {
  start_date: string;
  end_date: string;
  opening_balance: number;
  closing_balance: number;
  rows: StatementRow[];
};

export type ParkingBay = {
  id: number;
  code: string;
  level: string | null;
  allocation: string;
  status: string;
  is_ev: boolean;
  charger_kw: number | null;
  charger_type: string | null;
  tariff_per_kwh: number | null;
  unit_label: string | null;
  month_totals?: EvTotals;
};

export type StorageUnit = {
  id: number;
  code: string;
  level: string | null;
  area_sqm: number | null;
  allocation: string;
  access_method: string | null;
  status: string;
  unit_label: string | null;
};

export type EvTotals = {
  period: string;
  kwh: number;
  amount: number;
  session_count: number;
};

export type EvSession = {
  id: number;
  bay_code: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_label: string | null;
  kwh: number;
  rate_per_kwh: number;
  amount: number;
  vehicle_label: string | null;
  status: string;
  invoice_id: number | null;
};

export type Facility = {
  id: number;
  name: string;
  facility_type: "pool" | "gym" | "hall" | "visitor_parking" | "garden" | "roof";
  hours_label: string | null;
  detail: string | null;
  rules: string | null;
  booking_required: boolean;
  capacity: number | null;
  slot_hours: number;
  booking_rate: number | null;
  booking_rate_label: string | null;
  status: string;
  is_open: boolean | null;
  availability_note?: string;
};

export type FacilitySlot = {
  start: number;
  end: number;
  label: string;
  available: boolean;
  reason: "booked" | "past" | null;
};

export type FacilityBooking = {
  id: number;
  facility_id: number;
  facility_name: string | null;
  booking_date: string;
  slot_start: number;
  slot_end: number;
  slot_label: string;
  status: string;
  amount: number;
  unit_label: string | null;
};

export type VisitorPass = {
  id: number;
  visitor_name: string;
  vehicle_registration: string | null;
  purpose: string;
  expected_at: string;
  parking_hours: number;
  bay_code: string | null;
  parking_label: string;
  status: string;
  whatsapp_sent: boolean;
  unit_label: string | null;
  access_code?: string;
  access_pin?: string;
};

export type Announcement = {
  id: number;
  title: string;
  body: string | null;
  priority: "urgent" | "info";
  author_label: string | null;
  whatsapp_sent: boolean;
  published_at: string;
};

export type MaintenanceTimelineStep = {
  key: string;
  label: string;
  detail: string | null;
  occurred_at: string | null;
  done: boolean;
};

export type Vendor = {
  id: number;
  name: string;
  trade: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  rating: number | null;
  completed_jobs: number;
  status: string;
};

export type MaintenanceMessage = {
  id: number;
  author_label: string;
  author_role: "resident" | "syndic" | "vendor";
  body: string;
  created_at: string;
};

export type MaintenancePhoto = {
  id: number;
  filename: string;
  content_type: string | null;
  size_bytes: number;
  url: string;
};

export type MaintenanceRequest = {
  id: number;
  reference: string;
  category: string;
  category_label: string;
  title: string;
  location_label: string | null;
  priority: "low" | "normal" | "urgent" | "emergency";
  status: string;
  status_label: string;
  is_open: boolean;
  vendor_id: number | null;
  vendor_name: string | null;
  eta_label: string | null;
  scheduled_for: string | null;
  created_at: string;
  unit_label: string | null;
  photo_count: number;
  description?: string;
  timeline?: MaintenanceTimelineStep[];
  vendor?: Vendor | null;
  photos?: MaintenancePhoto[];
  messages?: MaintenanceMessage[];
  rating?: number | null;
  rating_comment?: string | null;
};

export type MaintenanceFilter = {
  key: string;
  label: string;
  statuses: string[];
};

export type MaintenanceMeta = {
  categories: { key: string; label: string; icon: string }[];
  priorities: { key: string; label: string }[];
  locations: string[];
  statuses: { key: string; label: string; sequence: number }[];
  filters: MaintenanceFilter[];
};

export type Participation = {
  total_shares: number;
  represented_shares: number;
  percent: number;
};

export type Resolution = {
  id: number;
  sequence: number;
  title: string;
  description: string | null;
  majority_type: string;
  article_ref: string | null;
  outcome: string | null;
  tally: { for: number; against: number; abstain: number };
  my_vote: "for" | "against" | "abstain" | null;
  my_vote_weight: number | null;
  my_vote_at: string | null;
};

export type Meeting = {
  id: number;
  reference: string;
  title: string;
  meeting_type: string;
  type_label: string;
  scheduled_for: string;
  location: string | null;
  status: string;
  is_voting_open: boolean;
  voting_closes_at: string | null;
  quorum_note: string | null;
  whatsapp_sent: boolean;
  resolution_count: number;
  resolutions?: Resolution[];
  participation?: Participation;
};

export type DocumentEntry = {
  id: number;
  folder_id: number;
  title: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  version_label: string | null;
  uploaded_at: string | null;
  url: string;
};

export type DocumentFolder = {
  id: number;
  name: string;
  category: string;
  is_private: boolean;
  document_count: number;
  documents: DocumentEntry[];
};

export type ResidentNotification = {
  id: number;
  category: "finance" | "maintenance" | "community" | "governance" | "whatsapp";
  title: string;
  body: string | null;
  icon_key: string | null;
  link_path: string | null;
  is_read: boolean;
  created_at: string;
};

export type DashboardFund = {
  id: number;
  name: string;
  fund_type: string;
  balance: number;
  target_balance: number | null;
};

export type Dashboard = {
  unit: ResidentUnit | null;
  features: ResidentFeatures;
  unread_notifications: number;
  account?: AccountSummary;
  kpis: {
    reserve_fund?: DashboardFund | null;
    open_requests: number;
    next_meeting: Meeting | null;
    open_votes?: number;
  };
  assets: {
    parking: ParkingBay[];
    ev_bays: ParkingBay[];
    storage: StorageUnit[];
  };
  facilities: Facility[];
  activity: ResidentNotification[];
  latest_announcement: Announcement | null;
};

export type Invitation = {
  id: number;
  email: string;
  role: string;
  status: string;
  unit_id: number;
  unit_label: string | null;
  development_id: number;
  development_name: string | null;
  first_name: string | null;
  last_name: string | null;
  expires_at: string | null;
};
