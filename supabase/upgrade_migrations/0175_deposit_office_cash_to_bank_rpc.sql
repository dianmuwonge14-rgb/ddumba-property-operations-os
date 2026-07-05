create or replace function public.deposit_office_cash_to_bank(
  p_office_id uuid,
  p_amount numeric,
  p_deposit_date date,
  p_deposit_method text,
  p_bank_account_name text,
  p_deposit_reference text default null,
  p_notes text default null,
  p_recorded_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_office_cash_account_id uuid;
  v_bank_account_id uuid;
  v_transfer_id uuid;
  v_office_balance_before numeric := 0;
  v_office_balance_after numeric := 0;
  v_bank_balance_before numeric := 0;
  v_bank_balance_after numeric := 0;
  v_description text;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero.' using errcode = '22023';
  end if;

  if p_deposit_date is null then
    raise exception 'Deposit date is required.' using errcode = '22023';
  end if;

  if coalesce(nullif(trim(p_bank_account_name), ''), '') = '' then
    raise exception 'Bank / Account Name is required.' using errcode = '22023';
  end if;

  select o.company_id
    into v_company_id
  from public.offices o
  where o.id = p_office_id;

  if v_company_id is null then
    raise exception 'Office was not found.' using errcode = '22023';
  end if;

  if not public.is_service_role() then
    if public.current_company_id() is distinct from v_company_id
       or not public.can_access_office(p_office_id)
       or not (
        public.has_permission('cash.manage')
        or public.has_permission('collections.manage')
        or public.has_permission('expenses.manage')
       ) then
      raise exception 'RLS denied: office cannot deposit cash for this office.' using errcode = '42501';
    end if;
  end if;

  select ca.id
    into v_office_cash_account_id
  from public.cash_accounts ca
  where ca.company_id = v_company_id
    and ca.office_id = p_office_id
    and ca.account_type = 'office_cash'
    and ca.status = 'active'
  order by ca.created_at asc
  limit 1;

  if v_office_cash_account_id is null then
    insert into public.cash_accounts(company_id, office_id, account_type, name, status)
    values (v_company_id, p_office_id, 'office_cash', 'Office Cash', 'active')
    returning id into v_office_cash_account_id;
  end if;

  select ca.id
    into v_bank_account_id
  from public.cash_accounts ca
  where ca.company_id = v_company_id
    and ca.office_id is null
    and ca.account_type = 'bank'
    and ca.status = 'active'
  order by ca.created_at asc
  limit 1;

  if v_bank_account_id is null then
    insert into public.cash_accounts(company_id, office_id, account_type, name, status)
    values (v_company_id, null, 'bank', 'Company Bank', 'active')
    returning id into v_bank_account_id;
  end if;

  select
    coalesce((
      select sum(coalesce(c.amount_paid, c.amount, 0))
      from public.collections c
      where c.company_id = v_company_id
        and c.office_id = p_office_id
        and lower(coalesce(c.status, 'active')) not in ('voided','removed','removed_by_admin_approval','rejected','pending','cancelled','canceled')
    ), 0)
    + coalesce((
      select sum(ct.amount)
      from public.cash_transactions ct
      where ct.cash_account_id = v_office_cash_account_id
        and ct.transaction_type = 'inflow'
        and ct.source_type = 'admin_float'
    ), 0)
    - coalesce((
      select sum(coalesce(e.amount, 0))
      from public.expenses e
      where e.company_id = v_company_id
        and e.office_id = p_office_id
    ), 0)
    - coalesce((
      select sum(ct.amount)
      from public.cash_transactions ct
      where ct.cash_account_id = v_office_cash_account_id
        and ct.transaction_type = 'outflow'
        and ct.source_type = 'bank_deposit'
    ), 0)
    into v_office_balance_before;

  select coalesce(sum(case when ct.transaction_type = 'outflow' then -ct.amount else ct.amount end), 0)
    into v_bank_balance_before
  from public.cash_transactions ct
  where ct.cash_account_id = v_bank_account_id;

  if p_amount > v_office_balance_before then
    raise exception 'Insufficient office cash. Available: UGX %.', round(v_office_balance_before)::text using errcode = '22023';
  end if;

  insert into public.cash_transfers(
    amount,
    company_id,
    completed_at,
    from_cash_account_id,
    requested_by,
    status,
    to_cash_account_id
  )
  values (
    p_amount,
    v_company_id,
    now(),
    v_office_cash_account_id,
    p_recorded_by,
    'completed',
    v_bank_account_id
  )
  returning id into v_transfer_id;

  v_description := concat_ws(
    ' · ',
    'Banked to ' || trim(p_bank_account_name),
    'via ' || coalesce(nullif(trim(p_deposit_method), ''), 'Bank'),
    case when nullif(trim(coalesce(p_deposit_reference, '')), '') is not null then 'ref ' || trim(p_deposit_reference) end,
    case when nullif(trim(coalesce(p_notes, '')), '') is not null then 'notes: ' || trim(p_notes) end
  );

  insert into public.cash_transactions(
    amount,
    cash_account_id,
    company_id,
    description,
    office_id,
    recorded_by,
    source_id,
    source_type,
    transaction_date,
    transaction_type
  )
  values
  (
    p_amount,
    v_office_cash_account_id,
    v_company_id,
    v_description,
    p_office_id,
    p_recorded_by,
    v_transfer_id,
    'bank_deposit',
    p_deposit_date,
    'outflow'
  ),
  (
    p_amount,
    v_bank_account_id,
    v_company_id,
    v_description,
    p_office_id,
    p_recorded_by,
    v_transfer_id,
    'bank_deposit',
    p_deposit_date,
    'inflow'
  );

  v_office_balance_after := v_office_balance_before - p_amount;
  v_bank_balance_after := v_bank_balance_before + p_amount;

  insert into public.office_cash_movements(
    amount,
    company_id,
    movement_date,
    movement_type,
    notes,
    office_id,
    recorded_by,
    reference,
    source_id,
    source_type
  )
  values (
    p_amount,
    v_company_id,
    p_deposit_date,
    'bank_deposit',
    p_notes,
    p_office_id,
    p_recorded_by,
    p_deposit_reference,
    v_transfer_id,
    'bank_deposit'
  );

  insert into public.bank_deposits(
    amount,
    bank_account_name,
    company_id,
    deposit_date,
    deposit_method,
    deposit_reference,
    notes,
    office_id,
    recorded_by,
    transfer_id
  )
  values (
    p_amount,
    trim(p_bank_account_name),
    v_company_id,
    p_deposit_date,
    coalesce(nullif(trim(p_deposit_method), ''), 'Bank'),
    p_deposit_reference,
    p_notes,
    p_office_id,
    p_recorded_by,
    v_transfer_id
  );

  insert into public.office_cash_balances(
    balance_date,
    company_id,
    money_at_office,
    money_banked,
    office_id,
    updated_at
  )
  values (
    p_deposit_date,
    v_company_id,
    v_office_balance_after,
    p_amount,
    p_office_id,
    now()
  )
  on conflict (company_id, office_id, balance_date)
  do update set
    money_at_office = excluded.money_at_office,
    money_banked = public.office_cash_balances.money_banked + excluded.money_banked,
    updated_at = now();

  insert into public.notifications(
    channel,
    company_id,
    delivery_status,
    is_read,
    message,
    office_id,
    recipient_type,
    title
  )
  values (
    'in_app',
    v_company_id,
    'pending',
    false,
    'UGX ' || trim(to_char(p_amount, 'FM999,999,999,999')) || ' deposited by office.',
    p_office_id,
    'admin',
    'Office cash deposited to bank'
  );

  insert into public.audit_logs(
    action,
    actor_id,
    after_data,
    company_id,
    entity_id,
    entity_type,
    office_id
  )
  values (
    'deposit_office_cash_to_bank',
    p_recorded_by,
    jsonb_build_object(
      'amount', p_amount,
      'office_id', p_office_id,
      'deposit_date', p_deposit_date,
      'deposit_method', p_deposit_method,
      'bank_account_name', p_bank_account_name,
      'deposit_reference', p_deposit_reference,
      'office_balance_before', v_office_balance_before,
      'office_balance_after', v_office_balance_after,
      'bank_balance_before', v_bank_balance_before,
      'bank_balance_after', v_bank_balance_after
    ),
    v_company_id,
    v_transfer_id,
    'cash_transfer',
    p_office_id
  );

  return jsonb_build_object(
    'ok', true,
    'transfer_id', v_transfer_id,
    'office_id', p_office_id,
    'submitted_amount', p_amount,
    'money_at_office_before', v_office_balance_before,
    'money_at_office_after', v_office_balance_after,
    'bank_balance_before', v_bank_balance_before,
    'bank_balance_after', v_bank_balance_after
  );
end;
$$;

grant execute on function public.deposit_office_cash_to_bank(uuid, numeric, date, text, text, text, text, uuid) to authenticated, service_role;
