create extension if not exists pgcrypto;

create table if not exists public.account_notification_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  account_id uuid not null references public.users(id) on delete cascade,
  account_type text not null default 'office',
  notification_email text,
  email_enabled boolean not null default true,
  email_verified boolean not null default false,
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified','pending','verified')),
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, account_id)
);

create table if not exists public.notification_email_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  notification_id uuid references public.notifications(id) on delete cascade,
  account_id uuid references public.users(id) on delete set null,
  account_type text,
  notification_email text,
  email_status text not null default 'pending'
    check (email_status in ('pending','sent','failed','skipped')),
  provider text,
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notifications
  add column if not exists email_delivery_status text not null default 'not_attempted'
    check (email_delivery_status in ('not_attempted','pending','sent','failed','skipped')),
  add column if not exists email_attempted_at timestamptz,
  add column if not exists email_sent_at timestamptz,
  add column if not exists email_error_message text;

create index if not exists idx_account_notification_settings_company_account
  on public.account_notification_settings(company_id, account_id);

create index if not exists idx_notification_email_logs_company_created
  on public.notification_email_logs(company_id, created_at desc);

create index if not exists idx_notification_email_logs_notification
  on public.notification_email_logs(notification_id, email_status);

alter table public.account_notification_settings enable row level security;
alter table public.notification_email_logs enable row level security;

drop policy if exists account_notification_settings_select on public.account_notification_settings;
create policy account_notification_settings_select
on public.account_notification_settings
for select
using (
  public.ddumba_v1_is_service_role()
  or public.ddumba_v1_is_company_admin()
  or account_id = auth.uid()
);

drop policy if exists account_notification_settings_insert on public.account_notification_settings;
create policy account_notification_settings_insert
on public.account_notification_settings
for insert
with check (
  public.ddumba_v1_is_service_role()
  or public.ddumba_v1_is_company_admin()
  or account_id = auth.uid()
);

drop policy if exists account_notification_settings_update on public.account_notification_settings;
create policy account_notification_settings_update
on public.account_notification_settings
for update
using (
  public.ddumba_v1_is_service_role()
  or public.ddumba_v1_is_company_admin()
  or account_id = auth.uid()
)
with check (
  public.ddumba_v1_is_service_role()
  or public.ddumba_v1_is_company_admin()
  or account_id = auth.uid()
);

drop policy if exists notification_email_logs_select on public.notification_email_logs;
create policy notification_email_logs_select
on public.notification_email_logs
for select
using (
  public.ddumba_v1_is_service_role()
  or public.ddumba_v1_is_company_admin()
  or account_id = auth.uid()
);

drop policy if exists notification_email_logs_insert on public.notification_email_logs;
create policy notification_email_logs_insert
on public.notification_email_logs
for insert
with check (
  public.ddumba_v1_is_service_role()
  or public.ddumba_v1_is_company_admin()
);

insert into public.account_notification_settings (
  company_id,
  account_id,
  account_type,
  notification_email,
  email_enabled,
  email_verified,
  verification_status,
  updated_by
)
select
  u.company_id,
  u.id,
  coalesce(nullif(u.account_type, ''), 'office'),
  nullif(u.email, ''),
  true,
  case when nullif(u.email, '') is not null then true else false end,
  case when nullif(u.email, '') is not null then 'verified' else 'unverified' end,
  null
from public.users u
where nullif(u.email, '') is not null
on conflict (company_id, account_id) do update
set notification_email = coalesce(public.account_notification_settings.notification_email, excluded.notification_email),
    account_type = excluded.account_type,
    updated_at = now();
