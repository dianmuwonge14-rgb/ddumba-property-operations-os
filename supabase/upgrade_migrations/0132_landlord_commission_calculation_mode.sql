-- Phase: Landlord commission calculation mode.
-- Additive only. No drops, deletes, truncates, or resets.

alter table public.landlords
    add column if not exists commission_calculation_mode text not null default 'portfolio_based',
    add column if not exists commission_input_mode text not null default 'percentage',
    add column if not exists landlord_net_payable_override numeric(14,2);

alter table public.landlord_commission_changes
    add column if not exists old_commission_calculation_mode text,
    add column if not exists new_commission_calculation_mode text;

alter table public.landlord_settlements
    add column if not exists commission_calculation_mode text not null default 'portfolio_based',
    add column if not exists commission_base_amount numeric(14,2) not null default 0,
    add column if not exists occupied_payable_rent numeric(14,2) not null default 0;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'landlords_commission_calculation_mode_check'
    ) then
        alter table public.landlords
            add constraint landlords_commission_calculation_mode_check
            check (commission_calculation_mode in ('portfolio_based', 'occupied_room_based'));
    end if;
end $$;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'landlord_commission_changes_old_mode_check'
    ) then
        alter table public.landlord_commission_changes
            add constraint landlord_commission_changes_old_mode_check
            check (old_commission_calculation_mode is null or old_commission_calculation_mode in ('portfolio_based', 'occupied_room_based'));
    end if;
end $$;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'landlord_commission_changes_new_mode_check'
    ) then
        alter table public.landlord_commission_changes
            add constraint landlord_commission_changes_new_mode_check
            check (new_commission_calculation_mode is null or new_commission_calculation_mode in ('portfolio_based', 'occupied_room_based'));
    end if;
end $$;

create index if not exists idx_landlords_commission_calculation_mode
    on public.landlords(company_id, commission_calculation_mode);

create index if not exists idx_landlords_commission_input_mode
    on public.landlords(company_id, commission_input_mode);

create index if not exists idx_landlord_commission_changes_mode
    on public.landlord_commission_changes(company_id, new_commission_calculation_mode, changed_at desc);

create index if not exists idx_landlord_settlements_commission_mode
    on public.landlord_settlements(company_id, commission_calculation_mode, settlement_month desc);
