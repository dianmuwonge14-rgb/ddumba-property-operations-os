-- Phase 273: Landlord settlement cycle timing.
-- Additive only: monthly payable rows and historical landlord payments are preserved.

alter table public.landlords
  add column if not exists settlement_timing text not null default 'previous_month';

alter table public.landlords
  drop constraint if exists landlords_settlement_timing_check;

alter table public.landlords
  add constraint landlords_settlement_timing_check
  check (settlement_timing in ('current_month', 'previous_month'));

create table if not exists public.landlord_settlement_timing_audit (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  landlord_id uuid not null references public.landlords(id) on delete cascade,
  old_settlement_timing text,
  new_settlement_timing text not null,
  reason text not null,
  changed_by uuid references public.users(id) on delete set null,
  changed_at timestamptz not null default now()
);

create index if not exists idx_landlords_company_settlement_timing
  on public.landlords(company_id, settlement_timing);

create index if not exists idx_landlord_settlement_timing_audit_landlord
  on public.landlord_settlement_timing_audit(company_id, landlord_id, changed_at desc);

comment on column public.landlords.settlement_timing is
  'Landlord Settlement Cycle: current_month includes the open active month in payable now; previous_month only includes the latest closed month and older unpaid balances.';

comment on table public.landlord_settlement_timing_audit is
  'Audit trail for Admin changes to landlord settlement cycle timing.';

with kapeeka_offices as (
  select id, company_id
  from public.offices
  where lower(coalesce(name, '')) like '%kapeeka%'
),
listed_landlords as (
  select unnest(array[
    'kawoya umar',
    'umar kawooya',
    'mkyala umar',
    'mklya umaru',
    'kisitu charles',
    'kisitu charlse',
    'sekabembe',
    'nsiko',
    'mama mzee',
    'god mulokole',
    'maama bill',
    'mama bill',
    'kigongo',
    'ssegujja anthony',
    'alex costa',
    'mawanda',
    'kiyingi cosmas',
    'asuman kiyingi',
    'bayise noah',
    'bayiise noah',
    'noah 2',
    'mukiibi',
    'mukiibi vicent',
    'mulangira',
    'kamya gerald',
    'luyima deogratias',
    'luyima deogratias tebugulwa'
  ]) as normalized_name
),
kapeeka_landlords as (
  select distinct r.landlord_id
  from public.rooms r
  join kapeeka_offices ko on ko.id = r.office_id and ko.company_id = r.company_id
  where r.landlord_id is not null
),
current_month_targets as (
  select l.id
  from public.landlords l
  left join kapeeka_landlords kl on kl.landlord_id = l.id
  left join listed_landlords ll on regexp_replace(lower(trim(coalesce(l.full_name, ''))), '[^a-z0-9]+', ' ', 'g') = ll.normalized_name
  where kl.landlord_id is not null
     or ll.normalized_name is not null
)
update public.landlords l
set settlement_timing = case when c.id is not null then 'current_month' else 'previous_month' end,
    updated_at = now()
from current_month_targets c
where l.id = c.id
   or (c.id is null and false);

with current_month_targets as (
  select l.id
  from public.landlords l
  left join (
    select distinct r.landlord_id
    from public.rooms r
    join public.offices o on o.id = r.office_id and o.company_id = r.company_id
    where r.landlord_id is not null
      and lower(coalesce(o.name, '')) like '%kapeeka%'
  ) kl on kl.landlord_id = l.id
  left join (
    select unnest(array[
      'kawoya umar','umar kawooya','mkyala umar','mklya umaru','kisitu charles','kisitu charlse','sekabembe','nsiko','mama mzee','god mulokole','maama bill','mama bill','kigongo','ssegujja anthony','alex costa','mawanda','kiyingi cosmas','asuman kiyingi','bayise noah','bayiise noah','noah 2','mukiibi','mukiibi vicent','mulangira','kamya gerald','luyima deogratias','luyima deogratias tebugulwa'
    ]) as normalized_name
  ) ll on regexp_replace(lower(trim(coalesce(l.full_name, ''))), '[^a-z0-9]+', ' ', 'g') = ll.normalized_name
  where kl.landlord_id is not null
     or ll.normalized_name is not null
)
update public.landlords l
set settlement_timing = 'previous_month',
    updated_at = now()
where not exists (select 1 from current_month_targets c where c.id = l.id)
  and coalesce(l.settlement_timing, 'previous_month') <> 'previous_month';
