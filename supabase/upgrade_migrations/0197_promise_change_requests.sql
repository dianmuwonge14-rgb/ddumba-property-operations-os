-- Phase 197: Promise correction requests.
-- Additive only. Office and field collector accounts submit requests; Admin reviews.

create table if not exists public.promise_change_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid references public.offices(id) on delete set null,
  promise_id uuid not null references public.promises(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete set null,
  room_id uuid references public.rooms(id) on delete set null,
  change_type text not null default 'general_edit' check (
    change_type in (
      'general_edit',
      'amount_change',
      'date_change',
      'notes_change',
      'status_change',
      'reschedule'
    )
  ),
  original_value jsonb not null default '{}'::jsonb,
  requested_value jsonb not null default '{}'::jsonb,
  reason text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_by uuid references public.users(id) on delete set null,
  requested_by_account_type text,
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  admin_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_promise_change_requests_one_pending
  on public.promise_change_requests(promise_id, change_type)
  where status = 'pending';

create index if not exists idx_promise_change_requests_company_status
  on public.promise_change_requests(company_id, status, created_at desc);

create index if not exists idx_promise_change_requests_office_status
  on public.promise_change_requests(office_id, status, created_at desc);

create index if not exists idx_promise_change_requests_promise
  on public.promise_change_requests(promise_id, created_at desc);

create or replace function public.ddumba_touch_promise_change_requests_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_promise_change_requests_updated_at on public.promise_change_requests;
create trigger trg_promise_change_requests_updated_at
before update on public.promise_change_requests
for each row execute function public.ddumba_touch_promise_change_requests_updated_at();

alter table public.promise_change_requests enable row level security;

drop policy if exists promise_change_requests_read on public.promise_change_requests;
create policy promise_change_requests_read
on public.promise_change_requests
for select
using (
  public.ddumba_v1_is_service_role()
  or (
    company_id = public.ddumba_v1_current_company_id()
    and (
      public.ddumba_v1_is_company_admin()
      or public.ddumba_v1_can_access_office(office_id)
      or requested_by = auth.uid()
    )
  )
);

drop policy if exists promise_change_requests_insert on public.promise_change_requests;
create policy promise_change_requests_insert
on public.promise_change_requests
for insert
with check (
  public.ddumba_v1_is_service_role()
  or (
    company_id = public.ddumba_v1_current_company_id()
    and (
      public.ddumba_v1_is_company_admin()
      or public.ddumba_v1_can_access_office(office_id)
      or requested_by = auth.uid()
    )
  )
);

drop policy if exists promise_change_requests_admin_update on public.promise_change_requests;
create policy promise_change_requests_admin_update
on public.promise_change_requests
for update
using (
  public.ddumba_v1_is_service_role()
  or (
    company_id = public.ddumba_v1_current_company_id()
    and public.ddumba_v1_is_company_admin()
  )
)
with check (
  public.ddumba_v1_is_service_role()
  or (
    company_id = public.ddumba_v1_current_company_id()
    and public.ddumba_v1_is_company_admin()
  )
);
