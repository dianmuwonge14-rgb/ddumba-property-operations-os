-- Phase 256: Admin Capital Injection into office cash.
-- External Admin money enters an office without consuming bank/admin treasury balances,
-- while remaining visible as a separate collection source.

alter table if exists public.collections
  add column if not exists collection_source text,
  add column if not exists collection_purpose text;

create unique index if not exists idx_collections_admin_capital_injection_reference
  on public.collections(company_id, office_id, reference_number)
  where type = 'ADMIN_CAPITAL_INJECTION' and reference_number is not null;

create index if not exists idx_collections_collection_source_date
  on public.collections(company_id, office_id, type, payment_date desc);

create or replace function public.ddumba_v1_admin_capital_injection_to_office(
  p_company_id uuid,
  p_office_id uuid,
  p_admin_id uuid,
  p_amount numeric,
  p_movement_date date,
  p_source text default 'admin_capital_injection',
  p_reason text default null,
  p_reference text default null,
  p_notes text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_external_account_id uuid;
  v_office_account_id uuid;
  v_transfer_id uuid;
  v_existing_transfer_id uuid;
  v_office_before numeric := 0;
  v_office_after numeric := 0;
  v_collection_before numeric := 0;
  v_collection_after numeric := 0;
  v_ref text;
  v_description text;
  v_office_name text;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if p_company_id is null then
    raise exception 'Company is required.' using errcode = '22023';
  end if;
  if p_admin_id is null or not public.ddumba_v1_actor_is_company_admin(p_admin_id, p_company_id) then
    raise exception 'Only Admin may record an Admin Capital Injection.' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero.' using errcode = '22023';
  end if;
  if p_office_id is null then
    raise exception 'Office is required.' using errcode = '22023';
  end if;
  if p_movement_date is null then
    raise exception 'Transfer date is required.' using errcode = '22023';
  end if;
  if v_reason is null then
    raise exception 'Reason is required.' using errcode = '22023';
  end if;

  select coalesce(office_name, name)
    into v_office_name
  from public.offices
  where id = p_office_id
    and company_id = p_company_id
    and lower(coalesce(status, 'active')) = 'active';

  if v_office_name is null then
    raise exception 'Office was not found or is not active for this company.' using errcode = '22023';
  end if;

  v_ref := coalesce(
    nullif(trim(p_reference), ''),
    'ADMIN-CAPITAL-' || left(md5(coalesce(p_idempotency_key, p_company_id::text || ':' || p_office_id::text || ':' || p_movement_date::text || ':' || p_amount::text || ':' || v_reason)), 18)
  );

  perform pg_advisory_xact_lock(hashtextextended('admin-capital-injection:' || p_company_id::text || ':' || p_office_id::text || ':' || v_ref, 0));

  select ct.source_id
    into v_existing_transfer_id
  from public.cash_transactions ct
  where ct.company_id = p_company_id
    and ct.office_id = p_office_id
    and ct.source_type = 'admin_capital_injection'
    and ct.reference = v_ref
  limit 1;

  if exists (
    select 1
    from public.collections c
    where c.company_id = p_company_id
      and c.office_id = p_office_id
      and c.type = 'ADMIN_CAPITAL_INJECTION'
      and c.reference_number = v_ref
  ) then
    return jsonb_build_object('ok', true, 'duplicate', true, 'transfer_id', v_existing_transfer_id, 'reference', v_ref);
  end if;

  v_external_account_id := public.ddumba_v1_ensure_cash_account(p_company_id, null, 'hq_cash', 'Admin Capital Injection Source');
  v_office_account_id := public.ddumba_v1_ensure_cash_account(p_company_id, p_office_id, 'office_cash', 'Office Cash');

  v_office_before := public.ddumba_v1_office_cash_ledger_balance(v_office_account_id);

  select coalesce(sum(coalesce(c.amount_paid, c.amount, 0)), 0)
    into v_collection_before
  from public.collections c
  where c.company_id = p_company_id
    and c.office_id = p_office_id
    and lower(coalesce(c.status, 'active')) not in ('voided','removed','removed_by_admin_approval','rejected','pending','cancelled','canceled');

  insert into public.cash_transfers(
    amount, company_id, completed_at, from_cash_account_id, requested_by, status, to_cash_account_id
  )
  values (
    p_amount, p_company_id, now(), v_external_account_id, p_admin_id, 'completed', v_office_account_id
  )
  returning id into v_transfer_id;

  v_description := concat_ws(
    ' · ',
    'Admin Capital Injection',
    'office: ' || v_office_name,
    'purpose: ' || v_reason,
    case when nullif(trim(coalesce(p_notes, '')), '') is not null then 'notes: ' || trim(p_notes) end
  );

  insert into public.cash_transactions(
    amount, cash_account_id, company_id, description, office_id, recorded_by, reference, source_id,
    source_type, status, transaction_date, transaction_type
  )
  values (
    p_amount, v_office_account_id, p_company_id, v_description, p_office_id, p_admin_id, v_ref, v_transfer_id,
    'admin_capital_injection', 'approved', p_movement_date::timestamptz, 'inflow'
  );

  insert into public.admin_cash_movements(
    amount, company_id, movement_date, movement_type, notes, office_id, recorded_by, reference, source, transfer_id
  )
  values (
    p_amount, p_company_id, p_movement_date, 'money_sent_to_office', p_notes, p_office_id, p_admin_id, v_ref, 'admin_capital_injection', v_transfer_id
  );

  insert into public.office_cash_movements(
    amount, company_id, movement_date, movement_type, notes, office_id, recorded_by, reference, source_id, source_type
  )
  values (
    p_amount, p_company_id, p_movement_date, 'money_in', p_notes, p_office_id, p_admin_id, v_ref, v_transfer_id, 'admin_capital_injection'
  );

  insert into public.collections(
    amount, amount_paid, collection_number, collection_purpose, collection_source, company_id,
    entered_by_account_id, entered_by_name, financial_effective, notes, office_id, paid_at,
    payment_date, payment_method, recorded_by, reference_number, status, type
  )
  values (
    p_amount, p_amount, 'ADMIN-CAPITAL-' || v_transfer_id::text, v_reason, 'Admin Capital Injection', p_company_id,
    p_admin_id, 'Admin', true, coalesce(p_notes, v_reason), p_office_id, p_movement_date::timestamptz,
    p_movement_date, 'Admin Capital Injection', p_admin_id, v_ref, 'paid', 'ADMIN_CAPITAL_INJECTION'
  );

  v_office_after := v_office_before + p_amount;
  v_collection_after := v_collection_before + p_amount;

  insert into public.office_cash_balances(
    balance_date, company_id, money_at_office, money_received_from_admin, office_id, updated_at
  )
  values (p_movement_date, p_company_id, v_office_after, p_amount, p_office_id, now())
  on conflict (company_id, office_id, balance_date)
  do update set
    money_at_office = excluded.money_at_office,
    money_received_from_admin = coalesce(office_cash_balances.money_received_from_admin, 0) + excluded.money_received_from_admin,
    updated_at = now();

  insert into public.notifications(
    channel, company_id, delivery_status, entity_id, entity_type, is_read, message, office_id, recipient_type, severity, title
  )
  values (
    'in_app', p_company_id, 'pending', v_transfer_id, 'cash_transfer', false,
    'Admin Capital Injection of UGX ' || trim(to_char(p_amount, 'FM999,999,999,999')) || ' was introduced into ' || v_office_name || '.',
    p_office_id, 'office', 'success', 'Admin Capital Injection received'
  );

  insert into public.audit_logs(
    company_id, office_id, actor_id, action, entity_type, entity_id, before_data, after_data
  )
  values (
    p_company_id, p_office_id, p_admin_id, 'admin_capital_injection_to_office', 'cash_transfer', v_transfer_id,
    jsonb_build_object('office_cash_before', v_office_before, 'office_collections_before', v_collection_before),
    jsonb_build_object('amount', p_amount, 'source', 'admin_capital_injection', 'reference', v_ref, 'reason', v_reason, 'office_cash_after', v_office_after, 'office_collections_after', v_collection_after)
  );

  return jsonb_build_object(
    'ok', true,
    'transfer_id', v_transfer_id,
    'reference', v_ref,
    'office_id', p_office_id,
    'office_name', v_office_name,
    'amount', p_amount,
    'source', 'admin_capital_injection',
    'office_cash_before', v_office_before,
    'office_cash_after', v_office_after,
    'office_collections_before', v_collection_before,
    'office_collections_after', v_collection_after
  );
end;
$$;

grant execute on function public.ddumba_v1_admin_capital_injection_to_office(uuid, uuid, uuid, numeric, date, text, text, text, text, text) to authenticated, service_role;
