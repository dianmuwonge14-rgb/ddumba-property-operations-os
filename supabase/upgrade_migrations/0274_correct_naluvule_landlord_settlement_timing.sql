-- Corrects landlord settlement-cycle assignment after Kapeeka Office was
-- confirmed to be the renamed active NALUVULE OFFICE record, not KIGUNGU OFFICE.
--
-- Rule:
--   current_month  = landlords currently attached to NALUVULE OFFICE
--                    OR the explicit current-month landlord list
--   previous_month = every other active landlord
--
-- This is data-only. It does not alter commission, vacancy, advance, or
-- deduction formulas.

begin;

create temporary table tmp_landlord_settlement_cycle_changes as
with explicit_current_landlords as (
    select id
    from public.landlords
    where coalesce(lower(status), 'active') not in ('inactive', 'archived', 'deleted', 'removed')
      and lower(regexp_replace(coalesce(full_name, ''), '[^a-zA-Z0-9]+', ' ', 'g')) in (
          'alex costa',
          'asumani kiyinji',
          'bayiise noah',
          'god mulokole',
          'kamya gerald',
          'kigongo',
          'kisitu charlse',
          'kiyinji cosmos',
          'luyima deogratias tebugulwa',
          'mama bill',
          'mama mzee',
          'mawanda',
          'mklya umaru',
          'mukiibi vicent',
          'nambiro mariam',
          'noah 2',
          'nsiko',
          'sekabembe',
          'ssegujja anthony',
          'umar kawooya'
      )
),
naluvule_office as (
    select id
    from public.offices
    where lower(regexp_replace(coalesce(office_name, name, ''), '[^a-zA-Z0-9]+', ' ', 'g')) = 'naluvule office'
      and coalesce(lower(status), 'active') = 'active'
    limit 1
),
portfolio_rooms as (
    select distinct
        coalesce(r.landlord_id, p.landlord_id, pl.landlord_id) as landlord_id,
        r.office_id
    from public.rooms r
    left join public.properties p
      on p.id = r.property_id
     and p.company_id = r.company_id
    left join public.property_landlords pl
      on pl.property_id = r.property_id
     and pl.company_id = r.company_id
    where coalesce(lower(r.status), 'active') not in ('inactive', 'archived', 'deleted', 'removed')
      and r.office_id is not null
      and coalesce(r.landlord_id, p.landlord_id, pl.landlord_id) is not null
),
naluvule_landlords as (
    select distinct pr.landlord_id as id
    from portfolio_rooms pr
    join naluvule_office no on no.id = pr.office_id
),
target_current as (
    select id from explicit_current_landlords
    union
    select id from naluvule_landlords
),
active_landlords as (
    select id, company_id, settlement_timing
    from public.landlords
    where coalesce(lower(status), 'active') not in ('inactive', 'archived', 'deleted', 'removed')
)
select
    l.id,
    l.company_id,
    coalesce(l.settlement_timing, 'previous_month') as old_settlement_timing,
    case when tc.id is not null then 'current_month' else 'previous_month' end as new_settlement_timing
from active_landlords l
left join target_current tc on tc.id = l.id
where coalesce(l.settlement_timing, 'previous_month') <> case when tc.id is not null then 'current_month' else 'previous_month' end;

insert into public.landlord_settlement_timing_audit (
    company_id,
    landlord_id,
    old_settlement_timing,
    new_settlement_timing,
    reason
)
select
    company_id,
    id,
    old_settlement_timing,
    new_settlement_timing,
    'Settlement cycle rule corrected: NALUVULE OFFICE landlords plus explicit current-month landlord list are current_month; all others previous_month. Reverses incorrect Kigungu-wide classification.'
from tmp_landlord_settlement_cycle_changes;

update public.landlords l
set settlement_timing = c.new_settlement_timing,
    updated_at = now()
from tmp_landlord_settlement_cycle_changes c
where l.id = c.id;

commit;
