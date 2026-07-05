-- Phase 28/29: Historical Excel workbook import staging and audit trail.
-- Additive only. No destructive operations.

create table if not exists public.historical_import_batches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id),
  source_name text not null,
  source_workbook_path text,
  source_file_hash text,
  mode text not null default 'write',
  status text not null default 'pending',
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid references public.users(id),
  total_sheets integer not null default 0,
  total_rows_discovered integer not null default 0,
  total_rows_staged integer not null default 0,
  total_records_imported integer not null default 0,
  duplicates_merged integer not null default 0,
  errors_count integer not null default 0,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint historical_import_batches_mode_check check (mode in ('dry_run','test_write','write')),
  constraint historical_import_batches_status_check check (status in ('pending','running','completed','completed_with_errors','failed'))
);

create table if not exists public.historical_import_sheets (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.historical_import_batches(id) on delete cascade,
  company_id uuid references public.companies(id),
  sheet_name text not null,
  sheet_index integer,
  header_row integer,
  row_count integer not null default 0,
  column_count integer not null default 0,
  inferred_entities text[] not null default '{}'::text[],
  headers jsonb not null default '[]'::jsonb,
  field_mappings jsonb not null default '[]'::jsonb,
  missing_columns jsonb not null default '[]'::jsonb,
  unmapped_fields jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (batch_id, sheet_name)
);

create table if not exists public.historical_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.historical_import_batches(id) on delete cascade,
  sheet_id uuid references public.historical_import_sheets(id) on delete set null,
  company_id uuid references public.companies(id),
  office_id uuid references public.offices(id),
  sheet_name text not null,
  row_number integer not null,
  row_hash text,
  raw_row jsonb not null,
  normalized_data jsonb not null default '{}'::jsonb,
  mapped_entities text[] not null default '{}'::text[],
  import_status text not null default 'staged',
  error_message text,
  duplicate_key jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint historical_import_rows_status_check check (import_status in ('staged','imported','duplicate','skipped','error')),
  unique (batch_id, sheet_name, row_number)
);

create table if not exists public.historical_import_record_links (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.historical_import_batches(id) on delete cascade,
  row_id uuid references public.historical_import_rows(id) on delete set null,
  company_id uuid references public.companies(id),
  target_table text not null,
  target_id uuid not null,
  action text not null default 'inserted',
  duplicate_strategy text,
  created_at timestamptz not null default now(),
  constraint historical_import_record_links_action_check check (action in ('inserted','linked_existing','updated_missing_fields','skipped'))
);

create table if not exists public.historical_import_field_mappings (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.historical_import_batches(id) on delete cascade,
  company_id uuid references public.companies(id),
  sheet_name text,
  source_column text not null,
  target_entity text,
  target_field text,
  confidence numeric(5,2),
  mapping_status text not null default 'auto',
  created_at timestamptz not null default now(),
  constraint historical_import_field_mappings_status_check check (mapping_status in ('auto','approved','manual_review','ignored'))
);

create table if not exists public.historical_import_errors (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.historical_import_batches(id) on delete cascade,
  row_id uuid references public.historical_import_rows(id) on delete set null,
  company_id uuid references public.companies(id),
  sheet_name text,
  row_number integer,
  severity text not null default 'warning',
  error_code text,
  message text not null,
  raw_context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint historical_import_errors_severity_check check (severity in ('info','warning','error','critical'))
);

alter table public.collections
  add column if not exists historical_import_batch_id uuid references public.historical_import_batches(id),
  add column if not exists historical_import_row_id uuid references public.historical_import_rows(id),
  add column if not exists workbook_sheet_name text,
  add column if not exists workbook_row_number integer,
  add column if not exists workbook_raw_data jsonb not null default '{}'::jsonb,
  add column if not exists day_of_week text,
  add column if not exists brought_forward numeric(14,2),
  add column if not exists income numeric(14,2),
  add column if not exists removed boolean,
  add column if not exists outstanding_balance_bf numeric(14,2),
  add column if not exists commission_percent numeric(7,4),
  add column if not exists forward_payment numeric(14,2),
  add column if not exists total_collection numeric(14,2),
  add column if not exists workbook_comment text,
  add column if not exists workbook_month text,
  add column if not exists workbook_payment_date date;

alter table public.expenses
  add column if not exists historical_import_batch_id uuid references public.historical_import_batches(id),
  add column if not exists historical_import_row_id uuid references public.historical_import_rows(id),
  add column if not exists workbook_sheet_name text,
  add column if not exists workbook_row_number integer,
  add column if not exists workbook_raw_data jsonb not null default '{}'::jsonb,
  add column if not exists day_of_week text,
  add column if not exists brought_forward numeric(14,2),
  add column if not exists income numeric(14,2),
  add column if not exists workbook_comment text,
  add column if not exists workbook_month text,
  add column if not exists workbook_payment_date date;

alter table public.landlord_payments
  add column if not exists historical_import_batch_id uuid references public.historical_import_batches(id),
  add column if not exists historical_import_row_id uuid references public.historical_import_rows(id),
  add column if not exists workbook_sheet_name text,
  add column if not exists workbook_row_number integer,
  add column if not exists workbook_raw_data jsonb not null default '{}'::jsonb,
  add column if not exists day_of_week text,
  add column if not exists commission_percent numeric(7,4),
  add column if not exists forward_payment numeric(14,2),
  add column if not exists total_collection numeric(14,2),
  add column if not exists workbook_comment text,
  add column if not exists workbook_month text,
  add column if not exists workbook_payment_date date;

