-- Collector receipt history access and defaulter navigation support.
-- Additive/safe: no financial data changes.

create or replace function public.ddumba_v1_is_field_collector()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    left join public.user_office_roles uor
      on uor.user_id = u.id
      and uor.company_id = u.company_id
    left join public.roles r
      on r.id = uor.role_id
    where u.id = auth.uid()
      and u.company_id = public.ddumba_v1_current_company_id()
      and coalesce(u.status, 'active') = 'active'
      and (
        coalesce(u.account_type, '') in ('field_collector', 'collector')
        or coalesce(r.key, '') in ('field_collector', 'collector')
      )
  )
$$;

drop policy if exists payment_receipts_select on public.payment_receipts;
create policy payment_receipts_select
on public.payment_receipts
for select
using (
    public.ddumba_v1_is_service_role()
    or public.ddumba_v1_is_company_admin()
    or (
      public.ddumba_v1_is_field_collector()
      and company_id = public.ddumba_v1_current_company_id()
    )
    or (office_id is not null and public.ddumba_v1_can_access_office(office_id))
    or issued_by = auth.uid()
);

drop policy if exists payment_receipt_delivery_logs_select on public.payment_receipt_delivery_logs;
create policy payment_receipt_delivery_logs_select
on public.payment_receipt_delivery_logs
for select
using (
    public.ddumba_v1_is_service_role()
    or public.ddumba_v1_is_company_admin()
    or exists (
        select 1
        from public.payment_receipts receipt
        where receipt.id = payment_receipt_delivery_logs.receipt_id
          and receipt.company_id = public.ddumba_v1_current_company_id()
          and (
            public.ddumba_v1_is_field_collector()
            or receipt.issued_by = auth.uid()
            or (receipt.office_id is not null and public.ddumba_v1_can_access_office(receipt.office_id))
          )
    )
);
