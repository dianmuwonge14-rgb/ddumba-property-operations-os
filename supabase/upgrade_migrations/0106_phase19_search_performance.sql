-- Phase 19 search performance optimization.
-- Additive only: no DROP, DELETE, TRUNCATE, resets, or destructive data changes.

create extension if not exists pg_trgm;

create index if not exists idx_ddumba_search_rooms_room_number_trgm
  on public.rooms using gin (room_number gin_trgm_ops);

create index if not exists idx_ddumba_search_tenants_full_name_trgm
  on public.tenants using gin (full_name gin_trgm_ops);

create index if not exists idx_ddumba_search_tenants_phone_trgm
  on public.tenants using gin (phone gin_trgm_ops);

create index if not exists idx_ddumba_search_tenants_code_trgm
  on public.tenants using gin (tenant_code gin_trgm_ops);

create index if not exists idx_ddumba_search_leases_room_status_company
  on public.leases(company_id, room_id, status);

create index if not exists idx_ddumba_search_leases_tenant_status_company
  on public.leases(company_id, tenant_id, status);

create index if not exists idx_ddumba_search_collections_tenant_paid
  on public.collections(company_id, tenant_id, paid_at desc);

create index if not exists idx_ddumba_search_promises_tenant_status_date
  on public.promises(company_id, tenant_id, status, promised_date);

create or replace function public.ddumba_v1_search_tenants(search_term text, result_limit integer default 10)
returns table (
  tenant jsonb,
  room jsonb,
  property jsonb,
  office jsonb,
  lease jsonb,
  outstanding_balance numeric,
  monthly_rent numeric,
  last_collection jsonb,
  open_promise jsonb
)
language sql
security definer
stable
set search_path = public
as $$
  with auth_context as (
    select
      public.ddumba_v1_current_company_id() as company_id,
      public.ddumba_v1_is_company_admin() as is_company_admin,
      greatest(1, least(coalesce(result_limit, 10), 25)) as max_results,
      '%' || trim(search_term) || '%' as pattern
  ),
  direct_matches as (
    select t.id as tenant_id, t.room_id
    from public.tenants t
    cross join auth_context ctx
    where ctx.company_id is not null
      and length(trim(search_term)) >= 2
      and t.company_id = ctx.company_id
      and coalesce(lower(t.status), 'active') = 'active'
      and (
        t.full_name ilike ctx.pattern
        or t.phone ilike ctx.pattern
        or t.tenant_code ilike ctx.pattern
      )
      and (
        ctx.is_company_admin
        or public.ddumba_v1_can_access_office(t.office_id)
      )
  ),
  room_matches as (
    select t.id as tenant_id, r.id as room_id
    from public.rooms r
    join public.tenants t on t.room_id = r.id
    cross join auth_context ctx
    where ctx.company_id is not null
      and length(trim(search_term)) >= 2
      and r.company_id = ctx.company_id
      and t.company_id = ctx.company_id
      and coalesce(lower(t.status), 'active') = 'active'
      and r.room_number ilike ctx.pattern
      and (
        ctx.is_company_admin
        or public.ddumba_v1_can_access_office(coalesce(t.office_id, r.office_id))
      )
  ),
  lease_room_matches as (
    select t.id as tenant_id, r.id as room_id
    from public.rooms r
    join public.leases l on l.room_id = r.id and coalesce(lower(l.status), 'active') = 'active'
    join public.tenants t on t.id = l.tenant_id
    cross join auth_context ctx
    where ctx.company_id is not null
      and length(trim(search_term)) >= 2
      and r.company_id = ctx.company_id
      and l.company_id = ctx.company_id
      and t.company_id = ctx.company_id
      and coalesce(lower(t.status), 'active') = 'active'
      and r.room_number ilike ctx.pattern
      and (
        ctx.is_company_admin
        or public.ddumba_v1_can_access_office(coalesce(t.office_id, r.office_id, l.office_id))
      )
  ),
  candidates as (
    select tenant_id, room_id from direct_matches
    union
    select tenant_id, room_id from room_matches
    union
    select tenant_id, room_id from lease_room_matches
  ),
  ranked as (
    select distinct on (t.id)
      t.*,
      coalesce(c.room_id, t.room_id) as resolved_room_id
    from candidates c
    join public.tenants t on t.id = c.tenant_id
    order by t.id, t.full_name nulls last
    limit (select max_results from auth_context)
  )
  select
    to_jsonb(t) as tenant,
    to_jsonb(r) as room,
    to_jsonb(p) as property,
    to_jsonb(o) as office,
    to_jsonb(l) as lease,
    coalesce(t.balance, r.outstanding_balance, 0) as outstanding_balance,
    coalesce(l.monthly_rent, t.monthly_rent, r.monthly_rent, 0) as monthly_rent,
    to_jsonb(c_last) as last_collection,
    to_jsonb(p_open) as open_promise
  from ranked t
  left join public.rooms r on r.id = t.resolved_room_id
  left join lateral (
    select l.*
    from public.leases l
    where l.company_id = t.company_id
      and l.tenant_id = t.id
      and coalesce(lower(l.status), 'active') = 'active'
    order by l.created_at desc nulls last
    limit 1
  ) l on true
  left join public.properties p on p.id = coalesce(t.property_id, r.property_id, l.property_id)
  left join public.offices o on o.id = coalesce(t.office_id, r.office_id, l.office_id)
  left join lateral (
    select c.*
    from public.collections c
    where c.company_id = t.company_id
      and c.tenant_id = t.id
    order by c.paid_at desc nulls last, c.created_at desc nulls last
    limit 1
  ) c_last on true
  left join lateral (
    select p.*
    from public.promises p
    where p.company_id = t.company_id
      and p.tenant_id = t.id
      and coalesce(lower(p.status), 'open') <> 'fulfilled'
    order by p.promised_date asc nulls last, p.created_at desc nulls last
    limit 1
  ) p_open on true
  order by t.full_name nulls last;
$$;

grant execute on function public.ddumba_v1_search_tenants(text, integer) to authenticated;
