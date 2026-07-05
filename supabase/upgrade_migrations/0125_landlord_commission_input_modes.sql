-- Phase: Flexible landlord commission input modes.
-- Additive only. No drops, deletes, truncates, or resets.

alter table public.landlord_commission_changes
    add column if not exists input_mode text not null default 'percentage',
    add column if not exists old_landlord_net_amount numeric(14,2),
    add column if not exists new_landlord_net_amount numeric(14,2),
    add column if not exists portfolio_rent_roll numeric(14,2);

create index if not exists idx_landlord_commission_changes_input_mode
    on public.landlord_commission_changes(company_id, input_mode, changed_at desc);
