-- Phase 255: Harden landlord-payment approval state and Admin-only permission.

insert into public.permissions(key, name, description, category)
values (
  'landlord_payments.approve',
  'Approve landlord payments',
  'Allows a true Admin account to approve or reject landlord payment requests.',
  'finance'
)
on conflict (key) do nothing;

insert into public.role_permissions(role_id, permission_id, created_at)
select r.id, p.id, now()
from public.roles r
join public.permissions p on p.key = 'landlord_payments.approve'
where r.key in ('company_admin', 'super_admin', 'hq_executive')
on conflict (role_id, permission_id) do nothing;

do $$
declare
  v_constraint_name text;
begin
  if to_regclass('public.landlord_payment_expense_requests') is null then
    return;
  end if;

  select c.conname
    into v_constraint_name
  from pg_constraint c
  where c.conrelid = 'public.landlord_payment_expense_requests'::regclass
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%status%'
  order by c.conname
  limit 1;

  if v_constraint_name is not null then
    execute format('alter table public.landlord_payment_expense_requests drop constraint %I', v_constraint_name);
  end if;

  alter table public.landlord_payment_expense_requests
    add constraint landlord_payment_expense_requests_status_check
    check (status in ('pending','approved','rejected','cancelled','failed'));
end $$;

create unique index if not exists idx_landlord_payments_unique_approval_reference
  on public.landlord_payments(company_id, office_id, landlord_id, payout_reference)
  where payout_reference like 'EXP-LP-%';

