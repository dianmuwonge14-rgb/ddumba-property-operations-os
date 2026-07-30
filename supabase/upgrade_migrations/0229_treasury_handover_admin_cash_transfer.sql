create table if not exists public.treasury_cash_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete cascade,
  request_type text not null check (request_type in ('banking','cash_handover_admin')),
  amount numeric not null check (amount > 0),
  business_date date not null default current_date,
  method text,
  bank_account_name text,
  reference text,
  reason text not null,
  notes text,
  handed_over_by text,
  received_by_admin uuid references public.users(id) on delete set null,
  received_by_admin_name text,
  supporting_attachment_url text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  submitted_by uuid references public.users(id) on delete set null,
  approved_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  rejected_by uuid references public.users(id) on delete set null,
  rejected_at timestamptz,
  admin_comment text,
  transfer_id uuid references public.cash_transfers(id) on delete set null,
  expense_id uuid references public.expenses(id) on delete set null,
  bank_deposit_id uuid references public.bank_deposits(id) on delete set null,
  notification_id uuid,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_treasury_cash_requests_idempotency
  on public.treasury_cash_requests(company_id, idempotency_key)
  where idempotency_key is not null and btrim(idempotency_key) <> '';

create index if not exists idx_treasury_cash_requests_scope
  on public.treasury_cash_requests(company_id, office_id, business_date desc, status, request_type);

alter table public.treasury_cash_requests enable row level security;

drop policy if exists treasury_cash_requests_read_scope on public.treasury_cash_requests;
create policy treasury_cash_requests_read_scope on public.treasury_cash_requests
for select using (
  public.is_service_role()
  or (
    company_id = public.current_company_id()
    and (
      public.has_permission('cash.manage')
      or public.has_permission('cash.read')
      or public.has_permission('expenses.read')
      or public.can_access_office(office_id)
    )
  )
);

drop policy if exists treasury_cash_requests_service_write on public.treasury_cash_requests;
create policy treasury_cash_requests_service_write on public.treasury_cash_requests
for all using (public.is_service_role()) with check (public.is_service_role());

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
  select ca.id
    into v_account_id
  from public.cash_accounts ca
  where ca.company_id = p_company_id
    and ca.account_type = p_account_type
    and ca.status = 'active'
    and (
      (p_office_id is null and ca.office_id is null)
      or ca.office_id = p_office_id
    )
  order by ca.created_at asc
  limit 1
  for update;

  if v_account_id is null then
    insert into public.cash_accounts(company_id, office_id, account_type, name, status)
    values (p_company_id, p_office_id, p_account_type, p_name, 'active')
    returning id into v_account_id;
  end if;

  return v_account_id;
end;
$$;

