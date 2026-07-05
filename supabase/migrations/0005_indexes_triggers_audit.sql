-- Phase 2: indexes, updated_at automation, audit hooks, append-only protections.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.audit_table_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_company_id uuid;
  row_office_id uuid;
  row_entity_id uuid;
begin
  row_entity_id := coalesce((to_jsonb(new)->>'id')::uuid, (to_jsonb(old)->>'id')::uuid);

  if tg_table_name = 'companies' then
    row_company_id := row_entity_id;
  else
    row_company_id := coalesce(nullif(to_jsonb(new)->>'company_id','')::uuid, nullif(to_jsonb(old)->>'company_id','')::uuid);
  end if;

  row_office_id := coalesce(nullif(to_jsonb(new)->>'office_id','')::uuid, nullif(to_jsonb(old)->>'office_id','')::uuid);

  if row_company_id is null then
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
  end if;

  insert into public.audit_logs (
    company_id,
    office_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    before_data,
    after_data
  )
  values (
    row_company_id,
    row_office_id,
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    row_entity_id,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create or replace function public.prevent_change_on_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Table % is append-only and cannot be updated or deleted', tg_table_name;
end;
$$;

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'companies','offices','users','employees','roles','user_devices','pin_credentials',
    'system_settings','company_settings','office_settings','feature_flags',
    'landlords','landlord_bank_accounts','properties','rooms','tenants','tenant_contacts',
    'tenant_documents','leases','lease_charges','management_fee_rules','landlord_settlements',
    'landlord_payouts','payment_provider_accounts','cash_accounts','bank_accounts','mobile_money_accounts',
    'cash_reconciliations','withdrawal_requests','expenses','approval_workflows',
    'approval_requests','field_agents','field_routes','field_visits','property_inspections',
    'inspection_findings','maintenance_tickets','geofences','attendance_policies','work_schedules',
    'attendance_daily_summaries','attendance_corrections','payroll_profiles',
    'communication_channels','message_templates','notification_preferences',
    'automation_rules','reports','company_settings','office_settings'
  ]
  loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = tbl and column_name = 'updated_at'
    ) then
      execute format('drop trigger if exists trg_%I_updated_at on public.%I', tbl, tbl);
      execute format('create trigger trg_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()', tbl, tbl);
    end if;
  end loop;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'companies','offices','users','employees','roles','user_office_roles',
    'landlords','landlord_bank_accounts','properties','property_landlords','rooms','tenants',
    'leases','rent_invoices','payments','payment_allocations','receipts','tenant_ledger_entries',
    'collection_actions','promises','landlord_settlements','landlord_payouts',
    'cash_accounts','cash_transactions','cash_transfers','cash_reconciliations',
    'external_transactions','transaction_reconciliation_matches','withdrawal_requests',
    'expenses','approval_requests','approval_actions','attendance_events',
    'attendance_corrections','payroll_runs','payroll_items','messages',
    'office_scores','executive_kpi_snapshots','company_consolidation_snapshots',
    'ai_insights','ai_entity_suggestions','settings_change_requests'
  ]
  loop
    execute format('drop trigger if exists trg_%I_audit on public.%I', t, t);
    execute format('create trigger trg_%I_audit after insert or update or delete on public.%I for each row execute function public.audit_table_change()', t, t);
  end loop;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'audit_logs','security_events','tenant_ledger_entries','cash_transactions','receipts',
    'external_transactions','payment_provider_webhook_events','message_delivery_events',
    'communication_provider_logs','report_access_logs'
  ]
  loop
    execute format('drop trigger if exists trg_%I_append_only_update on public.%I', t, t);
    execute format('create trigger trg_%I_append_only_update before update or delete on public.%I for each row execute function public.prevent_change_on_append_only()', t, t);
  end loop;
end;
$$;

-- Core identity and tenancy indexes.
create index if not exists idx_offices_company_id on public.offices(company_id);
create index if not exists idx_users_company_id on public.users(company_id);
create index if not exists idx_users_default_office_id on public.users(default_office_id);
create index if not exists idx_employees_company_office on public.employees(company_id, office_id);
create index if not exists idx_user_office_roles_user_id on public.user_office_roles(user_id);
create index if not exists idx_user_office_roles_office_id on public.user_office_roles(office_id);
create index if not exists idx_user_devices_user_status on public.user_devices(user_id, status);
create index if not exists idx_security_events_company_created on public.security_events(company_id, created_at desc);

-- Property and tenant indexes.
create index if not exists idx_landlords_company_id on public.landlords(company_id);
create index if not exists idx_properties_company_office on public.properties(company_id, office_id);
create index if not exists idx_properties_status on public.properties(status);
create index if not exists idx_rooms_company_office on public.rooms(company_id, office_id);
create index if not exists idx_rooms_property_status on public.rooms(property_id, status);
create index if not exists idx_tenants_company_phone on public.tenants(company_id, phone);
create index if not exists idx_tenants_status on public.tenants(company_id, status);
create index if not exists idx_leases_company_office_status on public.leases(company_id, office_id, status);
create index if not exists idx_leases_tenant_status on public.leases(tenant_id, status);
create index if not exists idx_leases_room_status on public.leases(room_id, status);
create index if not exists idx_attachments_entity on public.attachments(entity_type, entity_id);

