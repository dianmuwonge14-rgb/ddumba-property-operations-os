-- Phase 136 follow-up: connect landlord advances to settlement deductions.
-- Additive only. No data reset, drops, deletes, or formula changes.

alter table if exists public.landlord_settlements
    add column if not exists landlord_advance_deductions numeric(14, 2) not null default 0,
    add column if not exists carried_forward_advance_balance numeric(14, 2) not null default 0;

create index if not exists idx_landlord_settlements_advance_deductions
    on public.landlord_settlements (company_id, landlord_id, settlement_month)
    where landlord_advance_deductions > 0;