create or replace function public.approve_treasury_cash_request(
  p_request_id uuid,
  p_admin_id uuid,
  p_admin_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.treasury_cash_requests%rowtype;
  v_office_cash_account_id uuid;
  v_admin_cash_account_id uuid;
  v_bank_account_id uuid;
  v_transfer_id uuid;
  v_expense_id uuid;
  v_bank_deposit_id uuid;
  v_office_balance_before numeric := 0;
  v_office_balance_after numeric := 0;
  v_admin_cash_before numeric := 0;
  v_admin_cash_after numeric := 0;
  v_bank_balance_before numeric := 0;
  v_bank_balance_after numeric := 0;
  v_description text;
begin
  select *
    into v_request
  from public.treasury_cash_requests
  where id = p_request_id
  for update;

  if v_request.id is null then
    raise exception 'Treasury request was not found.' using errcode = '22023';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Treasury request has already been %.', v_request.status using errcode = '23505';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('treasury-request:' || v_request.company_id::text || ':' || v_request.office_id::text, 0));

  v_office_cash_account_id := public.ddumba_v1_ensure_cash_account(v_request.company_id, v_request.office_id, 'office_cash', 'Office Cash');
  v_admin_cash_account_id := public.ddumba_v1_ensure_cash_account(v_request.company_id, null, 'hq_cash', 'Admin Cash');
  v_bank_account_id := public.ddumba_v1_ensure_cash_account(v_request.company_id, null, 'bank', 'Company Bank');

  v_office_balance_before := public.ddumba_v1_office_cash_ledger_balance(v_office_cash_account_id);
  v_admin_cash_before := public.ddumba_v1_office_cash_ledger_balance(v_admin_cash_account_id);
  v_bank_balance_before := public.ddumba_v1_office_cash_ledger_balance(v_bank_account_id);

  if v_request.amount > v_office_balance_before then
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
    v_request.amount,
    v_request.company_id,
    now(),
    v_office_cash_account_id,
    coalesce(v_request.submitted_by, p_admin_id),
    'completed',
    case when v_request.request_type = 'banking' then v_bank_account_id else v_admin_cash_account_id end
  )
  returning id into v_transfer_id;

  v_description := concat_ws(
    ' · ',
    case when v_request.request_type = 'banking' then 'Office cash banked' else 'Office cash handed to Admin' end,
    'reason: ' || v_request.reason,
    case when nullif(trim(coalesce(v_request.reference, '')), '') is not null then 'ref ' || trim(v_request.reference) end,
    case when nullif(trim(coalesce(v_request.notes, '')), '') is not null then 'notes: ' || trim(v_request.notes) end
  );

  if v_request.request_type = 'banking' then
    insert into public.cash_transactions(
      amount, cash_account_id, company_id, description, direction, notes, occurred_at, office_id,
      payment_method, recorded_by, created_by, approved_by, approved_at, reference, source_id,
      source_type, status, transaction_date, transaction_type, metadata
    )
    values
    (
      v_request.amount, v_office_cash_account_id, v_request.company_id, v_description, 'outflow',
      v_request.notes, v_request.business_date::timestamptz, v_request.office_id, coalesce(v_request.method, 'Bank deposit'),
      coalesce(v_request.submitted_by, p_admin_id), coalesce(v_request.submitted_by, p_admin_id), p_admin_id, now(),
      v_request.reference, v_transfer_id, 'bank_deposit', 'approved', v_request.business_date, 'outflow',
      jsonb_build_object('bank_account_name', coalesce(v_request.bank_account_name, 'Company Bank'), 'request_id', v_request.id)
    ),
    (
      v_request.amount, v_bank_account_id, v_request.company_id, v_description, 'inflow',
      v_request.notes, v_request.business_date::timestamptz, v_request.office_id, coalesce(v_request.method, 'Bank deposit'),
      coalesce(v_request.submitted_by, p_admin_id), coalesce(v_request.submitted_by, p_admin_id), p_admin_id, now(),
      v_request.reference, v_transfer_id, 'bank_deposit', 'approved', v_request.business_date, 'inflow',
      jsonb_build_object('bank_account_name', coalesce(v_request.bank_account_name, 'Company Bank'), 'request_id', v_request.id)
    );

    insert into public.bank_deposits(
      amount, bank_account_name, company_id, deposit_date, deposit_method, deposit_reference,
      notes, office_id, recorded_by, transfer_id
    )
    values (
      v_request.amount, coalesce(v_request.bank_account_name, 'Company Bank'), v_request.company_id,
      v_request.business_date, coalesce(v_request.method, 'Bank deposit'), v_request.reference,
      v_request.notes, v_request.office_id, coalesce(v_request.submitted_by, p_admin_id), v_transfer_id
    )
    returning id into v_bank_deposit_id;

    insert into public.office_cash_movements(
      amount, company_id, movement_date, movement_type, notes, office_id, recorded_by, reference, source_id, source_type
    )
    values (
      v_request.amount, v_request.company_id, v_request.business_date, 'bank_deposit', v_request.notes,
      v_request.office_id, coalesce(v_request.submitted_by, p_admin_id), v_request.reference, v_transfer_id, 'bank_deposit'
    );
  else
    insert into public.expenses(
      amount, category, company_id, description, entered_by, expense_date, expense_number,
      item, office_id, payment_method, status, submitted_by, approved_by, approved_at
    )
    values (
      v_request.amount, 'Cash Handover to Admin', v_request.company_id, v_request.reason,
      coalesce(v_request.submitted_by, p_admin_id), v_request.business_date, 'HANDOVER-' || left(v_request.id::text, 8),
      'Cash Handover to Admin', v_request.office_id, 'cash', 'approved',
      coalesce(v_request.submitted_by, p_admin_id), p_admin_id, now()
    )
    returning id into v_expense_id;

    insert into public.cash_transactions(
      amount, cash_account_id, company_id, description, direction, notes, occurred_at, office_id,
      payment_method, recorded_by, created_by, approved_by, approved_at, reference, source_id,
      source_type, status, transaction_date, transaction_type, metadata
    )
    values
    (
      v_request.amount, v_office_cash_account_id, v_request.company_id, v_description, 'outflow',
      v_request.notes, v_request.business_date::timestamptz, v_request.office_id, 'cash',
      coalesce(v_request.submitted_by, p_admin_id), coalesce(v_request.submitted_by, p_admin_id), p_admin_id, now(),
      v_request.reference, v_transfer_id, 'office_to_admin_transfer', 'approved', v_request.business_date, 'outflow',
      jsonb_build_object('request_id', v_request.id, 'expense_id', v_expense_id)
    ),
    (
      v_request.amount, v_admin_cash_account_id, v_request.company_id, v_description, 'inflow',
      v_request.notes, v_request.business_date::timestamptz, v_request.office_id, 'cash',
      coalesce(v_request.submitted_by, p_admin_id), coalesce(v_request.submitted_by, p_admin_id), p_admin_id, now(),
      v_request.reference, v_transfer_id, 'office_to_admin_transfer', 'approved', v_request.business_date, 'inflow',
      jsonb_build_object('request_id', v_request.id, 'expense_id', v_expense_id)
    );

    insert into public.office_cash_movements(
      amount, company_id, movement_date, movement_type, notes, office_id, recorded_by, reference, source_id, source_type
    )
    values (
      v_request.amount, v_request.company_id, v_request.business_date, 'cash_handover_to_admin', v_request.notes,
      v_request.office_id, coalesce(v_request.submitted_by, p_admin_id), v_request.reference, v_transfer_id, 'office_to_admin_transfer'
    );

    insert into public.admin_cash_movements(
      amount, company_id, movement_date, movement_type, notes, office_id, recorded_by, reference, source, transfer_id
    )
    values (
      v_request.amount, v_request.company_id, v_request.business_date, 'office_cash_handover_received',
      v_request.notes, v_request.office_id, p_admin_id, v_request.reference, 'office_cash_handover', v_transfer_id
    );
  end if;

  v_office_balance_after := v_office_balance_before - v_request.amount;
  v_admin_cash_after := case when v_request.request_type = 'cash_handover_admin' then v_admin_cash_before + v_request.amount else v_admin_cash_before end;
  v_bank_balance_after := case when v_request.request_type = 'banking' then v_bank_balance_before + v_request.amount else v_bank_balance_before end;

  update public.treasury_cash_requests
  set status = 'approved',
      approved_by = p_admin_id,
      approved_at = now(),
      admin_comment = p_admin_comment,
      transfer_id = v_transfer_id,
      expense_id = v_expense_id,
      bank_deposit_id = v_bank_deposit_id,
      updated_at = now()
  where id = v_request.id;

  insert into public.audit_logs(
    company_id, office_id, actor_id, action, entity_type, entity_id, before_data, after_data
  )
  values (
    v_request.company_id,
    v_request.office_id,
    p_admin_id,
    'approve_treasury_cash_request',
    'treasury_cash_request',
    v_request.id,
    jsonb_build_object('status', 'pending', 'office_cash_before', v_office_balance_before, 'admin_cash_before', v_admin_cash_before, 'bank_before', v_bank_balance_before),
    jsonb_build_object('status', 'approved', 'request_type', v_request.request_type, 'amount', v_request.amount, 'transfer_id', v_transfer_id, 'expense_id', v_expense_id, 'bank_deposit_id', v_bank_deposit_id, 'office_cash_after', v_office_balance_after, 'admin_cash_after', v_admin_cash_after, 'bank_after', v_bank_balance_after)
  );

  return jsonb_build_object(
    'ok', true,
    'request_id', v_request.id,
    'request_type', v_request.request_type,
    'submitted_amount', v_request.amount,
    'office_id', v_request.office_id,
    'transfer_id', v_transfer_id,
    'expense_id', v_expense_id,
    'bank_deposit_id', v_bank_deposit_id,
    'money_at_office_before', v_office_balance_before,
    'money_at_office_after', v_office_balance_after,
    'admin_cash_before', v_admin_cash_before,
    'admin_cash_after', v_admin_cash_after,
    'bank_balance_before', v_bank_balance_before,
    'bank_balance_after', v_bank_balance_after
  );
