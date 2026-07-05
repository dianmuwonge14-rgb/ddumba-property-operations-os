-- Phase 1D: field operations, attendance, payroll, communications, reporting, AI, automation, backup, audit.

create table if not exists public.field_agents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  office_id uuid not null references public.offices(id) on delete cascade,
  agent_type text not null default 'collector',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(employee_id)
);

create table if not exists public.field_routes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete cascade,
  field_agent_id uuid not null references public.field_agents(id) on delete cascade,
  route_date date not null,
  status text not null default 'planned',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.field_route_stops (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  route_id uuid not null references public.field_routes(id) on delete cascade,
  stop_order int not null,
  property_id uuid references public.properties(id) on delete set null,
  room_id uuid references public.rooms(id) on delete set null,
  tenant_id uuid references public.tenants(id) on delete set null,
  purpose text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  unique(route_id, stop_order)
);

create table if not exists public.field_visits (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete cascade,
  field_agent_id uuid not null references public.field_agents(id) on delete cascade,
  route_stop_id uuid references public.field_route_stops(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  room_id uuid references public.rooms(id) on delete set null,
  tenant_id uuid references public.tenants(id) on delete set null,
  visit_type text not null,
  visit_date timestamptz not null default now(),
  latitude numeric(10,7),
  longitude numeric(10,7),
  status text not null default 'started',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.field_visit_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  field_visit_id uuid not null references public.field_visits(id) on delete cascade,
  event_type text not null,
  latitude numeric(10,7),
  longitude numeric(10,7),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.geofences (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid references public.offices(id) on delete cascade,
  property_id uuid references public.properties(id) on delete cascade,
  name text not null,
  center_latitude numeric(10,7) not null,
  center_longitude numeric(10,7) not null,
  radius_meters int not null check (radius_meters > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gps_validations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid references public.offices(id) on delete set null,
  geofence_id uuid references public.geofences(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  latitude numeric(10,7) not null,
  longitude numeric(10,7) not null,
  distance_meters numeric(10,2),
  passed boolean not null,
  created_at timestamptz not null default now()
);

create table if not exists public.property_inspections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  room_id uuid references public.rooms(id) on delete set null,
  field_agent_id uuid references public.field_agents(id) on delete set null,
  inspection_date timestamptz not null default now(),
  status text not null default 'draft',
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inspection_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  inspection_id uuid not null references public.property_inspections(id) on delete cascade,
  item_name text not null,
  result text not null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.inspection_findings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  inspection_id uuid references public.property_inspections(id) on delete cascade,
  severity text not null default 'medium',
  title text not null,
  description text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.maintenance_tickets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  room_id uuid references public.rooms(id) on delete set null,
  finding_id uuid references public.inspection_findings(id) on delete set null,
  title text not null,
  description text,
  priority text not null default 'medium',
  status text not null default 'open',
  assigned_to uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.attendance_policies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid references public.offices(id) on delete cascade,
  name text not null,
  check_in_time time not null,
  check_out_time time not null,
  grace_minutes int not null default 0,
  require_gps boolean not null default true,
  require_approved_device boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.work_schedules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  schedule jsonb not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.employee_schedule_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  schedule_id uuid not null references public.work_schedules(id) on delete restrict,
  starts_on date not null,
  ends_on date,
  created_at timestamptz not null default now()
);

create table if not exists public.attendance_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  event_type text not null check (event_type in ('check_in','break_start','break_end','check_out')),
  event_time timestamptz not null default now(),
  latitude numeric(10,7),
  longitude numeric(10,7),
  device_id uuid references public.user_devices(id) on delete set null,
  gps_validation_id uuid references public.gps_validations(id) on delete set null,
  source text not null default 'web',
  status text not null default 'valid',
  created_at timestamptz not null default now()
);

create table if not exists public.attendance_daily_summaries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete cascade,
  work_date date not null,
  first_check_in timestamptz,
  last_check_out timestamptz,
  total_minutes int not null default 0,
  break_minutes int not null default 0,
  late_minutes int not null default 0,
  status text not null default 'absent',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(employee_id, work_date)
);

create table if not exists public.attendance_corrections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete cascade,
  work_date date not null,
  requested_change jsonb not null,
  reason text not null,
  status text not null default 'pending',
  requested_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.attendance_correction_actions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  correction_id uuid not null references public.attendance_corrections(id) on delete cascade,
  actor_id uuid references public.users(id) on delete set null,
  action text not null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.absence_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete cascade,
  absence_date date not null,
  absence_type text not null,
  status text not null default 'recorded',
  created_at timestamptz not null default now(),
  unique(employee_id, absence_date)
);

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  leave_type text not null,
  starts_on date not null,
  ends_on date not null,
  status text not null default 'pending',
  requested_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check(ends_on >= starts_on)
);

create table if not exists public.public_holidays (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  holiday_date date not null,
  name text not null,
  created_at timestamptz not null default now(),
  unique(company_id, holiday_date)
);

create table if not exists public.device_attendance_locks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  device_id uuid not null references public.user_devices(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(employee_id, device_id)
);

