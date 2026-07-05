-- Phase: landlord advances, expense drilldowns, and profit tracking.
-- Additive only. No deletes, drops, resets, or business-data rewrites.

create table if not exists public.landlord_advances (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid references public.offices(id) on delete set null,
    landlord_id uuid not null references public.landlords(id) on delete cascade,
    advance_amount numeric(14,2) not null default 0,
    deducted_amount numeric(14,2) not null default 0,
    remaining_balance numeric(14,2) generated always as (greatest(advance_amount - deducted_amount, 0)) stored,
    date_given date not null default current_date,
    reason text,
    note text,
    status text not null default 'pending',
    deducted_at timestamptz,
    created_by uuid references public.users(id) on delete set null,
    updated_by uuid references public.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint landlord_advances_amount_check check (advance_amount >= 0 and deducted_amount >= 0),
    constraint landlord_advances_status_check check (status in ('pending', 'partially_deducted', 'fully_deducted'))
);

create index if not exists idx_landlord_advances_company_status
    on public.landlord_advances(company_id, status, date_given desc);

create index if not exists idx_landlord_advances_office_status
    on public.landlord_advances(office_id, status, date_given desc);

create index if not exists idx_landlord_advances_landlord_status
    on public.landlord_advances(landlord_id, status, date_given desc);

create or replace function public.ddumba_v1_touch_landlord_advances_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists trg_landlord_advances_updated_at on public.landlord_advances;
create trigger trg_landlord_advances_updated_at
before update on public.landlord_advances
for each row execute function public.ddumba_v1_touch_landlord_advances_updated_at();

alter table public.landlord_advances enable row level security;

drop policy if exists landlord_advances_read on public.landlord_advances;
create policy landlord_advances_read
on public.landlord_advances
for select
using (
    public.ddumba_v1_is_service_role()
    or public.ddumba_v1_is_company_admin()
    or (office_id is not null and public.ddumba_v1_can_access_office(office_id))
);

drop policy if exists landlord_advances_admin_insert on public.landlord_advances;
create policy landlord_advances_admin_insert
on public.landlord_advances
for insert
with check (public.ddumba_v1_is_service_role() or public.ddumba_v1_is_company_admin());

drop policy if exists landlord_advances_admin_update on public.landlord_advances;
create policy landlord_advances_admin_update
on public.landlord_advances
for update
using (public.ddumba_v1_is_service_role() or public.ddumba_v1_is_company_admin())
with check (public.ddumba_v1_is_service_role() or public.ddumba_v1_is_company_admin());
