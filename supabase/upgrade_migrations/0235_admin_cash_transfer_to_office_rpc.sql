-- Phase 235: Authoritative Admin Cash/Bank Transfer to Office RPC.

create unique index if not exists idx_collections_admin_cash_transfer_reference
  on public.collections(company_id, office_id, reference_number)
  where type = 'ADMIN_CASH_TRANSFER' and reference_number is not null;

insert into public.collections(
  amount,
  amount_paid,
  collection_number,
  company_id,
  entered_by_account_id,
  entered_by_name,
  financial_effective,
  notes,
  office_id,
  paid_at,
  payment_date,
  payment_method,
  recorded_by,
  reference_number,
  status,
  type
)
select
  ct.amount,
  ct.amount,
  coalesce(ct.reference, acm.reference, 'ADMIN-CASH-' || ct.source_id::text),
  ct.company_id,
  ct.recorded_by,
  'Admin',
  true,
  coalesce(ct.description, acm.notes, 'Cash from Admin'),
  ct.office_id,
  coalesce(ct.occurred_at, ct.transaction_date::timestamptz, ct.created_at),
  coalesce(ct.transaction_date::date, ct.created_at::date),
  case when source_account.account_type = 'bank' then 'Admin Bank Transfer' else 'Admin Cash Transfer' end,
  ct.recorded_by,
  coalesce(ct.reference, acm.reference, 'ADMIN-CASH-' || ct.source_id::text),
  'paid',
  'ADMIN_CASH_TRANSFER'
from public.cash_transactions ct
join public.cash_accounts office_account
  on office_account.id = ct.cash_account_id
left join public.cash_transfers transfer
  on transfer.id = ct.source_id
left join public.cash_accounts source_account
  on source_account.id = transfer.from_cash_account_id
left join public.admin_cash_movements acm
  on acm.transfer_id = ct.source_id
 and acm.company_id = ct.company_id
 and acm.office_id = ct.office_id
where office_account.account_type = 'office_cash'
  and ct.source_type = 'admin_float'
  and ct.transaction_type = 'inflow'
  and ct.office_id is not null
  and ct.source_id is not null
  and lower(coalesce(ct.status, 'approved')) in ('approved', 'completed', 'posted')
  and not exists (
    select 1
    from public.collections existing
    where existing.company_id = ct.company_id
      and existing.office_id = ct.office_id
      and existing.type = 'ADMIN_CASH_TRANSFER'
      and existing.reference_number = coalesce(ct.reference, acm.reference, 'ADMIN-CASH-' || ct.source_id::text)
  )
on conflict do nothing;

insert into public.notifications(
  channel,
  company_id,
  delivery_status,
  entity_id,
  entity_type,
  is_read,
  message,
  office_id,
  recipient_type,
  severity,
  title
)
select
  'in_app',
  ct.company_id,
  'pending',
  ct.source_id,
  'cash_transfer',
  false,
  'Admin transferred UGX ' || trim(to_char(ct.amount, 'FM999,999,999,999')) || ' to ' || coalesce(off.office_name, off.name, 'office') || '.',
  ct.office_id,
  'office',
  'success',
  'Cash from Admin received'
from public.cash_transactions ct
join public.cash_accounts office_account
  on office_account.id = ct.cash_account_id
left join public.offices off
  on off.id = ct.office_id
where office_account.account_type = 'office_cash'
  and ct.source_type = 'admin_float'
  and ct.transaction_type = 'inflow'
  and ct.office_id is not null
  and ct.source_id is not null
  and lower(coalesce(ct.status, 'approved')) in ('approved', 'completed', 'posted')
  and not exists (
    select 1
    from public.notifications n
    where n.company_id = ct.company_id
      and n.entity_type = 'cash_transfer'
      and n.entity_id = ct.source_id
      and n.title = 'Cash from Admin received'
  );

insert into public.audit_logs(
  company_id,
  office_id,
  actor_id,
  action,
  entity_type,
  entity_id,
  after_data
)
select
  ct.company_id,
  ct.office_id,
  ct.recorded_by,
  'admin_money_given_to_office',
  'cash_transfer',
  ct.source_id,
  jsonb_build_object(
    'amount', ct.amount,
    'source', case when source_account.account_type = 'bank' then 'bank' else 'admin_cash' end,
    'reference', coalesce(ct.reference, acm.reference, 'ADMIN-CASH-' || ct.source_id::text),
    'reconciled_by_migration', '0235_admin_cash_transfer_to_office_rpc'
  )