create table if not exists public.payroll_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  salary_type text not null default 'monthly',
  base_salary numeric(14,2) not null default 0,
  payment_method text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(employee_id)
);

create table if not exists public.payroll_periods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  unique(company_id, period_start, period_end),
  check(period_end >= period_start)
);

create table if not exists public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  payroll_period_id uuid not null references public.payroll_periods(id) on delete restrict,
  status text not null default 'draft',
  run_by uuid references public.users(id) on delete set null,
  run_at timestamptz not null default now()
);

create table if not exists public.payroll_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  payroll_run_id uuid not null references public.payroll_runs(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete restrict,
  gross_pay numeric(14,2) not null default 0,
  deductions numeric(14,2) not null default 0,
  net_pay numeric(14,2) not null default 0,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique(payroll_run_id, employee_id)
);

create table if not exists public.payroll_adjustments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  payroll_item_id uuid not null references public.payroll_items(id) on delete cascade,
  adjustment_type text not null,
  amount numeric(14,2) not null,
  reason text not null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.payroll_exports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  payroll_run_id uuid not null references public.payroll_runs(id) on delete cascade,
  file_url text,
  status text not null default 'pending',
  exported_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.communication_channels (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  channel text not null check (channel in ('sms','whatsapp','email','in_app')),
  provider text,
  config jsonb not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  key text not null,
  channel text not null,
  subject text,
  body text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, key, channel)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid references public.offices(id) on delete set null,
  channel_id uuid references public.communication_channels(id) on delete set null,
  template_id uuid references public.message_templates(id) on delete set null,
  subject text,
  body text not null,
  status text not null default 'queued',
  scheduled_for timestamptz,
  sent_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.message_recipients (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  recipient_type text not null,
  recipient_id uuid,
  destination text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.message_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  message_recipient_id uuid not null references public.message_recipients(id) on delete cascade,
  attempt_number int not null,
  provider text,
  provider_message_id text,
  status text not null,
  error_code text,
  error_message text,
  attempted_at timestamptz not null default now()
);

create table if not exists public.message_delivery_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  message_recipient_id uuid not null references public.message_recipients(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.communication_provider_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  channel text not null,
  provider text not null,
  direction text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.notification_failures (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  message_recipient_id uuid references public.message_recipients(id) on delete cascade,
  failure_reason text not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.escalation_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  entity_type text not null,
  conditions jsonb not null default '{}',
  actions jsonb not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid references public.offices(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  scheduled_for timestamptz not null,
  status text not null default 'scheduled',
  message_id uuid references public.messages(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.broadcasts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid references public.offices(id) on delete set null,
  title text not null,
  body text not null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  recipient_type text not null,
  recipient_id uuid not null,
  channel text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(recipient_type, recipient_id, channel)
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  report_type text not null,
  config jsonb not null default '{}',
  visibility text not null default 'private',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.report_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  report_id uuid not null references public.reports(id) on delete cascade,
  run_by uuid references public.users(id) on delete set null,
  filters jsonb not null default '{}',
  status text not null default 'queued',
  file_url text,
  started_at timestamptz default now(),
  completed_at timestamptz
);

create table if not exists public.saved_report_views (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  report_id uuid not null references public.reports(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  name text not null,
  filters jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.report_access_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  report_id uuid references public.reports(id) on delete set null,
  report_run_id uuid references public.report_runs(id) on delete set null,
  user_id uuid references public.users(id) on delete set null,
  action text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.metric_definitions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  category text not null,
  formula text,
  created_at timestamptz not null default now()
);

create table if not exists public.metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid references public.offices(id) on delete cascade,
  metric_definition_id uuid not null references public.metric_definitions(id) on delete restrict,
  metric_date date not null,
  value numeric(18,4) not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique(company_id, office_id, metric_definition_id, metric_date)
);

create table if not exists public.office_collection_targets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  target_amount numeric(14,2) not null check (target_amount >= 0),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(office_id, period_start, period_end)
);

create table if not exists public.collector_collection_targets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_target_id uuid not null references public.office_collection_targets(id) on delete cascade,
  collector_user_id uuid not null references public.users(id) on delete cascade,
  target_amount numeric(14,2) not null check (target_amount >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.office_scores (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete cascade,
  score_date date not null,
  total_score numeric(5,2) not null default 0,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique(office_id, score_date)
);

create table if not exists public.office_performance_components (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_score_id uuid not null references public.office_scores(id) on delete cascade,
  component_key text not null,
  component_score numeric(5,2) not null default 0,
  weight numeric(5,2) not null default 1,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.office_performance_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete cascade,
  snapshot_date date not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique(office_id, snapshot_date)
);

create table if not exists public.office_rankings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete cascade,
  ranking_date date not null,
  rank int not null,
  total_score numeric(5,2) not null,
  created_at timestamptz not null default now(),
  unique(company_id, ranking_date, office_id)
);

create table if not exists public.executive_kpi_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  snapshot_date date not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique(company_id, snapshot_date)
);

create table if not exists public.dashboard_cache_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  dashboard_key text not null,
  cache_key text not null,
  payload jsonb not null default '{}',
  valid_until timestamptz,
  created_at timestamptz not null default now(),
  unique(company_id, dashboard_key, cache_key)
);

