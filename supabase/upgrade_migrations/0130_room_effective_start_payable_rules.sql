-- Phase: Room effective start date and landlord payable rules.
-- Safe: additive columns/indexes only. No destructive changes.

alter table public.rooms
    add column if not exists effective_start_date date,
    add column if not exists explicitly_payable boolean not null default false,
    add column if not exists payable_notes text;

create index if not exists idx_rooms_company_landlord_effective_start
    on public.rooms(company_id, landlord_id, effective_start_date);

create index if not exists idx_rooms_company_office_effective_start
    on public.rooms(company_id, office_id, effective_start_date);

comment on column public.rooms.effective_start_date is
    'Date the room becomes effective for landlord portfolio and payable-period logic.';

comment on column public.rooms.explicitly_payable is
    'Admin override for rooms that should be treated as payable despite non-standard status.';

comment on column public.rooms.payable_notes is
    'Business-readable reason or note for payable/non-payable treatment.';
