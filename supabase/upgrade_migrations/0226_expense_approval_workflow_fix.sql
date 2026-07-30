alter table public.expenses
    add column if not exists status text,
    add column if not exists payment_method text,
    add column if not exists cash_source_type text,
    add column if not exists cash_source_id uuid,
    add column if not exists rejected_by uuid,
    add column if not exists rejected_at timestamptz,
    add column if not exists rejection_reason text;

alter table public.notifications
    add column if not exists entity_id uuid,
    add column if not exists entity_type text,
    add column if not exists action_url text,
    add column if not exists severity text,
    add column if not exists recipient_user_id uuid,
    add column if not exists resolved_at timestamptz,
    add column if not exists resolved_by uuid,
    add column if not exists resolution_status text;

create index if not exists idx_expenses_pending_approval_queue
    on public.expenses(company_id, status, expense_date desc, created_at desc)
    where lower(coalesce(status, 'pending')) = 'pending';

create unique index if not exists idx_cash_transactions_one_expense_outflow
    on public.cash_transactions(company_id, source_type, source_id)
    where source_type = 'expense'
      and transaction_type = 'outflow'
      and source_id is not null;

create index if not exists idx_notifications_expense_entity
    on public.notifications(company_id, entity_type, entity_id, recipient_type, is_read);

create or replace function public.ddumba_approve_pending_expense(
    p_company_id uuid,
    p_expense_id uuid,
    p_actor_employee_id uuid,
    p_actor_user_id uuid,
    p_admin_note text default null
)
returns public.expenses
language plpgsql
security definer
set search_path = public
as $$
declare
    v_expense public.expenses%rowtype;
    v_updated public.expenses%rowtype;
    v_cash_account_id uuid;
    v_now timestamptz := now();
    v_note text := nullif(trim(coalesce(p_admin_note, '')), '');
begin
    select *
      into v_expense
      from public.expenses
     where id = p_expense_id
       and company_id = p_company_id
     for update;

    if not found then
        raise exception 'Expense request was not found.';
    end if;

    if lower(coalesce(v_expense.status, case when v_expense.approved_at is not null then 'approved' else 'pending' end)) = 'approved' then
        update public.notifications
           set is_read = true,
               delivery_status = 'actioned',
               resolved_at = coalesce(resolved_at, v_now),
               resolved_by = coalesce(resolved_by, p_actor_user_id),
               resolution_status = coalesce(resolution_status, 'approved')
         where company_id = p_company_id
           and entity_type = 'expense'
           and entity_id = v_expense.id
           and recipient_type = 'admin';

        return v_expense;
    end if;

    if lower(coalesce(v_expense.status, 'pending')) <> 'pending' then
        raise exception 'Only pending expenses can be approved. Current status: %', coalesce(v_expense.status, 'unknown');
    end if;

    update public.expenses
       set approved_at = v_now,
           approved_by = p_actor_employee_id,
           description = case
             when v_note is null then coalesce(v_expense.description, '')
             else trim(coalesce(v_expense.description, '') || E'\n[approved] ' || v_note)
           end,
           payment_method = coalesce(nullif(payment_method, ''), 'unspecified'),
           status = 'approved',
           updated_at = v_now
     where id = v_expense.id
       and company_id = p_company_id
       and lower(coalesce(status, 'pending')) = 'pending'
     returning * into v_updated;

    if not found then
        raise exception 'Expense approval failed. No changes were applied.';
    end if;

    select id
      into v_cash_account_id
      from public.cash_accounts
     where company_id = p_company_id
       and office_id = v_updated.office_id
       and account_type = 'office_cash'
       and status = 'active'
     order by created_at asc
     limit 1;

    if v_cash_account_id is not null and coalesce(v_updated.amount, 0) > 0 then
        insert into public.cash_transactions (
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
        values (
            v_updated.amount,
            v_cash_account_id,
            p_company_id,
            'Approved office expense: ' || coalesce(v_updated.item, v_updated.category, 'Expense'),
            v_updated.office_id,
            p_actor_user_id,
            v_updated.id,
            'expense',
            coalesce(v_updated.expense_date, current_date),
            'outflow'
        )
        on conflict do nothing;
    end if;

    update public.notifications
       set is_read = true,
           delivery_status = 'actioned',
           resolved_at = v_now,
           resolved_by = p_actor_user_id,
           resolution_status = 'approved'
     where company_id = p_company_id
       and entity_type = 'expense'
       and entity_id = v_updated.id
       and recipient_type = 'admin';

    return v_updated;
end;
$$;

grant execute on function public.ddumba_approve_pending_expense(uuid, uuid, uuid, uuid, text) to authenticated, service_role;