alter table public.tenants
  add column if not exists historical_import_batch_id uuid references public.historical_import_batches(id),
  add column if not exists historical_import_row_id uuid references public.historical_import_rows(id),
  add column if not exists workbook_sheet_name text,
  add column if not exists workbook_row_number integer,
  add column if not exists workbook_raw_data jsonb not null default '{}'::jsonb,
  add column if not exists outstanding_balance_bf numeric(14,2),
  add column if not exists forward_payment numeric(14,2),
  add column if not exists workbook_comment text;

alter table public.rooms
  add column if not exists historical_import_batch_id uuid references public.historical_import_batches(id),
  add column if not exists historical_import_row_id uuid references public.historical_import_rows(id),
  add column if not exists workbook_sheet_name text,
  add column if not exists workbook_row_number integer,
  add column if not exists workbook_raw_data jsonb not null default '{}'::jsonb,
  add column if not exists removed boolean,
  add column if not exists workbook_comment text;

alter table public.landlords
  add column if not exists historical_import_batch_id uuid references public.historical_import_batches(id),
  add column if not exists historical_import_row_id uuid references public.historical_import_rows(id),
  add column if not exists workbook_sheet_name text,
  add column if not exists workbook_row_number integer,
  add column if not exists workbook_raw_data jsonb not null default '{}'::jsonb,
  add column if not exists commission_percent numeric(7,4),
  add column if not exists workbook_comment text;

alter table public.properties
  add column if not exists historical_import_batch_id uuid references public.historical_import_batches(id),
  add column if not exists historical_import_row_id uuid references public.historical_import_rows(id),
  add column if not exists workbook_sheet_name text,
  add column if not exists workbook_row_number integer,
  add column if not exists workbook_raw_data jsonb not null default '{}'::jsonb,
  add column if not exists workbook_comment text;

alter table public.office_daily_reports
  add column if not exists historical_import_batch_id uuid references public.historical_import_batches(id),
  add column if not exists historical_import_row_id uuid references public.historical_import_rows(id),
  add column if not exists workbook_sheet_name text,
  add column if not exists workbook_row_number integer,
  add column if not exists workbook_raw_data jsonb not null default '{}'::jsonb,
  add column if not exists day_of_week text,
  add column if not exists brought_forward numeric(14,2),
  add column if not exists income numeric(14,2),
  add column if not exists total_collection numeric(14,2),
  add column if not exists workbook_comment text,
  add column if not exists workbook_month text;

create index if not exists idx_hist_import_batches_company_status
  on public.historical_import_batches(company_id, status, created_at desc);
create index if not exists idx_hist_import_sheets_batch_sheet
  on public.historical_import_sheets(batch_id, sheet_name);
create index if not exists idx_hist_import_rows_batch_status
  on public.historical_import_rows(batch_id, import_status);
create index if not exists idx_hist_import_rows_company_office
  on public.historical_import_rows(company_id, office_id, sheet_name);
create index if not exists idx_hist_import_rows_duplicate_key
  on public.historical_import_rows using gin (duplicate_key);
create index if not exists idx_hist_import_links_batch_target
  on public.historical_import_record_links(batch_id, target_table, target_id);
create index if not exists idx_hist_import_errors_batch_severity
  on public.historical_import_errors(batch_id, severity, created_at desc);

create index if not exists idx_collections_historical_import_row
  on public.collections(historical_import_row_id);
create index if not exists idx_expenses_historical_import_row
  on public.expenses(historical_import_row_id);
create index if not exists idx_landlord_payments_historical_import_row
  on public.landlord_payments(historical_import_row_id);
create index if not exists idx_tenants_historical_import_row
  on public.tenants(historical_import_row_id);
create index if not exists idx_rooms_historical_import_row
  on public.rooms(historical_import_row_id);
create index if not exists idx_landlords_historical_import_row
  on public.landlords(historical_import_row_id);
create index if not exists idx_properties_historical_import_row
  on public.properties(historical_import_row_id);
create index if not exists idx_office_daily_reports_historical_import_row
  on public.office_daily_reports(historical_import_row_id);

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'historical_import_batches',
    'historical_import_sheets',
    'historical_import_rows',
    'historical_import_record_links',
    'historical_import_field_mappings',
    'historical_import_errors'
  ]
  loop
    execute format('alter table public.%I enable row level security', tbl);
  end loop;
end $$;

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'historical_import_batches',
    'historical_import_sheets',
    'historical_import_rows',
    'historical_import_record_links',
    'historical_import_field_mappings',
    'historical_import_errors'
  ]
  loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = tbl
        and policyname = 'ddumba_v1_' || tbl || '_admin_read'
    ) then
      execute format(
        'create policy %I on public.%I for select using (public.ddumba_v1_is_service_role() or public.ddumba_v1_is_company_admin() or public.ddumba_v1_has_permission(''settings.manage''))',
        'ddumba_v1_' || tbl || '_admin_read',
        tbl
      );
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = tbl
        and policyname = 'ddumba_v1_' || tbl || '_admin_write'
    ) then
      execute format(
        'create policy %I on public.%I for all using (public.ddumba_v1_is_service_role() or public.ddumba_v1_is_company_admin() or public.ddumba_v1_has_permission(''settings.manage'')) with check (public.ddumba_v1_is_service_role() or public.ddumba_v1_is_company_admin() or public.ddumba_v1_has_permission(''settings.manage''))',
        'ddumba_v1_' || tbl || '_admin_write',
        tbl
      );
    end if;
  end loop;
end $$;

drop trigger if exists trg_ddumba_v1_historical_import_batches_updated_at on public.historical_import_batches;
create trigger trg_ddumba_v1_historical_import_batches_updated_at
before update on public.historical_import_batches
for each row execute function public.ddumba_v1_set_updated_at();
