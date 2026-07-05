-- Phase 142: Landlord finance RLS and source-scope hardening.
-- Additive/safe only. No real landlords, rooms, tenants, payments, or room assignments are deleted.

-- Keep source records as marker/audit records only. Current active marker rows are unique by
-- company + office + landlord + month; older duplicates are archived.
with ranked_sources as (
    select
        id,
        row_number() over (
            partition by company_id, office_id, landlord_id, settlement_month
            order by imported_at desc nulls last, created_at desc nulls last, id desc
        ) as rn
    from public.landlord_payment_source_records
    where landlord_id is not null
      and office_id is not null
      and company_id is not null
)
update public.landlord_payment_source_records source
set active = case when ranked_sources.rn = 1 then true else false end
from ranked_sources
where source.id = ranked_sources.id;

create unique index if not exists idx_landlord_payment_source_one_active_office_month
    on public.landlord_payment_source_records(company_id, office_id, landlord_id, settlement_month)
    where active = true
      and company_id is not null
      and office_id is not null
      and landlord_id is not null;

create index if not exists idx_landlord_payment_source_active_marker_scope
    on public.landlord_payment_source_records(company_id, settlement_month, active, paid_unpaid_marker, office_id, landlord_id);

create index if not exists idx_landlord_monthly_payables_current_scope
    on public.landlord_monthly_payables(company_id, settlement_month, office_id, landlord_id, status);

create index if not exists idx_landlord_monthly_payables_marker_notes
    on public.landlord_monthly_payables(company_id, settlement_month, landlord_id)
    where reasons_notes ilike '%cleared_month=%';

create index if not exists idx_landlord_monthly_payable_payments_month_scope
    on public.landlord_monthly_payable_payments(company_id, office_id, landlord_id, paid_at desc, monthly_payable_id);

create index if not exists idx_landlord_advances_active_scope
    on public.landlord_advances(company_id, office_id, landlord_id, status, date_given desc);

create index if not exists idx_landlord_debt_deductions_active_scope
    on public.landlord_debt_deductions(company_id, office_id, landlord_id, status, created_at desc);

create index if not exists idx_room_rent_change_requests_scope_decision
    on public.room_rent_change_requests(company_id, office_id, status, effective_date, created_at desc);

create index if not exists idx_audit_logs_company_office_created
    on public.audit_logs(company_id, office_id, created_at desc);

alter table public.landlords enable row level security;
alter table public.rooms enable row level security;
alter table public.landlord_payment_source_records enable row level security;
alter table public.landlord_monthly_payables enable row level security;
alter table public.landlord_monthly_payable_payments enable row level security;
alter table public.landlord_advances enable row level security;
alter table public.landlord_debt_deductions enable row level security;
alter table public.room_rent_change_requests enable row level security;
alter table public.audit_logs enable row level security;

-- Payment source records are marker/audit records. Office users may read their office markers,
-- but only admins/service role may create or mutate import marker records.
drop policy if exists landlord_payment_source_records_office_scope_select on public.landlord_payment_source_records;
create policy landlord_payment_source_records_office_scope_select
on public.landlord_payment_source_records
for select
using (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and (
            public.ddumba_v1_is_company_admin()
            or (office_id is not null and public.ddumba_v1_can_access_office(office_id))
        )
    )
);

drop policy if exists landlord_payment_source_records_admin_write on public.landlord_payment_source_records;
create policy landlord_payment_source_records_admin_write
on public.landlord_payment_source_records
for all
using (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and public.ddumba_v1_is_company_admin()
    )
)
with check (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and public.ddumba_v1_is_company_admin()
    )
);

drop policy if exists landlord_monthly_payables_office_scope_select on public.landlord_monthly_payables;
create policy landlord_monthly_payables_office_scope_select
on public.landlord_monthly_payables
for select
using (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and (
            public.ddumba_v1_is_company_admin()
            or public.ddumba_v1_can_access_office(office_id)
        )
    )
);

drop policy if exists landlord_monthly_payables_office_scope_write on public.landlord_monthly_payables;
drop policy if exists landlord_monthly_payables_admin_write on public.landlord_monthly_payables;
create policy landlord_monthly_payables_admin_write
on public.landlord_monthly_payables
for all
using (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and public.ddumba_v1_is_company_admin()
    )
)
with check (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and public.ddumba_v1_is_company_admin()
    )
);

drop policy if exists landlord_monthly_payable_payments_office_scope_select on public.landlord_monthly_payable_payments;
create policy landlord_monthly_payable_payments_office_scope_select
on public.landlord_monthly_payable_payments
for select
using (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and (
            public.ddumba_v1_is_company_admin()
            or public.ddumba_v1_can_access_office(office_id)
        )
    )
);

drop policy if exists landlord_monthly_payable_payments_office_scope_write on public.landlord_monthly_payable_payments;
drop policy if exists landlord_monthly_payable_payments_admin_write on public.landlord_monthly_payable_payments;
create policy landlord_monthly_payable_payments_admin_write
on public.landlord_monthly_payable_payments
for all
using (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and public.ddumba_v1_is_company_admin()
    )
)
with check (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and public.ddumba_v1_is_company_admin()
    )
);

drop policy if exists landlord_advances_read on public.landlord_advances;
create policy landlord_advances_read
on public.landlord_advances
for select
using (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and (
            public.ddumba_v1_is_company_admin()
            or (office_id is not null and public.ddumba_v1_can_access_office(office_id))
        )
    )
);

