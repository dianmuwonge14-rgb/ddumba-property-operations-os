create extension if not exists pgcrypto;

alter table public.users
  add column if not exists account_type text not null default 'office';

alter table public.collections
  add column if not exists entered_by_account_id uuid references public.users(id) on delete set null,
  add column if not exists entered_by_name text,
  add column if not exists account_type text;

alter table public.promises
  add column if not exists entered_by_account_id uuid references public.users(id) on delete set null,
  add column if not exists entered_by_name text,
  add column if not exists account_type text;

create table if not exists public.field_collector_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  full_name text not null,
  phone text,
  email text not null,
  status text not null default 'active' check (status in ('active','suspended','inactive')),
  cash_balance numeric not null default 0,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, user_id),
  unique(company_id, email)
);

create table if not exists public.field_collector_cash_movements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  collector_user_id uuid not null references public.users(id) on delete cascade,
  office_id uuid references public.offices(id) on delete set null,
  landlord_id uuid references public.landlords(id) on delete set null,
  tenant_id uuid references public.tenants(id) on delete set null,
  room_id uuid references public.rooms(id) on delete set null,
  collection_id uuid references public.collections(id) on delete set null,
  submission_id uuid,
  movement_type text not null check (movement_type in ('collection_in','submission_pending','submission_approved','submission_rejected','adjustment')),
  amount numeric not null check (amount >= 0),
  payment_method text,
  movement_date date not null default ((now() at time zone 'Africa/Kampala')::date),
  status text not null default 'posted' check (status in ('posted','pending','approved','rejected','voided')),
  notes text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.field_collector_money_submissions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  collector_user_id uuid not null references public.users(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete cascade,
  amount numeric not null check (amount > 0),
  submission_date date not null default ((now() at time zone 'Africa/Kampala')::date),
  reference text,
  notes text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  submitted_by uuid references public.users(id) on delete set null,
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  office_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.field_collector_cash_movements
  drop constraint if exists field_collector_cash_movements_submission_id_fkey;

alter table public.field_collector_cash_movements
  add constraint field_collector_cash_movements_submission_id_fkey
  foreign key (submission_id) references public.field_collector_money_submissions(id) on delete set null;

create table if not exists public.field_collector_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid references public.offices(id) on delete set null,
  thread_id uuid not null default gen_random_uuid(),
  sender_id uuid references public.users(id) on delete set null,
  recipient_user_id uuid references public.users(id) on delete set null,
  recipient_type text not null default 'collector' check (recipient_type in ('collector','admin','office','all_collectors')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'unread' check (status in ('unread','read','replied','resolved')),
  subject text not null,
  body text not null,
  parent_message_id uuid references public.field_collector_messages(id) on delete set null,
  email_delivery_status text not null default 'not_configured',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_collector_profiles_company_status on public.field_collector_profiles(company_id, status);
create index if not exists idx_collector_cash_company_collector_date on public.field_collector_cash_movements(company_id, collector_user_id, movement_date desc);
create index if not exists idx_collector_cash_company_office_date on public.field_collector_cash_movements(company_id, office_id, movement_date desc);
create index if not exists idx_collector_submissions_company_status on public.field_collector_money_submissions(company_id, status, created_at desc);
create index if not exists idx_collector_messages_recipient on public.field_collector_messages(company_id, recipient_user_id, status, created_at desc);
create index if not exists idx_collections_entered_by_account on public.collections(company_id, entered_by_account_id, payment_date);
create index if not exists idx_promises_entered_by_account on public.promises(company_id, entered_by_account_id, promised_date);

alter table public.field_collector_profiles enable row level security;
alter table public.field_collector_cash_movements enable row level security;
alter table public.field_collector_money_submissions enable row level security;
alter table public.field_collector_messages enable row level security;

drop policy if exists field_collector_profiles_admin_select on public.field_collector_profiles;
create policy field_collector_profiles_admin_select
on public.field_collector_profiles
for select
using (
  public.ddumba_v1_is_service_role()
  or public.ddumba_v1_is_company_admin()
  or user_id = auth.uid()
);

drop policy if exists field_collector_profiles_admin_write on public.field_collector_profiles;
create policy field_collector_profiles_admin_write
on public.field_collector_profiles
for all
using (public.ddumba_v1_is_service_role() or public.ddumba_v1_is_company_admin())
with check (public.ddumba_v1_is_service_role() or public.ddumba_v1_is_company_admin());

drop policy if exists field_collector_cash_select on public.field_collector_cash_movements;
create policy field_collector_cash_select
on public.field_collector_cash_movements
for select
using (
  public.ddumba_v1_is_service_role()
  or public.ddumba_v1_is_company_admin()
  or collector_user_id = auth.uid()
  or public.ddumba_v1_can_access_office(office_id)
);

drop policy if exists field_collector_cash_write on public.field_collector_cash_movements;
create policy field_collector_cash_write
on public.field_collector_cash_movements
for all
using (
  public.ddumba_v1_is_service_role()
  or public.ddumba_v1_is_company_admin()
  or collector_user_id = auth.uid()
)
with check (
  public.ddumba_v1_is_service_role()
  or public.ddumba_v1_is_company_admin()
  or collector_user_id = auth.uid()
);

drop policy if exists field_collector_submissions_select on public.field_collector_money_submissions;
create policy field_collector_submissions_select
on public.field_collector_money_submissions
for select
using (
  public.ddumba_v1_is_service_role()
  or public.ddumba_v1_is_company_admin()
  or collector_user_id = auth.uid()
  or public.ddumba_v1_can_access_office(office_id)
);

drop policy if exists field_collector_submissions_write on public.field_collector_money_submissions;
create policy field_collector_submissions_write
on public.field_collector_money_submissions
for all
using (
  public.ddumba_v1_is_service_role()
  or public.ddumba_v1_is_company_admin()
  or collector_user_id = auth.uid()
  or public.ddumba_v1_can_access_office(office_id)
)
with check (
  public.ddumba_v1_is_service_role()
  or public.ddumba_v1_is_company_admin()
  or collector_user_id = auth.uid()
  or public.ddumba_v1_can_access_office(office_id)
);

drop policy if exists field_collector_messages_select on public.field_collector_messages;
create policy field_collector_messages_select
on public.field_collector_messages
for select
using (
  public.ddumba_v1_is_service_role()
  or public.ddumba_v1_is_company_admin()
  or sender_id = auth.uid()
  or recipient_user_id = auth.uid()
  or public.ddumba_v1_can_access_office(office_id)
);

drop policy if exists field_collector_messages_write on public.field_collector_messages;
create policy field_collector_messages_write
on public.field_collector_messages
for all
using (
  public.ddumba_v1_is_service_role()
  or public.ddumba_v1_is_company_admin()
  or sender_id = auth.uid()
  or recipient_user_id = auth.uid()
  or public.ddumba_v1_can_access_office(office_id)
)
with check (
  public.ddumba_v1_is_service_role()
  or public.ddumba_v1_is_company_admin()
  or sender_id = auth.uid()
  or recipient_user_id = auth.uid()
  or public.ddumba_v1_can_access_office(office_id)
);

insert into public.permissions(key, name, description, category)
values
  ('collector.view', 'Collector View', 'View field collector dashboard and daily collections.', 'collector'),
  ('collector.manage', 'Collector Manage', 'Manage field collector entries and submissions.', 'collector')
on conflict (key) do nothing;

insert into public.roles(company_id, name, key, description, is_system)
select c.id, 'Field Collector', 'field_collector', 'All-rounder collector account across all offices.', true
from public.companies c
on conflict (company_id, key) do update
set name = excluded.name,
    description = excluded.description,
    updated_at = now();

insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'collector.view',
  'collector.manage',
  'collections.view',
  'collections.manage',
  'promises.view',
  'promises.manage',
  'dashboard.view',
  'notifications.view'
)
where r.key = 'field_collector'
on conflict (role_id, permission_id) do nothing;

drop function if exists public.ddumba_v1_verify_unified_login(text, text);

create or replace function public.ddumba_v1_verify_unified_login(
  p_secret text,
  p_user_agent text default null
)
returns table (
  user_id uuid,
  email text,
  company_id uuid,
  office_id uuid,
  full_name text,
  office_name text,
  is_company_admin boolean,
  auth_mode text,
  redirect_to text,
  login_status text,
  attempts_remaining integer,
  locked boolean
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_admin record;
  v_collector record;
  v_office record;
  v_office_match_count integer := 0;
  v_office_count integer := 0;
  v_company_id uuid;
  v_recent_failures integer := 0;
  v_remaining integer := 2;
begin
  if coalesce(length(trim(p_secret)), 0) < 4 then
    return;
  end if;

  select distinct u.id, u.email, u.company_id, u.full_name, pc.id as credential_id, pc.status as credential_status, pc.locked_at, u.created_at
  into v_admin
  from public.users u
  join public.pin_credentials pc on pc.user_id = u.id
  join public.user_office_roles uor on uor.user_id = u.id and uor.company_id = u.company_id
  join public.roles r on r.id = uor.role_id
  where coalesce(lower(u.status), 'active') = 'active'
    and coalesce(lower(pc.status), 'active') in ('active', 'locked')
    and uor.office_id is null
    and r.key in ('company_admin', 'super_admin', 'hq_executive')
    and pc.pin_hash = crypt(p_secret, pc.pin_hash)
  order by u.created_at asc
  limit 1;

  if v_admin.id is not null then
    if coalesce(lower(v_admin.credential_status), 'active') = 'locked' then
      user_id := v_admin.id; email := v_admin.email; company_id := v_admin.company_id; office_id := null; full_name := 'Admin Account'; office_name := null; is_company_admin := true; auth_mode := 'admin'; redirect_to := '/office/admin'; login_status := 'locked'; attempts_remaining := 0; locked := true;
      return next; return;
    end if;
    update public.pin_credentials set failed_attempts = 0, locked_at = null, last_used_at = now(), updated_at = now() where id = v_admin.credential_id;
    user_id := v_admin.id; email := v_admin.email; company_id := v_admin.company_id; office_id := null; full_name := 'Admin Account'; office_name := null; is_company_admin := true; auth_mode := 'admin'; redirect_to := '/office/admin'; login_status := 'success'; attempts_remaining := 3; locked := false;
    return next; return;
  end if;

  select distinct u.id, u.email, u.company_id, u.full_name, pc.id as credential_id, pc.status as credential_status, pc.locked_at, u.created_at
  into v_collector
  from public.users u
  join public.pin_credentials pc on pc.user_id = u.id
  join public.user_office_roles uor on uor.user_id = u.id and uor.company_id = u.company_id
  join public.roles r on r.id = uor.role_id
  where coalesce(lower(u.status), 'active') = 'active'
    and coalesce(lower(pc.status), 'active') in ('active', 'locked')
    and uor.office_id is null
    and r.key = 'field_collector'
    and pc.pin_hash = crypt(p_secret, pc.pin_hash)
  order by u.created_at asc
  limit 1;

  if v_collector.id is not null then
    if coalesce(lower(v_collector.credential_status), 'active') = 'locked' then
      user_id := v_collector.id; email := v_collector.email; company_id := v_collector.company_id; office_id := null; full_name := v_collector.full_name; office_name := null; is_company_admin := false; auth_mode := 'collector'; redirect_to := '/office/collector'; login_status := 'locked'; attempts_remaining := 0; locked := true;
      return next; return;
    end if;
    update public.pin_credentials set failed_attempts = 0, locked_at = null, last_used_at = now(), updated_at = now() where id = v_collector.credential_id;
    user_id := v_collector.id; email := v_collector.email; company_id := v_collector.company_id; office_id := null; full_name := v_collector.full_name; office_name := null; is_company_admin := false; auth_mode := 'collector'; redirect_to := '/office/collector'; login_status := 'success'; attempts_remaining := 3; locked := false;
    return next; return;
  end if;

  with matches as (
    select distinct u.id, u.email, u.company_id, coalesce(u.default_office_id, uor.office_id) as resolved_office_id, u.full_name, pc.id as credential_id, pc.status as credential_status, pc.locked_at, o.office_name, u.created_at
    from public.users u
    join public.pin_credentials pc on pc.user_id = u.id
    left join public.user_office_roles uor on uor.user_id = u.id and uor.company_id = u.company_id
    join public.offices o on o.id = coalesce(u.default_office_id, uor.office_id)
    where coalesce(lower(u.status), 'active') = 'active'
      and coalesce(lower(pc.status), 'active') in ('active', 'locked')
      and coalesce(lower(o.status), 'active') = 'active'
      and pc.pin_hash = crypt(p_secret, pc.pin_hash)
      and coalesce(u.default_office_id, uor.office_id) is not null
  )
  select count(*), count(distinct resolved_office_id) into v_office_match_count, v_office_count from matches;

  if v_office_count > 1 then
    raise exception 'Duplicate office PIN detected. Contact Admin.' using errcode = 'P0001';
  end if;

  if v_office_match_count = 0 then
    select c.id into v_company_id from public.companies c order by c.created_at asc limit 1;
    insert into public.security_events(company_id, event_type, severity, user_agent, metadata)
    values (v_company_id, 'unified_login_failed', 'warning', p_user_agent, jsonb_build_object('reason', 'invalid_password_or_pin'));
    select count(*)::integer into v_recent_failures
    from public.security_events
    where event_type = 'unified_login_failed'
      and created_at >= now() - interval '30 minutes'
      and coalesce(user_agent, '') = coalesce(p_user_agent, '');
    v_remaining := greatest(0, 3 - v_recent_failures);
    user_id := null; email := null; company_id := v_company_id; office_id := null; full_name := null; office_name := null; is_company_admin := false; auth_mode := null; redirect_to := null; login_status := case when v_remaining = 0 then 'invalid_limit' else 'invalid' end; attempts_remaining := v_remaining; locked := false;
    return next; return;
  end if;

  with matches as (
    select distinct u.id, u.email, u.company_id, coalesce(u.default_office_id, uor.office_id) as resolved_office_id, u.full_name, pc.id as credential_id, pc.status as credential_status, pc.locked_at, o.office_name, u.created_at
    from public.users u
    join public.pin_credentials pc on pc.user_id = u.id
    left join public.user_office_roles uor on uor.user_id = u.id and uor.company_id = u.company_id
    join public.offices o on o.id = coalesce(u.default_office_id, uor.office_id)
    where coalesce(lower(u.status), 'active') = 'active'
      and coalesce(lower(pc.status), 'active') in ('active', 'locked')
      and coalesce(lower(o.status), 'active') = 'active'
      and pc.pin_hash = crypt(p_secret, pc.pin_hash)
      and coalesce(u.default_office_id, uor.office_id) is not null
  )
  select * into v_office from matches order by created_at asc limit 1;

  if coalesce(lower(v_office.credential_status), 'active') = 'locked' then
    user_id := v_office.id; email := v_office.email; company_id := v_office.company_id; office_id := v_office.resolved_office_id; full_name := v_office.full_name; office_name := v_office.office_name; is_company_admin := false; auth_mode := 'office'; redirect_to := '/office'; login_status := 'locked'; attempts_remaining := 0; locked := true;
    return next; return;
  end if;

  update public.pin_credentials set failed_attempts = 0, locked_at = null, last_used_at = now(), updated_at = now() where id = v_office.credential_id;
  user_id := v_office.id; email := v_office.email; company_id := v_office.company_id; office_id := v_office.resolved_office_id; full_name := v_office.full_name; office_name := v_office.office_name; is_company_admin := false; auth_mode := 'office'; redirect_to := '/office'; login_status := 'success'; attempts_remaining := 3; locked := false;
  return next;
end;
$$;

grant execute on function public.ddumba_v1_verify_unified_login(text, text) to anon, authenticated;