-- Collections, ledger, landlord settlement, and cash indexes.
create index if not exists idx_rent_invoices_office_due on public.rent_invoices(company_id, office_id, due_date);
create index if not exists idx_rent_invoices_tenant_status on public.rent_invoices(tenant_id, status);
create index if not exists idx_payments_office_paid_at on public.payments(company_id, office_id, paid_at desc);
create index if not exists idx_payment_allocations_invoice_id on public.payment_allocations(invoice_id);
create index if not exists idx_tenant_ledger_tenant_created on public.tenant_ledger_entries(tenant_id, created_at desc);
create index if not exists idx_collection_actions_follow_up on public.collection_actions(office_id, next_follow_up_at);
create index if not exists idx_promises_office_status_date on public.promises(office_id, status, promised_date);
create index if not exists idx_arrears_snapshots_office_date on public.arrears_snapshots(office_id, snapshot_date desc);
create index if not exists idx_landlord_settlements_landlord_status on public.landlord_settlements(landlord_id, status);
create index if not exists idx_landlord_payouts_landlord_status on public.landlord_payouts(landlord_id, status);
create index if not exists idx_cash_accounts_company_office_type on public.cash_accounts(company_id, office_id, account_type);
create index if not exists idx_cash_transactions_account_date on public.cash_transactions(cash_account_id, transaction_date desc);
create index if not exists idx_cash_transactions_source on public.cash_transactions(source_type, source_id);
create index if not exists idx_daily_cash_positions_office_date on public.daily_cash_positions(office_id, position_date desc);
create index if not exists idx_company_cash_positions_date on public.company_cash_positions(company_id, position_date desc);
create index if not exists idx_external_transactions_provider_time on public.external_transactions(provider_account_id, transaction_time desc);
create index if not exists idx_external_transactions_status on public.external_transactions(company_id, status);
create index if not exists idx_reconciliation_matches_external on public.transaction_reconciliation_matches(external_transaction_id);
create index if not exists idx_expenses_office_date on public.expenses(office_id, expense_date desc);
create index if not exists idx_approval_requests_entity on public.approval_requests(entity_type, entity_id);
create index if not exists idx_approval_requests_status on public.approval_requests(company_id, status, created_at desc);

-- Field, attendance, payroll indexes.
create index if not exists idx_field_visits_office_date on public.field_visits(office_id, visit_date desc);
create index if not exists idx_field_visits_agent_date on public.field_visits(field_agent_id, visit_date desc);
create index if not exists idx_property_inspections_property_date on public.property_inspections(property_id, inspection_date desc);
create index if not exists idx_inspection_findings_status on public.inspection_findings(company_id, status, severity);
create index if not exists idx_attendance_events_employee_time on public.attendance_events(employee_id, event_time desc);
create index if not exists idx_attendance_events_office_time on public.attendance_events(office_id, event_time desc);
create index if not exists idx_attendance_summary_office_date on public.attendance_daily_summaries(office_id, work_date desc);
create index if not exists idx_attendance_corrections_status on public.attendance_corrections(company_id, status, created_at desc);
create index if not exists idx_payroll_items_employee on public.payroll_items(employee_id);
create index if not exists idx_payroll_runs_period on public.payroll_runs(payroll_period_id);

-- Communications, reporting, AI, automation, backup indexes.
create index if not exists idx_messages_company_channel_status on public.messages(company_id, status, created_at desc);
create index if not exists idx_message_recipients_status on public.message_recipients(company_id, status);
create index if not exists idx_message_delivery_attempts_recipient on public.message_delivery_attempts(message_recipient_id, attempted_at desc);
create index if not exists idx_notification_failures_status on public.notification_failures(company_id, status, created_at desc);
create index if not exists idx_reminders_scheduled on public.reminders(company_id, status, scheduled_for);
create index if not exists idx_report_runs_report on public.report_runs(report_id, started_at desc);
create index if not exists idx_metric_snapshots_company_date on public.metric_snapshots(company_id, metric_date desc);
create index if not exists idx_office_scores_office_date on public.office_scores(office_id, score_date desc);
create index if not exists idx_exec_kpi_company_date on public.executive_kpi_snapshots(company_id, snapshot_date desc);
create index if not exists idx_company_consolidation_period on public.company_consolidation_snapshots(reporting_period_id);
create index if not exists idx_ai_insights_subject on public.ai_insights(subject_type, subject_id);
create index if not exists idx_ai_insights_status on public.ai_insights(company_id, status, severity);
create index if not exists idx_data_quality_findings_status on public.data_quality_findings(company_id, status, severity);
create index if not exists idx_automation_tasks_status on public.automation_tasks(company_id, status, run_after);
create index if not exists idx_backup_runs_company_started on public.backup_runs(company_id, started_at desc);
create index if not exists idx_audit_logs_company_created on public.audit_logs(company_id, created_at desc);
create index if not exists idx_audit_logs_entity on public.audit_logs(entity_type, entity_id);
create index if not exists idx_audit_logs_actor on public.audit_logs(actor_id, created_at desc);
