alter table public.cash_transfers
  add column if not exists correction_metadata jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.ddumba_v1_ensure_cash_account(
  p_company_id uuid,
  p_office_id uuid,
  p_account_type text,
  p_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid;
begin
  select id into v_account_id
  from public.cash_accounts
  where company_id = p_company_id
    and account_type = p_account_type
    and coalesce(office_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_office_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and coalesce(status, 'active') = 'active'
  order by created_at asc
  limit 1;

  if v_account_id is not null then
    return v_account_id;
  end if;

  insert into public.cash_accounts(company_id, office_id, account_type, name, status)
  values (p_company_id, p_office_id, p_account_type, p_name, 'active')
  returning id into v_account_id;

  return v_account_id;
end;
$$;

create or replace function public.ddumba_v1_actor_is_company_admin(p_actor_id uuid, p_company_id uuid)
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
    where uor.user_id = p_actor_id
      and uor.company_id = p_company_id
      and uor.office_id is null
      and r.key in ('company_admin','super_admin','hq_executive')
  )
$$;

create or replace function public.reassign_admin_office_transfer(
  p_transfer_id uuid,
  p_correct_office_id uuid,
  p_reason text,
  p_actor_id uuid,
  p_company_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transfer public.cash_transfers%rowtype;
  v_old_account public.cash_accounts%rowtype;
  v_new_account_id uuid;
  v_old_office_name text;
  v_new_office_name text;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if not public.ddumba_v1_actor_is_company_admin(p_actor_id, p_company_id) then
    raise exception 'Only Admin can correct office cash transfers.';
  end if;

  if v_reason is null then
    raise exception 'Correction reason is required.';
  end if;

  select * into v_transfer
  from public.cash_transfers
  where id = p_transfer_id
    and company_id = p_company_id
  for update;

  if v_transfer.id is null then
    raise exception 'Transfer not found.';
  end if;

  if v_transfer.status = 'cancelled' then
    raise exception 'Cancelled transfer cannot be reassigned.';
  end if;

  select * into v_old_account
  from public.cash_accounts
  where id = v_transfer.to_cash_account_id
    and company_id = p_company_id;

  if v_old_account.id is null or v_old_account.account_type <> 'office_cash' or v_old_account.office_id is null then
    raise exception 'Only admin-to-office transfers can be reassigned.';
  end if;

  if v_old_account.office_id = p_correct_office_id then
    raise exception 'Transfer is already assigned to this office.';
  end if;

  if not exists (select 1 from public.offices where id = p_correct_office_id and company_id = p_company_id and coalesce(lower(status), 'active') = 'active') then
    raise exception 'Correct office is not active in this company.';
  end if;

  v_new_account_id := public.ddumba_v1_ensure_cash_account(p_company_id, p_correct_office_id, 'office_cash', 'Office Cash');

  select coalesce(office_name, name, 'Office') into v_old_office_name from public.offices where id = v_old_account.office_id;
  select coalesce(office_name, name, 'Office') into v_new_office_name from public.offices where id = p_correct_office_id;

  insert into public.cash_transactions(
    company_id, office_id, cash_account_id, transaction_type, source_type, source_id, amount, transaction_date, description, recorded_by
  )
  values
  (
    p_company_id,
    v_old_account.office_id,
    v_old_account.id,
    'outflow',
    'admin_float',
    p_transfer_id,
    v_transfer.amount,
    now(),
    'Admin transfer reassigned out of ' || v_old_office_name || ' to ' || v_new_office_name || ' · reason: ' || v_reason,
    p_actor_id
  ),
  (
    p_company_id,
    p_correct_office_id,
    v_new_account_id,
    'inflow',
    'admin_float',
    p_transfer_id,
    v_transfer.amount,
    now(),
    'Admin transfer reassigned from ' || v_old_office_name || ' to ' || v_new_office_name || ' · reason: ' || v_reason,
    p_actor_id
  );

  update public.cash_transfers
  set to_cash_account_id = v_new_account_id,
      correction_metadata = correction_metadata || jsonb_build_object(
        'last_action', 'reassigned',
        'previous_office_id', v_old_account.office_id,
        'correct_office_id', p_correct_office_id,
        'reason', v_reason,
        'corrected_by', p_actor_id,
        'corrected_at', now()
      ),
      updated_at = now()
  where id = p_transfer_id;

  insert into public.notifications(company_id, office_id, recipient_type, channel, title, message, severity, delivery_status, is_read, entity_type, entity_id, action_url)
  values
    (p_company_id, v_old_account.office_id, 'office', 'in_app', 'Office transfer corrected', 'Admin moved UGX ' || trim(to_char(v_transfer.amount, 'FM999,999,999,999')) || ' from your office to ' || v_new_office_name || '.', 'warning', 'pending', false, 'cash_transfer', p_transfer_id, '/office/cash-banking'),
    (p_company_id, p_correct_office_id, 'office', 'in_app', 'Office transfer received', 'Admin reassigned UGX ' || trim(to_char(v_transfer.amount, 'FM999,999,999,999')) || ' to your office.', 'success', 'pending', false, 'cash_transfer', p_transfer_id, '/office/cash-banking');

  insert into public.audit_logs(company_id, office_id, actor_id, action, entity_type, entity_id, before_data, after_data, created_at)
  values (
    p_company_id,
    p_correct_office_id,
    p_actor_id,
    'admin_office_transfer_reassigned',
    'cash_transfer',
    p_transfer_id,
    jsonb_build_object('old_office_id', v_old_account.office_id, 'amount', v_transfer.amount),
    jsonb_build_object('new_office_id', p_correct_office_id, 'reason', v_reason, 'amount', v_transfer.amount),
    now()
  );

  return jsonb_build_object(
    'ok', true,
    'transfer_id', p_transfer_id,
    'old_office_id', v_old_account.office_id,
    'new_office_id', p_correct_office_id,
    'amount', v_transfer.amount
  );
end;
$$;

create or replace function public.cancel_admin_office_transfer(
  p_transfer_id uuid,
  p_reason text,
  p_actor_id uuid,
  p_company_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transfer public.cash_transfers%rowtype;
  v_office_account public.cash_accounts%rowtype;
  v_source_account public.cash_accounts%rowtype;
  v_office_name text;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if not public.ddumba_v1_actor_is_company_admin(p_actor_id, p_company_id) then
    raise exception 'Only Admin can cancel office cash transfers.';
  end if;

  if v_reason is null then
    raise exception 'Cancellation reason is required.';
  end if;

  select * into v_transfer
  from public.cash_transfers
  where id = p_transfer_id
    and company_id = p_company_id
  for update;

  if v_transfer.id is null then
    raise exception 'Transfer not found.';
  end if;

  if v_transfer.status = 'cancelled' then
    raise exception 'Transfer is already cancelled.';
  end if;

  select * into v_office_account
  from public.cash_accounts
  where id = v_transfer.to_cash_account_id
    and company_id = p_company_id;

  select * into v_source_account
  from public.cash_accounts
  where id = v_transfer.from_cash_account_id
    and company_id = p_company_id;

  if v_office_account.id is null or v_office_account.account_type <> 'office_cash' or v_office_account.office_id is null then
    raise exception 'Only admin-to-office transfers can be cancelled.';
  end if;

  if v_source_account.id is null or v_source_account.account_type not in ('bank','hq_cash') then
    raise exception 'Transfer source account is invalid.';
  end if;

  select coalesce(office_name, name, 'Office') into v_office_name from public.offices where id = v_office_account.office_id;

  insert into public.cash_transactions(
    company_id, office_id, cash_account_id, transaction_type, source_type, source_id, amount, transaction_date, description, recorded_by
  )
  values
  (
    p_company_id,
    v_office_account.office_id,
    v_office_account.id,
    'outflow',
    'admin_float',
    p_transfer_id,
    v_transfer.amount,
    now(),
    'Admin transfer cancelled from ' || v_office_name || ' · reason: ' || v_reason,
    p_actor_id
  ),
  (
    p_company_id,
    v_office_account.office_id,
    v_source_account.id,
    'inflow',
    'admin_float_cancel',
    p_transfer_id,
    v_transfer.amount,
    now(),
    'Admin transfer returned to ' || v_source_account.name || ' from ' || v_office_name || ' · reason: ' || v_reason,
    p_actor_id
  );

  update public.cash_transfers
  set status = 'cancelled',
      correction_metadata = correction_metadata || jsonb_build_object(
        'last_action', 'cancelled',
        'office_id', v_office_account.office_id,
        'reason', v_reason,
        'cancelled_by', p_actor_id,
        'cancelled_at', now()
      ),
      updated_at = now()
  where id = p_transfer_id;

  insert into public.notifications(company_id, office_id, recipient_type, channel, title, message, severity, delivery_status, is_read, entity_type, entity_id, action_url)
  values (
    p_company_id,
    v_office_account.office_id,
    'office',
    'in_app',
    'Office transfer cancelled',
    'Admin cancelled UGX ' || trim(to_char(v_transfer.amount, 'FM999,999,999,999')) || ' previously sent to your office. Reason: ' || v_reason,
    'warning',
    'pending',
    false,
    'cash_transfer',
    p_transfer_id,
    '/office/cash-banking'
  );

  insert into public.audit_logs(company_id, office_id, actor_id, action, entity_type, entity_id, before_data, after_data, created_at)
  values (
    p_company_id,
    v_office_account.office_id,
    p_actor_id,
    'admin_office_transfer_cancelled',
    'cash_transfer',
    p_transfer_id,
    jsonb_build_object('office_id', v_office_account.office_id, 'amount', v_transfer.amount, 'status', v_transfer.status),
    jsonb_build_object('status', 'cancelled', 'reason', v_reason, 'amount', v_transfer.amount),
    now()
  );

  return jsonb_build_object(
    'ok', true,
    'transfer_id', p_transfer_id,
    'office_id', v_office_account.office_id,
    'amount', v_transfer.amount
  );
end;
$$;

grant execute on function public.reassign_admin_office_transfer(uuid, uuid, text, uuid, uuid) to authenticated, service_role;
grant execute on function public.cancel_admin_office_transfer(uuid, text, uuid, uuid) to authenticated, service_role;