drop policy if exists landlord_advances_admin_insert on public.landlord_advances;
drop policy if exists landlord_advances_admin_update on public.landlord_advances;
drop policy if exists landlord_advances_admin_write on public.landlord_advances;
create policy landlord_advances_admin_write
on public.landlord_advances
for all
using (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and public.ddumba_v1_is_company_admin()
    )
)
with check (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and public.ddumba_v1_is_company_admin()
    )
);

drop policy if exists landlord_debt_deductions_office_scope_select on public.landlord_debt_deductions;
drop policy if exists landlord_debt_deductions_office_read on public.landlord_debt_deductions;
create policy landlord_debt_deductions_office_scope_select
on public.landlord_debt_deductions
for select
using (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and (
            public.ddumba_v1_is_company_admin()
            or public.ddumba_v1_can_access_office(office_id)
        )
    )
);

drop policy if exists landlord_debt_deductions_office_scope_write on public.landlord_debt_deductions;
drop policy if exists landlord_debt_deductions_office_insert on public.landlord_debt_deductions;
drop policy if exists landlord_debt_deductions_office_update on public.landlord_debt_deductions;
drop policy if exists landlord_debt_deductions_admin_write on public.landlord_debt_deductions;
create policy landlord_debt_deductions_admin_write
on public.landlord_debt_deductions
for all
using (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and public.ddumba_v1_is_company_admin()
    )
)
with check (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and public.ddumba_v1_is_company_admin()
    )
);

drop policy if exists room_rent_change_requests_read on public.room_rent_change_requests;
create policy room_rent_change_requests_read
on public.room_rent_change_requests
for select
using (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and (
            public.ddumba_v1_is_company_admin()
            or public.ddumba_v1_can_access_office(office_id)
        )
    )
);

drop policy if exists room_rent_change_requests_insert on public.room_rent_change_requests;
create policy room_rent_change_requests_insert
on public.room_rent_change_requests
for insert
with check (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and (
            public.ddumba_v1_is_company_admin()
            or public.ddumba_v1_can_access_office(office_id)
        )
    )
);

drop policy if exists room_rent_change_requests_admin_update on public.room_rent_change_requests;
create policy room_rent_change_requests_admin_update
on public.room_rent_change_requests
for update
using (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and public.ddumba_v1_is_company_admin()
    )
)
with check (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and public.ddumba_v1_is_company_admin()
    )
);

drop policy if exists ddumba_v1_audit_logs_read on public.audit_logs;
drop policy if exists ddumba_v1_audit_logs_office_read on public.audit_logs;
drop policy if exists audit_logs_append_select on public.audit_logs;
create policy ddumba_v1_audit_logs_read
on public.audit_logs
for select
using (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and (
            public.ddumba_v1_is_company_admin()
            or office_id is null
            or public.ddumba_v1_can_access_office(office_id)
        )
    )
);

drop policy if exists ddumba_v1_audit_logs_insert on public.audit_logs;
drop policy if exists audit_logs_append_insert on public.audit_logs;
create policy ddumba_v1_audit_logs_insert
on public.audit_logs
for insert
with check (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and (
            public.ddumba_v1_is_company_admin()
            or office_id is null
            or public.ddumba_v1_can_access_office(office_id)
        )
    )
);

-- Summary tables: admins can write; office users read only their office. Company summary is admin-only.
alter table if exists public.office_finance_summary enable row level security;
alter table if exists public.company_finance_summary enable row level security;
alter table if exists public.landlord_summary enable row level security;
alter table if exists public.landlord_room_summary enable row level security;
alter table if exists public.monthly_settlement_summary enable row level security;

drop policy if exists office_finance_summary_read on public.office_finance_summary;
drop policy if exists office_finance_summary_office_read on public.office_finance_summary;
create policy office_finance_summary_read
on public.office_finance_summary
for select
using (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and (
            public.ddumba_v1_is_company_admin()
            or public.ddumba_v1_can_access_office(office_id)
        )
    )
);

drop policy if exists office_finance_summary_admin_write on public.office_finance_summary;
drop policy if exists office_finance_summary_office_insert on public.office_finance_summary;
drop policy if exists office_finance_summary_office_update on public.office_finance_summary;
create policy office_finance_summary_admin_write
on public.office_finance_summary
for all
using (public.ddumba_v1_is_service_role() or (company_id = public.ddumba_v1_current_company_id() and public.ddumba_v1_is_company_admin()))
with check (public.ddumba_v1_is_service_role() or (company_id = public.ddumba_v1_current_company_id() and public.ddumba_v1_is_company_admin()));

drop policy if exists company_finance_summary_read on public.company_finance_summary;
drop policy if exists company_finance_summary_company_read on public.company_finance_summary;
create policy company_finance_summary_read
on public.company_finance_summary
for select
using (public.ddumba_v1_is_service_role() or (company_id = public.ddumba_v1_current_company_id() and public.ddumba_v1_is_company_admin()));

drop policy if exists company_finance_summary_admin_write on public.company_finance_summary;
drop policy if exists company_finance_summary_company_insert on public.company_finance_summary;
drop policy if exists company_finance_summary_company_update on public.company_finance_summary;
create policy company_finance_summary_admin_write
on public.company_finance_summary
for all
using (public.ddumba_v1_is_service_role() or (company_id = public.ddumba_v1_current_company_id() and public.ddumba_v1_is_company_admin()))
with check (public.ddumba_v1_is_service_role() or (company_id = public.ddumba_v1_current_company_id() and public.ddumba_v1_is_company_admin()));
