-- Allow office users to create tenant-vacate landlord recovery deductions
-- for their own office while keeping admin/service-role full control.

alter table public.landlord_debt_deductions enable row level security;

drop policy if exists landlord_debt_deductions_office_vacate_insert on public.landlord_debt_deductions;
create policy landlord_debt_deductions_office_vacate_insert
on public.landlord_debt_deductions
for insert
with check (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and public.ddumba_v1_can_access_office(office_id)
        and coalesce(reason, '') = 'Tenant vacated with unpaid balance'
        and coalesce(status, '') = 'pending'
        and tenant_id is not null
        and room_id is not null
        and vacated_tenant_debt_id is not null
        and exists (
            select 1
            from public.vacated_tenant_debts debt
            where debt.id = landlord_debt_deductions.vacated_tenant_debt_id
              and debt.company_id = landlord_debt_deductions.company_id
              and debt.office_id = landlord_debt_deductions.office_id
              and debt.tenant_id = landlord_debt_deductions.tenant_id
              and debt.room_id = landlord_debt_deductions.room_id
              and debt.recovery_status = 'pending'
        )
    )
);

drop policy if exists landlord_debt_deductions_office_vacate_update on public.landlord_debt_deductions;
create policy landlord_debt_deductions_office_vacate_update
on public.landlord_debt_deductions
for update
using (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and public.ddumba_v1_can_access_office(office_id)
        and coalesce(reason, '') = 'Tenant vacated with unpaid balance'
    )
)
with check (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and public.ddumba_v1_can_access_office(office_id)
        and coalesce(reason, '') = 'Tenant vacated with unpaid balance'
        and status in ('pending', 'partially_applied', 'applied')
    )
);
