-- Phase: Admin landlord commission and room assignment controls.
-- Additive only. No drops, deletes, truncates, or resets.

alter table public.landlords
    add column if not exists commission_rate numeric(7,4),
    add column if not exists commission_updated_by uuid references public.users(id) on delete set null,
    add column if not exists commission_updated_at timestamptz;

create table if not exists public.landlord_commission_changes (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    landlord_id uuid not null references public.landlords(id) on delete cascade,
    old_commission_rate numeric(7,4),
    new_commission_rate numeric(7,4),
    changed_by uuid references public.users(id) on delete set null,
    changed_at timestamptz not null default now(),
    notes text
);

create table if not exists public.landlord_room_assignment_changes (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid references public.offices(id) on delete set null,
    room_id uuid not null references public.rooms(id) on delete cascade,
    previous_landlord_id uuid references public.landlords(id) on delete set null,
    new_landlord_id uuid references public.landlords(id) on delete set null,
    changed_by uuid references public.users(id) on delete set null,
    changed_at timestamptz not null default now(),
    reason text
);

create index if not exists idx_landlords_commission_rate
    on public.landlords(company_id, commission_rate);

create index if not exists idx_landlord_commission_changes_landlord
    on public.landlord_commission_changes(company_id, landlord_id, changed_at desc);

create index if not exists idx_landlord_room_assignment_changes_room
    on public.landlord_room_assignment_changes(company_id, room_id, changed_at desc);

alter table public.landlord_commission_changes enable row level security;
alter table public.landlord_room_assignment_changes enable row level security;

drop policy if exists landlord_commission_changes_select_v1 on public.landlord_commission_changes;
create policy landlord_commission_changes_select_v1
on public.landlord_commission_changes
for select
using (
    public.ddumba_v1_is_service_role()
    or public.ddumba_v1_is_company_admin()
    or public.ddumba_v1_has_permission('settings.manage')
);

drop policy if exists landlord_commission_changes_admin_v1 on public.landlord_commission_changes;
create policy landlord_commission_changes_admin_v1
on public.landlord_commission_changes
for all
using (
    public.ddumba_v1_is_service_role()
    or public.ddumba_v1_is_company_admin()
    or public.ddumba_v1_has_permission('settings.manage')
)
with check (
    public.ddumba_v1_is_service_role()
    or public.ddumba_v1_is_company_admin()
    or public.ddumba_v1_has_permission('settings.manage')
);

drop policy if exists landlord_room_assignment_changes_select_v1 on public.landlord_room_assignment_changes;
create policy landlord_room_assignment_changes_select_v1
on public.landlord_room_assignment_changes
for select
using (
    public.ddumba_v1_is_service_role()
    or public.ddumba_v1_is_company_admin()
    or public.ddumba_v1_has_permission('settings.manage')
);

drop policy if exists landlord_room_assignment_changes_admin_v1 on public.landlord_room_assignment_changes;
create policy landlord_room_assignment_changes_admin_v1
on public.landlord_room_assignment_changes
for all
using (
    public.ddumba_v1_is_service_role()
    or public.ddumba_v1_is_company_admin()
    or public.ddumba_v1_has_permission('settings.manage')
)
with check (
    public.ddumba_v1_is_service_role()
    or public.ddumba_v1_is_company_admin()
    or public.ddumba_v1_has_permission('settings.manage')
);
