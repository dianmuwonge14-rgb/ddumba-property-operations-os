-- Admin Collections: employee filter support.
-- Adds stable employee attribution to collections without changing collection amounts or validity rules.

alter table public.collections
    add column if not exists recorded_by_employee_id uuid references public.employees(id) on delete set null,
    add column if not exists collected_by_employee_id uuid references public.employees(id) on delete set null,
    add column if not exists prepared_by_employee_id uuid references public.employees(id) on delete set null;

create index if not exists idx_collections_company_recorded_employee_payment_date
    on public.collections (company_id, recorded_by_employee_id, payment_date desc)
    where recorded_by_employee_id is not null;

create index if not exists idx_collections_company_collected_employee_payment_date
    on public.collections (company_id, collected_by_employee_id, payment_date desc)
    where collected_by_employee_id is not null;

create index if not exists idx_collections_company_prepared_employee_payment_date
    on public.collections (company_id, prepared_by_employee_id, payment_date desc)
    where prepared_by_employee_id is not null;

create index if not exists idx_collections_company_office_payment_status
    on public.collections (company_id, office_id, payment_date desc, status);

create index if not exists idx_collections_company_method_payment_date
    on public.collections (company_id, lower(coalesce(payment_method, '')), payment_date desc);

update public.collections c
set
    recorded_by_employee_id = coalesce(c.recorded_by_employee_id, u.employee_id),
    collected_by_employee_id = coalesce(c.collected_by_employee_id, u.employee_id),
    prepared_by_employee_id = coalesce(c.prepared_by_employee_id, u.employee_id),
    updated_at = coalesce(c.updated_at, now())
from public.users u
join public.employees e
    on e.id = u.employee_id
    and e.company_id = u.company_id
    and lower(coalesce(e.status, 'active')) not in ('archived', 'deleted', 'inactive', 'terminated')
where c.company_id = u.company_id
    and u.employee_id is not null
    and u.id = coalesce(c.recorded_by, c.entered_by_account_id)
    and (
        c.recorded_by_employee_id is null
        or c.collected_by_employee_id is null
        or c.prepared_by_employee_id is null
    );

create or replace function public.ddumba_set_collection_employee_attribution()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    actor_employee_id uuid;
begin
    if new.recorded_by_employee_id is not null
        and new.collected_by_employee_id is not null
        and new.prepared_by_employee_id is not null then
        return new;
    end if;

    select u.employee_id
    into actor_employee_id
    from public.users u
    join public.employees e
        on e.id = u.employee_id
        and e.company_id = u.company_id
        and lower(coalesce(e.status, 'active')) not in ('archived', 'deleted', 'inactive', 'terminated')
    where u.company_id = new.company_id
        and u.id = coalesce(new.recorded_by, new.entered_by_account_id)
        and u.employee_id is not null
    limit 1;

    if actor_employee_id is not null then
        new.recorded_by_employee_id = coalesce(new.recorded_by_employee_id, actor_employee_id);
        new.collected_by_employee_id = coalesce(new.collected_by_employee_id, actor_employee_id);
        new.prepared_by_employee_id = coalesce(new.prepared_by_employee_id, actor_employee_id);
    end if;

    return new;
end;
$$;

drop trigger if exists trg_ddumba_set_collection_employee_attribution on public.collections;
create trigger trg_ddumba_set_collection_employee_attribution
before insert or update of recorded_by, entered_by_account_id, recorded_by_employee_id, collected_by_employee_id, prepared_by_employee_id
on public.collections
for each row
execute function public.ddumba_set_collection_employee_attribution();
