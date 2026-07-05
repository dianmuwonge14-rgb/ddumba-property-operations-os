-- Approved landlord payment details and approval workflow.
-- Additive only. Does not change landlord-room assignments or payment history.

create table if not exists public.landlord_payment_details (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid references public.offices(id) on delete set null,
    landlord_id uuid not null references public.landlords(id) on delete cascade,
    payment_method text not null default 'cash' check (payment_method in ('cash','mobile_money','bank')),
    mobile_money_provider text,
    mobile_money_number text,
    mobile_money_account_name text,
    bank_name text,
    bank_account_number text,
    bank_account_name text,
    branch text,
    notes text,
    status text not null default 'pending' check (status in ('pending','approved','rejected','archived')),
    is_active boolean not null default false,
    requested_by uuid references public.users(id) on delete set null,
    approved_by uuid references public.users(id) on delete set null,
    approved_at timestamptz,
    admin_comment text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists idx_landlord_payment_details_one_active
    on public.landlord_payment_details(company_id, landlord_id)
    where is_active = true and status = 'approved';

create index if not exists idx_landlord_payment_details_scope
    on public.landlord_payment_details(company_id, office_id, landlord_id, status, is_active, created_at desc);

alter table public.landlord_payment_details enable row level security;

drop policy if exists landlord_payment_details_admin_all on public.landlord_payment_details;
create policy landlord_payment_details_admin_all
on public.landlord_payment_details
for all
using (
    public.ddumba_v1_is_service_role()
    or (
        landlord_payment_details.company_id = public.ddumba_v1_current_company_id()
        and public.ddumba_v1_is_company_admin()
    )
)
with check (
    public.ddumba_v1_is_service_role()
    or (
        landlord_payment_details.company_id = public.ddumba_v1_current_company_id()
        and public.ddumba_v1_is_company_admin()
    )
);

drop policy if exists landlord_payment_details_office_read_insert on public.landlord_payment_details;
create policy landlord_payment_details_office_read_insert
on public.landlord_payment_details
for all
using (
    landlord_payment_details.company_id = public.ddumba_v1_current_company_id()
    and landlord_payment_details.office_id is not null
    and public.ddumba_v1_can_access_office(landlord_payment_details.office_id)
)
with check (
    landlord_payment_details.company_id = public.ddumba_v1_current_company_id()
    and landlord_payment_details.office_id is not null
    and public.ddumba_v1_can_access_office(landlord_payment_details.office_id)
    and landlord_payment_details.status = 'pending'
    and landlord_payment_details.is_active = false
);
