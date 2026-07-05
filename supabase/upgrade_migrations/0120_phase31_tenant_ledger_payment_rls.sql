-- Phase 31: allow authenticated collection/payment workflows to append tenant ledger
-- and office cash entries without weakening office isolation.

do $$
begin
  if exists (
    select 1
    from pg_tables
    where schemaname = 'public'
      and tablename = 'tenant_ledger_entries'
  ) then
    drop policy if exists ddumba_v1_tenant_ledger_payment_insert on public.tenant_ledger_entries;

    create policy ddumba_v1_tenant_ledger_payment_insert on public.tenant_ledger_entries
    for insert
    with check (
      public.is_service_role()
      or (
        company_id = public.current_company_id()
        and public.can_access_office(office_id)
        and public.has_permission('collections.payment.post')
      )
    );
  end if;

  if exists (
    select 1
    from pg_tables
    where schemaname = 'public'
      and tablename = 'cash_transactions'
  ) then
    drop policy if exists ddumba_v1_cash_transactions_collection_insert on public.cash_transactions;

    create policy ddumba_v1_cash_transactions_collection_insert on public.cash_transactions
    for insert
    with check (
      public.is_service_role()
      or (
        company_id = public.current_company_id()
        and public.can_access_office(office_id)
        and public.has_permission('collections.payment.post')
        and source_type = 'collection'
        and transaction_type = 'inflow'
      )
    );
  end if;
end;
$$;