create table if not exists public.dashboard_refresh_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  dashboard_key text not null,
  status text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error_message text
);

create table if not exists public.kpi_calculation_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  metric_definition_id uuid references public.metric_definitions(id) on delete set null,
  status text not null,
  inputs jsonb not null default '{}',
  result jsonb not null default '{}',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error_message text
);

create table if not exists public.company_reporting_periods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  period_start date not null,
  period_end date not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  unique(company_id, period_start, period_end)
);

create table if not exists public.company_consolidation_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  reporting_period_id uuid not null references public.company_reporting_periods(id) on delete cascade,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique(reporting_period_id)
);

create table if not exists public.office_consolidation_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete cascade,
  reporting_period_id uuid not null references public.company_reporting_periods(id) on delete cascade,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique(office_id, reporting_period_id)
);

create table if not exists public.consolidation_adjustments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  consolidation_snapshot_id uuid not null references public.company_consolidation_snapshots(id) on delete cascade,
  adjustment_type text not null,
  amount numeric(14,2),
  reason text not null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.consolidated_report_exports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  consolidation_snapshot_id uuid not null references public.company_consolidation_snapshots(id) on delete cascade,
  file_url text,
  status text not null default 'pending',
  exported_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.company_scorecards (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  score_date date not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique(company_id, score_date)
);

create table if not exists public.performance_targets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid references public.offices(id) on delete cascade,
  metric_key text not null,
  period_start date not null,
  period_end date not null,
  target_value numeric(18,4) not null,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_insights (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid references public.offices(id) on delete cascade,
  subject_type text not null,
  subject_id uuid,
  insight_type text not null,
  title text not null,
  summary text not null,
  confidence numeric(5,2),
  severity text not null default 'info',
  status text not null default 'open',
  model_name text,
  input_hash text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.ai_master_spreadsheets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid references public.offices(id) on delete cascade,
  name text not null,
  source text not null,
  status text not null default 'draft',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_spreadsheet_rows (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  spreadsheet_id uuid not null references public.ai_master_spreadsheets(id) on delete cascade,
  row_number int not null,
  entity_type text not null,
  raw_data jsonb not null default '{}',
  normalized_data jsonb not null default '{}',
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  unique(spreadsheet_id, row_number)
);

create table if not exists public.ai_validation_results (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  row_id uuid not null references public.ai_spreadsheet_rows(id) on delete cascade,
  status text not null,
  findings jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create table if not exists public.data_quality_checks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  key text not null,
  entity_type text not null,
  rule jsonb not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(company_id, key)
);

create table if not exists public.data_quality_findings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  check_id uuid references public.data_quality_checks(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  severity text not null default 'medium',
  status text not null default 'open',
  details jsonb not null default '{}',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.duplicate_candidates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  entity_type text not null,
  primary_entity_id uuid,
  duplicate_entity_id uuid,
  confidence numeric(5,2),
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create table if not exists public.ai_entity_suggestions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  suggestion_type text not null,
  entity_type text not null,
  entity_id uuid,
  suggested_data jsonb not null default '{}',
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  decided_by uuid references public.users(id) on delete set null,
  decided_at timestamptz
);

create table if not exists public.ai_action_feedback (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  ai_insight_id uuid references public.ai_insights(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  feedback text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  trigger_type text not null,
  conditions jsonb not null default '{}',
  actions jsonb not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  automation_rule_id uuid references public.automation_rules(id) on delete set null,
  status text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error_message text
);

create table if not exists public.automation_tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  automation_run_id uuid references public.automation_runs(id) on delete cascade,
  task_type text not null,
  payload jsonb not null default '{}',
  status text not null default 'queued',
  run_after timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.scheduled_jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  key text not null,
  schedule_expression text not null,
  payload jsonb not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(company_id, key)
);

create table if not exists public.backup_jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  name text not null,
  scope jsonb not null default '{}',
  schedule_expression text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.backup_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  backup_job_id uuid references public.backup_jobs(id) on delete set null,
  status text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  size_bytes bigint,
  error_message text
);

create table if not exists public.backup_artifacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  backup_run_id uuid not null references public.backup_runs(id) on delete cascade,
  storage_path text not null,
  checksum text,
  encrypted boolean not null default true,
  retention_until date,
  created_at timestamptz not null default now()
);

create table if not exists public.restore_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  backup_artifact_id uuid references public.backup_artifacts(id) on delete set null,
  reason text not null,
  status text not null default 'pending',
  requested_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.restore_drills (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  restore_request_id uuid references public.restore_requests(id) on delete set null,
  status text not null,
  notes text,
  tested_at timestamptz not null default now()
);

create table if not exists public.data_retention_policies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  entity_type text not null,
  retention_days int not null check (retention_days > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(company_id, entity_type)
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid references public.offices(id) on delete set null,
  actor_id uuid references public.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);