end;
$$;

grant execute on function public.ddumba_v1_ensure_cash_account(uuid, uuid, text, text) to authenticated, service_role;
grant execute on function public.approve_treasury_cash_request(uuid, uuid, text) to authenticated, service_role;

alter table if exists public.collections
  add column if not exists financial_effective boolean not null default true,
  add column if not exists reversed_at timestamptz,
  add column if not exists voided_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists superseded_at timestamptz,
  add column if not exists superseded_by_payment_id uuid,
  add column if not exists corrected_by_payment_id uuid,
  add column if not exists correction_of_payment_id uuid;

create unique index if not exists idx_collections_admin_cash_transfer_reference
  on public.collections(company_id, office_id, reference_number)
  where type = 'ADMIN_CASH_TRANSFER' and reference_number is not null;

insert into public.collections(
  amount,
  amount_paid,
  company_id,
  collection_number,
  entered_by_account_id,
  entered_by_name,
  notes,
  office_id,
  paid_at,
  payment_date,
  payment_method,
  recorded_by,
  reference_number,
  status,
  type,
  financial_effective
)
select
  ct.amount,
  ct.amount,
  ct.company_id,
  'ADMIN-CASH-' || ct.source_id::text,
  ct.recorded_by,
  'Admin Cash Transfer',
  coalesce(ct.notes, ct.description),
  ct.office_id,
  coalesce(ct.occurred_at, ct.transaction_date::timestamptz, ct.created_at),
  coalesce(ct.transaction_date::date, ct.created_at::date),
  coalesce(ct.payment_method, 'Admin Cash Transfer'),
  ct.recorded_by,
  'ADMIN-CASH-' || ct.source_id::text,
  'paid',
  'ADMIN_CASH_TRANSFER',
  true
from public.cash_transactions ct
join public.cash_accounts ca on ca.id = ct.cash_account_id
where ca.account_type = 'office_cash'
  and ct.source_type = 'admin_float'
  and ct.transaction_type = 'inflow'
  and ct.office_id is not null
  and lower(coalesce(ct.status, 'approved')) in ('approved','completed','posted')
  and not exists (
    select 1
    from public.collections c
    where c.company_id = ct.company_id
      and c.office_id = ct.office_id
      and c.type = 'ADMIN_CASH_TRANSFER'
      and c.reference_number = 'ADMIN-CASH-' || ct.source_id::text
  )
  and not exists (
    select 1
    from public.collections c
    where c.collection_number = 'ADMIN-CASH-' || ct.source_id::text
  )
on conflict (collection_number) do nothing;
