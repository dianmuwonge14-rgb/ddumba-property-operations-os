-- Additive/staged RLS for newly-created enterprise tables.
-- Existing legacy tables are intentionally not changed here to avoid breaking the current app.
-- Rules: no DROP TABLE, no DROP COLUMN, no DELETE, no TRUNCATE.

create or replace function public.ddumba_v1_current_company_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select u.company_id
  from public.users u
  where u.id = auth.uid()
$$;

create or replace function public.ddumba_v1_is_service_role()
returns boolean
language sql
stable
as $$
  select coalesce(auth.role(), '') = 'service_role'
$$;

create or replace function public.ddumba_v1_has_permission(permission_key text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.user_office_roles uor
    join public.role_permissions rp on rp.role_id = uor.role_id
    join public.permissions p on p.id = rp.permission_id
    where uor.user_id = auth.uid()
      and p.key = permission_key
  )
$$;

create or replace function public.ddumba_v1_is_company_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.user_office_roles uor
    join public.roles r on r.id = uor.role_id
    where uor.user_id = auth.uid()
      and uor.office_id is null
      and r.key in ('company_admin','super_admin','hq_executive')
  )
$$;

create or replace function public.ddumba_v1_can_access_office(target_office_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select target_office_id is null
    or public.ddumba_v1_is_company_admin()
    or exists (
      select 1
      from public.user_office_roles uor
      where uor.user_id = auth.uid()
        and (uor.office_id = target_office_id or uor.office_id is null)
    )
$$;

create or replace function public.ddumba_v1_can_access_entity(entity_company_id uuid, entity_office_id uuid)
returns boolean
language sql
stable
as $$
  select public.ddumba_v1_is_service_role()
    or (
      entity_company_id = public.ddumba_v1_current_company_id()
      and public.ddumba_v1_can_access_office(entity_office_id)
    )
$$;

do $$
declare
  tbl text;
  has_company boolean;
  has_office boolean;
  policy_name text;
begin
  foreach tbl in array array[
    'users','roles','permissions','role_permissions','user_office_roles','user_devices','pin_credentials','security_events',
    'system_settings','company_settings','office_settings','feature_flags','settings_change_requests','settings_versions','configuration_audit_logs',
    'landlord_bank_accounts','property_landlords','room_status_history','tenant_contacts','document_types','attachments',
    'tenant_documents','document_verifications','leases','lease_charges','lease_documents','move_in_records','move_out_records',
    'eviction_cases','eviction_steps','rent_invoices','invoice_lines','payments','payment_allocations','receipts',
    'tenant_ledger_entries','collector_assignments','collection_actions','promise_followups','arrears_snapshots',
    'landlord_settlement_periods','management_fee_rules','landlord_settlements','landlord_settlement_lines',
    'landlord_statements','landlord_payouts','landlord_payout_allocations','payment_provider_accounts','cash_accounts',
    'bank_accounts','mobile_money_accounts','cash_transactions','cash_account_balances','cash_transfers','cash_reconciliations',
    'cash_reconciliation_lines','daily_cash_positions','company_cash_positions','external_transaction_imports',
    'external_transactions','transaction_reconciliation_matches','transaction_reconciliation_exceptions',
    'payment_provider_webhook_events','reversal_requests','withdrawal_requests','withdrawal_approvals',
    'expense_categories','expense_lines','expense_receipts','petty_cash_requests','petty_cash_disbursements',
    'approval_workflows','approval_steps','approval_requests','approval_actions','field_agents','field_routes',
    'field_route_stops','field_visits','field_visit_events','geofences','gps_validations','property_inspections',
    'inspection_items','inspection_findings','maintenance_tickets','attendance_policies','work_schedules',
    'employee_schedule_assignments','attendance_events','attendance_daily_summaries','attendance_corrections',
    'attendance_correction_actions','absence_records','leave_requests','public_holidays','device_attendance_locks',
    'payroll_profiles','payroll_periods','payroll_runs','payroll_items','payroll_adjustments','payroll_exports',
    'communication_channels','message_templates','messages','message_recipients','message_delivery_attempts',
    'message_delivery_events','communication_provider_logs','notification_failures','escalation_rules','reminders',
    'broadcasts','notification_preferences','reports','report_runs','saved_report_views','report_access_logs',
    'metric_definitions','metric_snapshots','office_collection_targets','collector_collection_targets',
    'office_performance_components','office_performance_snapshots','office_rankings','executive_kpi_snapshots',
    'dashboard_cache_snapshots','dashboard_refresh_runs','kpi_calculation_runs','company_reporting_periods',
    'company_consolidation_snapshots','office_consolidation_snapshots','consolidation_adjustments',
    'consolidated_report_exports','company_scorecards','performance_targets','ai_master_spreadsheets',
    'ai_spreadsheet_rows','ai_validation_results','data_quality_checks','data_quality_findings',
    'duplicate_candidates','ai_entity_suggestions','ai_action_feedback','automation_rules','automation_runs',
    'automation_tasks','scheduled_jobs','backup_jobs','backup_runs','backup_artifacts','restore_requests',
    'restore_drills','data_retention_policies','audit_logs'
  ]
  loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = tbl
    ) then
      execute format('alter table public.%I enable row level security', tbl);

      select exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = tbl and column_name = 'company_id'
      ) into has_company;

      select exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = tbl and column_name = 'office_id'
      ) into has_office;

      if has_company and has_office then
        policy_name := 'ddumba_v1_' || tbl || '_office_read';
        if not exists (
          select 1 from pg_policies
          where schemaname = 'public' and tablename = tbl and policyname = policy_name
        ) then
          execute format(
            'create policy %I on public.%I for select using (public.ddumba_v1_can_access_entity(company_id, office_id))',
            policy_name,
            tbl
          );
        end if;
      elsif has_company then
        policy_name := 'ddumba_v1_' || tbl || '_company_read';
        if not exists (
          select 1 from pg_policies
          where schemaname = 'public' and tablename = tbl and policyname = policy_name
        ) then
          execute format(
            'create policy %I on public.%I for select using (public.ddumba_v1_is_service_role() or company_id = public.ddumba_v1_current_company_id())',
            policy_name,
            tbl
          );
        end if;
      end if;
    end if;
  end loop;
end;
$$;

do $$
begin
  alter table public.companies enable row level security;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'companies' and policyname = 'ddumba_v1_companies_read'
  ) then
    create policy ddumba_v1_companies_read on public.companies
    for select
    using (public.ddumba_v1_is_service_role() or id = public.ddumba_v1_current_company_id());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'permissions' and policyname = 'ddumba_v1_permissions_authenticated_read'
  ) then
    create policy ddumba_v1_permissions_authenticated_read on public.permissions
    for select
    using (auth.role() = 'authenticated' or public.ddumba_v1_is_service_role());
  end if;
end;
$$;