from public.cash_transactions ct
join public.cash_accounts office_account
  on office_account.id = ct.cash_account_id
left join public.cash_transfers transfer
  on transfer.id = ct.source_id
left join public.cash_accounts source_account
  on source_account.id = transfer.from_cash_account_id
left join public.admin_cash_movements acm
  on acm.transfer_id = ct.source_id
 and acm.company_id = ct.company_id
 and acm.office_id = ct.office_id
where office_account.account_type = 'office_cash'
  and ct.source_type = 'admin_float'
  and ct.transaction_type = 'inflow'
  and ct.office_id is not null
  and ct.source_id is not null
  and lower(coalesce(ct.status, 'approved')) in ('approved', 'completed', 'posted')
  and not exists (
    select 1
    from public.audit_logs a
    where a.company_id = ct.company_id
      and a.entity_type = 'cash_transfer'
      and a.entity_id = ct.source_id
      and a.action = 'admin_money_given_to_office'
  );

create or replace function public.ddumba_v1_admin_cash_transfer_to_office(
  p_company_id uuid,
  p_office_id uuid,
  p_admin_id uuid,
  p_amount numeric,
  p_movement_date date,
  p_source text default 'admin_cash',
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
  v_source_account_id uuid;
  v_office_account_id uuid;
  v_transfer_id uuid;
  v_existing_transfer_id uuid;
  v_admin_before numeric := 0;
  v_admin_after numeric := 0;
  v_office_before numeric := 0;
  v_office_after numeric := 0;
  v_ref text;
  v_description text;
  v_office_name text;
  v_source text := lower(coalesce(nullif(trim(p_source), ''), 'admin_cash'));
begin
  if p_company_id is null then
    raise exception 'Company is required.' using errcode = '22023';
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
  if v_source not in ('admin_cash', 'bank') then
    raise exception 'Transfer source must be Admin Cash or Bank.' using errcode = '22023';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
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
    'ADMIN-CASH-' || left(md5(coalesce(p_idempotency_key, p_company_id::text || ':' || p_office_id::text || ':' || p_movement_date::text || ':' || p_amount::text || ':' || v_source || ':' || trim(p_reason))), 18)
  );

  perform pg_advisory_xact_lock(hashtextextended('admin-cash-transfer:' || p_company_id::text || ':' || p_office_id::text || ':' || v_ref, 0));

  select ct.id
    into v_existing_transfer_id
  from public.collections c
  left join public.cash_transfers ct
    on (
      c.reference_number = 'ADMIN-CASH-' || ct.id::text
      or c.reference_number = ct.id::text
    )
  where c.company_id = p_company_id
    and c.office_id = p_office_id
    and c.type = 'ADMIN_CASH_TRANSFER'
    and c.reference_number = v_ref
  limit 1;

  if v_existing_transfer_id is not null then
    return jsonb_build_object('ok', true, 'duplicate', true, 'transfer_id', v_existing_transfer_id, 'reference', v_ref);
  end if;

  if exists (
    select 1
    from public.collections c
    where c.company_id = p_company_id
      and c.office_id = p_office_id
      and c.type = 'ADMIN_CASH_TRANSFER'
      and c.reference_number = v_ref
  ) then
    return jsonb_build_object('ok', true, 'duplicate', true, 'reference', v_ref);
  end if;

  v_source_account_id := public.ddumba_v1_ensure_cash_account(
    p_company_id,
    null,
    case when v_source = 'bank' then 'bank' else 'hq_cash' end,
    case when v_source = 'bank' then 'Company Bank' else 'Admin Cash' end
  );
  v_office_account_id := public.ddumba_v1_ensure_cash_account(p_company_id, p_office_id, 'office_cash', 'Office Cash');

  v_admin_before := public.ddumba_v1_office_cash_ledger_balance(v_source_account_id);
  v_office_before := public.ddumba_v1_office_cash_ledger_balance(v_office_account_id);

  if p_amount > v_admin_before then
    raise exception '% is insufficient. Available: UGX %.',
      case when v_source = 'bank' then 'Money at Bank' else 'Admin cash' end,
      trim(to_char(round(v_admin_before), 'FM999,999,999,999'))
      using errcode = '22023';
  end if;

  insert into public.cash_transfers(
    amount, company_id, completed_at, from_cash_account_id, requested_by, status, to_cash_account_id
  )
  values (
    p_amount, p_company_id, now(), v_source_account_id, p_admin_id, 'completed', v_office_account_id
  )
  returning id into v_transfer_id;

  if nullif(trim(coalesce(p_reference, '')), '') is null then
    v_ref := 'ADMIN-CASH-' || v_transfer_id::text;
  end if;

  v_description := concat_ws(
    ' · ',
    case when v_source = 'bank' then 'Admin bank transfer to office' else 'Admin cash transfer to office' end,
    'office: ' || v_office_name,
    'reason: ' || trim(p_reason),
    case when nullif(trim(coalesce(p_notes, '')), '') is not null then 'notes: ' || trim(p_notes) end
  );

  insert into public.cash_transactions(
    amount, cash_account_id, company_id, description, office_id, recorded_by, reference, source_id,
    source_type, status, transaction_date, transaction_type
  )
  values
  (
    p_amount, v_source_account_id, p_company_id, v_description, p_office_id, p_admin_id, v_ref, v_transfer_id,
    'admin_float', 'approved', p_movement_date::timestamptz, 'outflow'
  ),
  (
    p_amount, v_office_account_id, p_company_id, v_description, p_office_id, p_admin_id, v_ref, v_transfer_id,
    'admin_float', 'approved', p_movement_date::timestamptz, 'inflow'
  );

  insert into public.admin_cash_movements(
    amount, company_id, movement_date, movement_type, notes, office_id, recorded_by, reference, source, transfer_id
  )
  values (
    p_amount, p_company_id, p_movement_date, 'money_sent_to_office', p_notes, p_office_id, p_admin_id, v_ref, v_source, v_transfer_id
  );

  insert into public.office_cash_movements(
    amount, company_id, movement_date, movement_type, notes, office_id, recorded_by, reference, source_id, source_type
  )
  values (
    p_amount, p_company_id, p_movement_date, 'money_in', p_notes, p_office_id, p_admin_id, v_ref, v_transfer_id, 'admin_float'
  );

  insert into public.collections(
    amount, amount_paid, collection_number, company_id, entered_by_account_id, entered_by_name,
    financial_effective, notes, office_id, paid_at, payment_date, payment_method, recorded_by,
    reference_number, status, type
  )
  values (
    p_amount, p_amount, v_ref, p_company_id, p_admin_id, 'Admin', true, coalesce(p_notes, p_reason),
    p_office_id, p_movement_date::timestamptz, p_movement_date,
    case when v_source = 'bank' then 'Admin Bank Transfer' else 'Admin Cash Transfer' end,
    p_admin_id, v_ref, 'paid', 'ADMIN_CASH_TRANSFER'
  );

  v_admin_after := v_admin_before - p_amount;
  v_office_after := v_office_before + p_amount;

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
    'Admin transferred UGX ' || trim(to_char(p_amount, 'FM999,999,999,999')) || ' to ' || v_office_name || '.',
    p_office_id, 'office', 'success', 'Cash from Admin received'
  );

  insert into public.audit_logs(
    company_id, office_id, actor_id, action, entity_type, entity_id, before_data, after_data
  )
  values (
    p_company_id, p_office_id, p_admin_id, 'admin_money_given_to_office', 'cash_transfer', v_transfer_id,
    jsonb_build_object('source_balance_before', v_admin_before, 'office_cash_before', v_office_before),
    jsonb_build_object('amount', p_amount, 'source', v_source, 'reference', v_ref, 'reason', p_reason, 'source_balance_after', v_admin_after, 'office_cash_after', v_office_after)
  );

  return jsonb_build_object(
    'ok', true,
    'transfer_id', v_transfer_id,
    'reference', v_ref,
    'office_id', p_office_id,
    'office_name', v_office_name,
    'amount', p_amount,
    'source', v_source,
    'source_balance_before', v_admin_before,
    'source_balance_after', v_admin_after,
    'office_cash_before', v_office_before,
    'office_cash_after', v_office_after
  );
end;
$$;

grant execute on function public.ddumba_v1_admin_cash_transfer_to_office(uuid, uuid, uuid, numeric, date, text, text, text, text, text) to authenticated, service_role;
